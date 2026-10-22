import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { backupStamp, nowIso, today } from "../lib/id";
import { getFS, isTauri, useFolder } from "../lib/fs";
import * as repo from "../lib/repo";
import {
  LocalPaths,
  SettleTracker,
  SyncReport,
  decideBoot,
  isReady,
  localPaths,
  readSession,
  readSource,
  readState,
  sameFolder,
  startOfflineSession,
  syncBack,
  writeState,
} from "../lib/offline";
import { seedDemoData } from "../lib/demo";
import {
  isLessonRunning,
  isSeatingLocked,
  lessonRunningKey,
  markUnmarkedPresent,
  readLessonRunning,
  readLessonStart,
  readSeatedAt,
  seatedKey,
} from "../lib/lessonState";
import { PIN_HINT, hashPin, isValidPin, pinMatches } from "../lib/pin";
import { enterDock, enterFullscreen, restoreWindow } from "../lib/teachingWindow";
import { setTimeZone } from "../lib/time";
import { DASHBOARDS_ID } from "../plugins/registry";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  BathroomVisit,
  BehaviourCode,
  examWeightFor,
  BehaviourEvent,
  ClassInfo,
  CognitiveLevel,
  DEFAULT_ROOM_CONFIG,
  DEFAULT_SEATING_PREFS,
  DEFAULT_USER_PREFS,
  Desk,
  LessonRecord,
  Mark,
  QuestionMark,
  RoomConfig,
  SeatAssignment,
  SeatingPrefs,
  Student,
  TeachingStyle,
  TimerPreset,
  TopicEntry,
  UserPrefs,
} from "../lib/types";

export type View =
  | "home"
  | "roster"
  | "attendance"
  | "layout"
  | "seating"
  | "lesson"
  | "behaviourLog"
  | "assessments"
  | "notes"
  | "plugin"
  | "settings";

const DATA_DIR_KEY = "classkernel.dataDir";
const KEEP_COPY_KEY = "classkernel.keepLocalCopy";

/** How long the launch waits for a missing data folder before opening this computer's copy. */
export const WAIT_FOR_FOLDER_MS = 30_000;

/** Whether this computer keeps its own copy of the data folder (Settings → Data; on unless switched off). */
export function keepLocalCopy(): boolean {
  try {
    return localStorage.getItem(KEEP_COPY_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Where the data comes from when it isn't simply the data folder:
 * - waiting: the saved folder isn't there yet (Google Drive still starting);
 * - copy: working from this computer's copy; `back` once the folder has
 *   returned and settled, while the copy-back waits for a safe moment;
 * - syncing: copying this computer's changes back into the folder.
 */
export type FolderStatus =
  | { kind: "waiting"; realDir: string; since: number; copyAvailable: boolean }
  | { kind: "copy"; realDir: string; since: string; copyRefreshedAt: string; back: boolean }
  | { kind: "syncing"; realDir: string };

/** A toast message, optionally with a single action (usually Undo). */
export interface Toast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** An in-app modal replacing window.confirm / window.prompt. */
export interface DialogRequest {
  kind: "confirm" | "prompt";
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  placeholder?: string;
  initial?: string;
  /** Mask the prompt's input and offer a number pad (PIN entry). */
  secret?: boolean;
}

export interface AppState {
  booted: boolean;
  demoMode: boolean;
  dataDir: string | null;
  classes: ClassInfo[];
  currentClass: string | null;
  view: View;
  /** Distraction-free teaching layout: hides all chrome, shows only the seating view. */
  focusMode: boolean;
  /** Which teaching mode is showing while focusMode is on. */
  focusStyle: TeachingStyle;
  /**
   * When the open class's seats were last assigned (localStorage, see
   * lessonState.ts). Mirrored here so every Randomise button re-renders the
   * moment the lock is set or lifted.
   */
  seatingLockedAt: string | null;
  /**
   * When the open class's lesson was started (localStorage, see lessonState.ts),
   * mirrored so the Start / End lesson buttons flip the moment it changes.
   */
  lessonRunningSince: string | null;
  /** Id of the plugin the "plugin" view is showing (see src/plugins/registry.ts). */
  activePlugin: string | null;
  /** The student the Dashboard's Student tab shows; null = the Class tab. */
  dashboardStudent: string | null;
  toast: Toast | null;
  dialog: DialogRequest | null;
  /**
   * Privacy mode covers marks/analysis screens until the teacher taps "Show
   * student details". Deliberately not persisted, and cleared on every
   * navigation / class switch / teaching-mode entry, so leaving a sensitive
   * screen always re-arms the cover.
   */
  sensitiveRevealed: boolean;
  /** Set when a file write failed; the teacher's edits are still in memory. */
  saveError: { label: string } | null;
  /** Null while the data folder itself is open (see FolderStatus). */
  folderStatus: FolderStatus | null;
  /** What the last copy-back did, until the teacher dismisses it. */
  syncReport: SyncReport | null;

  behaviourCodes: BehaviourCode[];
  students: Student[];
  attendance: AttendanceEntry[];
  behaviourEvents: BehaviourEvent[];
  bathroomVisits: BathroomVisit[];
  desks: Desk[];
  seating: SeatAssignment[];
  seatingPrefs: SeatingPrefs;
  lessons: LessonRecord[];
  assessments: Assessment[];
  marks: Mark[];
  assessmentQuestions: AssessmentQuestion[];
  questionMarks: QuestionMark[];
  /** Parent-report comment per student id (report_comments.csv). */
  reportComments: Record<string, string>;
  roomConfig: RoomConfig;
  layoutTemplates: string[];
  // App-wide, loaded once with the data folder.
  topics: TopicEntry[];
  cognitiveLevels: CognitiveLevel[];
  userPrefs: UserPrefs;
  timerPresets: TimerPreset[];

  boot(): Promise<void>;
  /**
   * Open a folder the teacher chose. While this computer has changes not yet
   * copied back, the chosen folder is taken as where the data folder is now:
   * the changes are copied into it first (after a confirm).
   */
  chooseDataDir(path: string): Promise<void>;
  pickAndSetDataDir(): Promise<void>;
  /** Load a folder into the app: the data folder ("data") or this computer's copy ("copy"). */
  openFolder(path: string, opts: { kind: "data" | "copy"; realDir?: string; create?: boolean; keepClass?: boolean }): Promise<void>;
  /** Stop waiting for the data folder and work from this computer's copy. */
  openLocalCopy(): Promise<void>;
  /** Copy this computer's changes back into the data folder now (it must be ready). */
  syncNow(): Promise<void>;
  dismissSyncReport(): void;
  /** Switch this computer's copy on or off (Settings → Data); off also removes it. */
  setKeepLocalCopy(on: boolean): Promise<void>;
  setView(view: View): void;
  /** Open one of the enabled plugins full-pane. */
  openPlugin(id: string): void;
  /** Open the Dashboard on one student's tab (null = back to the Class tab). */
  openStudentDashboard(studentId: string | null): void;
  /** Enter or leave teaching mode; style defaults to the one chosen in Settings. */
  setFocusMode(on: boolean, style?: TeachingStyle): void;
  /** Whether the open class's seats have already been assigned this lesson. */
  seatingLocked(): boolean;
  /** Record a seat assignment for the open class — locks it for the lesson. */
  markSeated(): void;
  /** Lift the lock for the open class (End lesson, or after the PIN). */
  unlockSeating(): void;
  /** Ask for the reseat PIN (creating one if none is set); true if unlocked. */
  requestSeatingUnlock(): Promise<boolean>;
  /** Whether the open class has a lesson running (started, not yet ended). */
  lessonRunning(): boolean;
  /**
   * Start the open class's lesson and mark every student without a mark today
   * present. Resolves to how many were marked, or null if one was already running.
   */
  startLesson(): Promise<number | null>;
  /** The lesson is over (End lesson): the button goes back to Start lesson. */
  stopLesson(): void;
  showToast(message: string, action?: { label: string; run: () => void }): void;
  revealSensitive(): void;
  confirmDialog(opts: Omit<DialogRequest, "kind" | "placeholder" | "initial">): Promise<boolean>;
  promptDialog(opts: Omit<DialogRequest, "kind" | "danger">): Promise<string | null>;
  /** Called by the dialog component with the outcome (false/null = cancelled). */
  resolveDialog(result: boolean | string | null): void;
  retrySave(): Promise<void>;

  createClass(info: ClassInfo): Promise<void>;
  /** Every class's students, read from disk (the current class's from memory). */
  loadAllStudents(): Promise<Map<string, Student[]>>;
  /**
   * Write a classes-and-students import: each class's details, and the full
   * student list of each class it touched. Opens the first new class when no
   * class was open.
   */
  importRoster(classes: ClassInfo[], students: Map<string, Student[]>): Promise<void>;
  openClass(name: string): Promise<void>;
  updateClassInfo(info: ClassInfo): Promise<void>;
  renameClass(oldName: string, newName: string): Promise<void>;

  setStudents(students: Student[]): Promise<void>;
  setAttendance(entries: AttendanceEntry[]): Promise<void>;
  addBehaviourEvent(event: BehaviourEvent): Promise<void>;
  removeBehaviourEvent(timestamp: string, studentId: string, code: string): Promise<void>;
  /** Record several events in one write (batch entry). */
  addBehaviourEvents(events: BehaviourEvent[]): Promise<void>;
  /** Undo a batch: remove the events with this timestamp and code for these students. */
  removeBehaviourEvents(timestamp: string, code: string, studentIds: string[]): Promise<void>;
  setBehaviourEvents(events: BehaviourEvent[]): Promise<void>;
  setBehaviourCodes(codes: BehaviourCode[]): Promise<void>;
  setBathroomVisits(visits: BathroomVisit[]): Promise<void>;
  /** Begin a bathroom trip for the student (no-op if one is already running). */
  startBathroomVisit(studentId: string): Promise<void>;
  /** Close the student's running bathroom trip, stamping the return time. */
  endBathroomVisit(studentId: string): Promise<void>;
  setDesks(desks: Desk[]): Promise<void>;
  setRoomConfig(config: RoomConfig): Promise<void>;
  setSeating(seats: SeatAssignment[]): Promise<void>;
  setSeatingPrefs(prefs: SeatingPrefs): Promise<void>;
  /** Save (or clear, with "") one student's parent-report comment. */
  setReportComment(studentId: string, comment: string): Promise<void>;
  addLessonRecords(records: LessonRecord[]): Promise<void>;
  setAssessments(assessments: Assessment[]): Promise<void>;
  setMarks(marks: Mark[]): Promise<void>;
  setAssessmentQuestions(questions: AssessmentQuestion[]): Promise<void>;
  setQuestionMarks(marks: QuestionMark[]): Promise<void>;
  setTopics(topics: TopicEntry[]): Promise<void>;
  setCognitiveLevels(levels: CognitiveLevel[]): Promise<void>;
  setUserPrefs(prefs: UserPrefs): Promise<void>;
  setTimerPresets(presets: TimerPreset[]): Promise<void>;

  refreshLayoutTemplates(): Promise<void>;
  saveLayoutTemplate(name: string): Promise<void>;
  applyLayoutTemplate(name: string): Promise<void>;
  deleteLayoutTemplate(name: string): Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
// One poll at a time: for the missing folder at launch, or for its return.
let pollTimer: ReturnType<typeof setTimeout> | undefined;
const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
};
/** The waits involved (the browser demo's ?simulate=folder-missing shortens them). */
export const folderTiming = { waitMs: WAIT_FOR_FOLDER_MS, pollMs: 2000, returnPollMs: 10_000, settleMs: 30_000 };
/** Set in the browser demo with ?simulate=folder-missing: hides the demo folder after seeding. */
let simulateMissingFolder: ((dataDir: string) => Promise<void>) | null = null;
export function setSimulateMissingFolder(fn: ((dataDir: string) => Promise<void>) | null): void {
  simulateMissingFolder = fn;
}
let dialogResolve: ((result: boolean | string | null) => void) | null = null;
let lastFailedSave: (() => Promise<void>) | null = null;

export const useApp = create<AppState>((set, get) => {
  // Wrap every file write so a failure surfaces as a banner instead of a
  // silent unhandled rejection. The in-memory edit is kept either way.
  const guarded = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      if (get().saveError) {
        set({ saveError: null });
        lastFailedSave = null;
      }
    } catch (e) {
      console.error(`Save failed: ${label}`, e);
      lastFailedSave = fn;
      set({ saveError: { label } });
    }
  };

  return {
  booted: false,
  demoMode: false,
  dataDir: null,
  classes: [],
  currentClass: null,
  view: "home",
  focusMode: false,
  focusStyle: "room",
  seatingLockedAt: null,
  lessonRunningSince: null,
  activePlugin: null,
  dashboardStudent: null,
  toast: null,
  dialog: null,
  sensitiveRevealed: false,
  saveError: null,
  folderStatus: null,
  syncReport: null,

  behaviourCodes: [],
  students: [],
  attendance: [],
  behaviourEvents: [],
  bathroomVisits: [],
  desks: [],
  seating: [],
  seatingPrefs: DEFAULT_SEATING_PREFS,
  lessons: [],
  assessments: [],
  marks: [],
  assessmentQuestions: [],
  questionMarks: [],
  reportComments: {},
  roomConfig: DEFAULT_ROOM_CONFIG,
  layoutTemplates: [],
  topics: [],
  cognitiveLevels: [],
  userPrefs: DEFAULT_USER_PREFS,
  timerPresets: [],

  async boot() {
    try {
      if (!isTauri()) {
        // Browser demo mode: seed an in-memory dataset so every view works.
        const dataDir = await seedDemoData();
        set({ demoMode: true });
        if (simulateMissingFolder) {
          await simulateMissingFolder(dataDir);
        } else {
          await get().openFolder(dataDir, { kind: "data" });
          return;
        }
      }
      const paths = await localPaths();
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(DATA_DIR_KEY);
      } catch {
        // Fall back to the copy's own record below.
      }
      saved ??= (await readState(paths))?.dataDir ?? null;
      const session = await readSession(paths);
      const target = session?.realDir ?? saved;
      const plan = decideBoot({
        savedDir: saved,
        session,
        ready: target ? await isReady(target) : false,
        source: await readSource(paths),
      });
      if (plan.kind === "open") {
        try {
          await get().openFolder(plan.dir, { kind: "data" });
        } catch (e) {
          // The folder went away (or turned unreadable) while loading.
          console.warn("Couldn't open the data folder", e);
          waitForFolder(plan.dir, !!(await readSource(paths)));
        }
      } else if (plan.kind === "copy") {
        await openCopy(paths, plan.realDir);
      } else if (plan.kind === "wait") {
        waitForFolder(plan.realDir, plan.copyAvailable);
      }
    } catch (e) {
      console.warn("Start-up failed", e);
    } finally {
      set({ booted: true });
    }
  },

  async chooseDataDir(path: string) {
    const paths = await localPaths();
    if (await readSession(paths)) {
      const ok = await get().confirmDialog({
        title: "Copy this computer's changes there?",
        body: `This computer has changes made while your data folder wasn't available. They'll be copied into ${path} (joined with anything changed there meanwhile) before it opens.`,
        confirmLabel: "Copy and open",
      });
      if (!ok) return;
      stopPolling();
      set({ folderStatus: { kind: "syncing", realDir: path } });
      try {
        await getFS().flush();
        set({ syncReport: await syncBack(paths, path, backupStamp()) });
      } catch (e) {
        console.warn("Copying back failed", e);
        const session = await readSession(paths);
        if (session) await openCopy(paths, session.realDir);
        get().showToast("Couldn't copy your changes there — still working from this computer's copy");
        return;
      }
    }
    stopPolling();
    await get().openFolder(path, { kind: "data", create: true });
  },

  async pickAndSetDataDir() {
    const picked = await getFS().pickFolder();
    if (picked) await get().chooseDataDir(picked);
  },

  async openFolder(path, { kind, realDir, create = false, keepClass = false }) {
    const fs = getFS();
    const paths = await localPaths();
    const copying = (isTauri() || !!simulateMissingFolder) && kind === "data";
    if (kind === "data") {
      await repo.ensureDataDir(path, create);
      if (isTauri()) {
        try {
          localStorage.setItem(DATA_DIR_KEY, path);
        } catch {
          // state.json below still remembers it.
        }
      }
      if (copying) {
        const keep = keepLocalCopy();
        const source = await readSource(paths);
        if (keep && source && !sameFolder(source.realDir, path) && !(await readSession(paths))) {
          // A copy of another folder: start this one's afresh.
          await fs.removeLocal(paths.copy).catch((e) => console.warn("Couldn't clear the old copy", e));
        }
        void writeState(paths, path).catch((e) => console.warn("Couldn't record the data folder", e));
        // Saves made from now on wait for the snapshot (QueuedFS), so they are
        // mirrored on top of the refreshed copy, never under it.
        useFolder(path, keep ? paths.copy : null);
        // Copied in the background while the classes load, refreshing this
        // computer's copy in the same pass; it is the folder as it was opened.
        fs.snapshot(path, backupStamp(), repo.BACKUP_DAYS_TO_KEEP, keep ? { to: paths.copy, guard: paths.session } : undefined)
          .then(async () => {
            if (keep && !(await readSession(paths))) {
              await fs.writeAtomic(paths.source, JSON.stringify({ realDir: path, refreshedAt: nowIso() }));
            }
          })
          .catch((e) => console.warn("Backup snapshot failed", e));
      } else {
        useFolder(path, null);
      }
    } else {
      // The copy is its own root and is never mirrored, snapshotted or remembered as the data folder.
      useFolder(path, null);
    }
    const [classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets] = await Promise.all([
      repo.listClasses(path),
      repo.loadBehaviourCodes(path),
      repo.listLayoutTemplates(path),
      repo.loadTopics(path),
      repo.loadCognitiveLevels(path),
      repo.loadUserPrefs(path),
      repo.loadTimerPresets(path),
    ]);
    setTimeZone(userPrefs.timeZone);
    const previous = get().currentClass;
    set({ dataDir: path, classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, currentClass: null });
    if (kind === "data") set({ folderStatus: null });
    else if (realDir) set({ folderStatus: { kind: "copy", realDir, since: nowIso(), copyRefreshedAt: "", back: false } });
    const active = classes.filter((c) => !c.archived);
    const reopen = keepClass && previous && classes.some((c) => c.name === previous) ? previous : active[0]?.name;
    if (reopen) await get().openClass(reopen);
  },

  async openLocalCopy() {
    const status = get().folderStatus;
    if (status?.kind !== "waiting") return;
    stopPolling();
    await openCopy(await localPaths(), status.realDir);
  },

  async syncNow() {
    const status = get().folderStatus;
    if (status?.kind !== "copy") return;
    if (!(await isReady(status.realDir))) {
      get().showToast("Your data folder still isn't available");
      return;
    }
    await copyBack(status.realDir);
  },

  dismissSyncReport() {
    set({ syncReport: null });
  },

  async setKeepLocalCopy(on) {
    try {
      localStorage.setItem(KEEP_COPY_KEY, on ? "1" : "0");
    } catch {
      // Applies for this session only.
    }
    const { dataDir, folderStatus } = get();
    if (folderStatus) return;
    const paths = await localPaths();
    if (on) {
      if (dataDir) await get().openFolder(dataDir, { kind: "data", keepClass: true });
    } else {
      useFolder(dataDir, null);
      if (!(await readSession(paths))) await getFS().removeLocal(paths.copy);
    }
  },

  setView(view) {
    // Leaving the plugin view closes the plugin, so its frame is torn down
    // rather than kept alive in the background.
    set({ view, sensitiveRevealed: false, ...(view === "plugin" ? {} : { activePlugin: null }) });
  },

  openPlugin(id) {
    set({ view: "plugin", activePlugin: id, sensitiveRevealed: false });
  },
  openStudentDashboard(studentId) {
    // The dashboards are a plugin. Moving within them keeps the privacy
    // reveal; arriving from another screen re-arms it like any navigation.
    const { view, activePlugin } = get();
    const within = view === "plugin" && activePlugin === DASHBOARDS_ID;
    set({
      view: "plugin",
      activePlugin: DASHBOARDS_ID,
      dashboardStudent: studentId,
      ...(within ? {} : { sensitiveRevealed: false }),
    });
  },

  setFocusMode(on, style) {
    const { userPrefs, focusStyle } = get();
    const nextStyle = style ?? (on ? userPrefs.teachingStyle : focusStyle);
    set({ focusMode: on, focusStyle: nextStyle, ...(on ? { sensitiveRevealed: false } : {}) });
    // The room plan owns the whole panel; the strip docks to one edge so
    // slides keep the rest. Both are best-effort (see teachingWindow.ts).
    if (!on) void restoreWindow();
    else if (nextStyle === "strip") void enterDock(userPrefs.dockSide);
    else void enterFullscreen();
  },

  seatingLocked() {
    const { currentClass, seatingLockedAt } = get();
    return !!currentClass && isSeatingLocked(seatingLockedAt, readLessonStart(currentClass), today());
  },

  markSeated() {
    const { currentClass } = get();
    if (!currentClass) return;
    const at = nowIso();
    try {
      localStorage.setItem(seatedKey(currentClass), at);
    } catch {
      // The in-memory lock still holds for this session.
    }
    set({ seatingLockedAt: at });
  },

  unlockSeating() {
    const { currentClass } = get();
    if (!currentClass) return;
    try {
      localStorage.removeItem(seatedKey(currentClass));
    } catch {
      // Nothing stored to clear.
    }
    set({ seatingLockedAt: null });
  },

  async requestSeatingUnlock() {
    const { userPrefs, promptDialog, showToast } = get();
    if (!userPrefs.reseatPinHash) {
      // No PIN yet: the first unlock sets one, so every later one needs it.
      const pin = await promptDialog({
        title: "Create a reseat PIN",
        body: `Seats can be assigned once per lesson. Choose a PIN (${PIN_HINT}) to unlock another assignment — you'll need it every time from now on. You can change it in Settings → Teaching mode.`,
        confirmLabel: "Next",
        secret: true,
      });
      if (pin === null) return false;
      if (!isValidPin(pin)) {
        showToast(`A PIN must be ${PIN_HINT} — seat assignment stays locked`);
        return false;
      }
      const again = await promptDialog({ title: "Type the PIN again", confirmLabel: "Set PIN", secret: true });
      if (again === null) return false;
      if (again !== pin) {
        showToast("The PINs didn't match — seat assignment stays locked");
        return false;
      }
      await get().setUserPrefs({ ...get().userPrefs, reseatPinHash: await hashPin(pin) });
    } else {
      const pin = await promptDialog({
        title: "Enter PIN to reassign seats",
        body: "Seats have already been assigned this lesson.",
        confirmLabel: "Unlock",
        secret: true,
      });
      if (pin === null) return false;
      if (!(await pinMatches(pin, userPrefs.reseatPinHash))) {
        showToast("Incorrect PIN — seat assignment stays locked");
        return false;
      }
    }
    get().unlockSeating();
    showToast("Seat assignment unlocked");
    return true;
  },

  lessonRunning() {
    const { currentClass, lessonRunningSince } = get();
    return !!currentClass && isLessonRunning(lessonRunningSince, readLessonStart(currentClass), today());
  },

  async startLesson() {
    const { currentClass, students, attendance, setAttendance } = get();
    if (!currentClass || get().lessonRunning()) return null;
    const at = nowIso();
    try {
      localStorage.setItem(lessonRunningKey(currentClass), at);
    } catch {
      // It still counts as running for this session.
    }
    set({ lessonRunningSince: at });
    const marked = markUnmarkedPresent(
      attendance,
      students.map((s) => s.id),
      today(),
    );
    if (marked.added) await setAttendance(marked.attendance);
    return marked.added;
  },

  stopLesson() {
    const { currentClass } = get();
    if (!currentClass) return;
    try {
      localStorage.removeItem(lessonRunningKey(currentClass));
    } catch {
      // Nothing stored to clear.
    }
    set({ lessonRunningSince: null });
  },

  showToast(message, action) {
    set({ toast: action ? { message, actionLabel: action.label, onAction: action.run } : { message } });
    if (toastTimer) clearTimeout(toastTimer);
    // Leave undo-able toasts up longer.
    toastTimer = setTimeout(() => set({ toast: null }), action ? 6000 : 2500);
  },

  revealSensitive() {
    set({ sensitiveRevealed: true });
  },

  confirmDialog(opts) {
    dialogResolve?.(false);
    return new Promise<boolean>((resolve) => {
      dialogResolve = resolve as (r: boolean | string | null) => void;
      set({ dialog: { kind: "confirm", ...opts } });
    });
  },

  promptDialog(opts) {
    dialogResolve?.(null);
    return new Promise<string | null>((resolve) => {
      dialogResolve = resolve as (r: boolean | string | null) => void;
      set({ dialog: { kind: "prompt", ...opts } });
    });
  },

  resolveDialog(result) {
    const resolve = dialogResolve;
    dialogResolve = null;
    set({ dialog: null });
    resolve?.(result);
  },

  async retrySave() {
    const fn = lastFailedSave;
    if (!fn) {
      set({ saveError: null });
      return;
    }
    try {
      await fn();
      lastFailedSave = null;
      set({ saveError: null });
      get().showToast("Saved");
    } catch (e) {
      console.error("Retry save failed", e);
      get().showToast("Still couldn't save — check the data folder is reachable");
    }
  },

  async createClass(info) {
    const { dataDir } = get();
    if (!dataDir) return;
    await repo.saveClassInfo(dataDir, info);
    set({ classes: await repo.listClasses(dataDir) });
    await get().openClass(info.name);
  },

  async loadAllStudents() {
    const { dataDir, classes, currentClass, students } = get();
    const out = new Map<string, Student[]>();
    if (!dataDir) return out;
    for (const c of classes) out.set(c.name, c.name === currentClass ? students : await repo.loadStudents(dataDir, c.name));
    return out;
  },

  async importRoster(classes, students) {
    const { dataDir, currentClass } = get();
    if (!dataDir) return;
    await guarded("classes and students", async () => {
      for (const info of classes) await repo.saveClassInfo(dataDir, info);
      for (const [name, list] of students) await repo.saveStudents(dataDir, name, list);
    });
    set({ classes: await repo.listClasses(dataDir) });
    if (currentClass && students.has(currentClass)) set({ students: students.get(currentClass)! });
    else if (!currentClass && classes.length) await get().openClass(classes[0].name);
  },

  async openClass(name) {
    const { dataDir } = get();
    if (!dataDir) return;
    const [
      students,
      attendance,
      behaviourEvents,
      bathroomVisits,
      desks,
      seating,
      seatingPrefs,
      lessons,
      assessments,
      marks,
      assessmentQuestions,
      questionMarks,
      roomConfig,
      reportComments,
    ] = await Promise.all([
      repo.loadStudents(dataDir, name),
      repo.loadAttendance(dataDir, name),
      repo.loadBehaviourEvents(dataDir, name),
      repo.loadBathroomVisits(dataDir, name),
      repo.loadDesks(dataDir, name),
      repo.loadSeating(dataDir, name),
      repo.loadSeatingPrefs(dataDir, name),
      repo.loadLessons(dataDir, name),
      repo.loadAssessments(dataDir, name),
      repo.loadMarks(dataDir, name),
      repo.loadAssessmentQuestions(dataDir, name),
      repo.loadQuestionMarks(dataDir, name),
      repo.loadRoomConfig(dataDir, name),
      repo.loadReportComments(dataDir, name),
    ]);
    set({
      currentClass: name,
      dashboardStudent: null,
      students,
      attendance,
      behaviourEvents,
      bathroomVisits,
      desks,
      seating,
      seatingPrefs,
      lessons,
      assessments,
      marks,
      assessmentQuestions,
      questionMarks,
      roomConfig,
      reportComments,
      seatingLockedAt: readSeatedAt(name),
      lessonRunningSince: readLessonRunning(name),
      sensitiveRevealed: false,
    });
  },

  async updateClassInfo(info) {
    const { dataDir } = get();
    if (!dataDir) return;
    await repo.saveClassInfo(dataDir, info);
    set({ classes: await repo.listClasses(dataDir) });
  },

  async renameClass(oldName, newName) {
    const { dataDir, classes, folderStatus } = get();
    if (!dataDir || !newName || oldName === newName || folderStatus) return;
    const info = classes.find((c) => c.name === oldName);
    if (!info) return;
    await repo.renameClass(dataDir, oldName, newName);
    await repo.saveClassInfo(dataDir, { ...info, name: newName });
    set({ classes: await repo.listClasses(dataDir) });
    if (get().currentClass === oldName) await get().openClass(newName);
  },

  async setStudents(students) {
    const { dataDir, currentClass } = get();
    set({ students });
    if (dataDir && currentClass) await guarded("students", () => repo.saveStudents(dataDir, currentClass, students));
  },

  async setAttendance(attendance) {
    const { dataDir, currentClass } = get();
    set({ attendance });
    if (dataDir && currentClass) await guarded("attendance", () => repo.saveAttendance(dataDir, currentClass, attendance));
  },

  async addBehaviourEvent(event) {
    const { dataDir, currentClass, behaviourEvents } = get();
    const next = [...behaviourEvents, event];
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await guarded("behaviour events", () => repo.saveBehaviourEvents(dataDir, currentClass, next));
  },

  async removeBehaviourEvent(timestamp, studentId, code) {
    const { dataDir, currentClass, behaviourEvents } = get();
    const idx = behaviourEvents.findIndex(
      (e) => e.timestamp === timestamp && e.studentId === studentId && e.code === code,
    );
    if (idx < 0) return;
    const next = behaviourEvents.filter((_, i) => i !== idx);
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await guarded("behaviour events", () => repo.saveBehaviourEvents(dataDir, currentClass, next));
  },

  async addBehaviourEvents(events) {
    if (events.length === 0) return;
    const { dataDir, currentClass, behaviourEvents } = get();
    const next = [...behaviourEvents, ...events];
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await guarded("behaviour events", () => repo.saveBehaviourEvents(dataDir, currentClass, next));
  },

  async removeBehaviourEvents(timestamp, code, studentIds) {
    const { dataDir, currentClass, behaviourEvents } = get();
    const ids = new Set(studentIds);
    const next = behaviourEvents.filter((e) => !(e.timestamp === timestamp && e.code === code && ids.has(e.studentId)));
    if (next.length === behaviourEvents.length) return;
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await guarded("behaviour events", () => repo.saveBehaviourEvents(dataDir, currentClass, next));
  },

  async setBehaviourEvents(events) {
    const { dataDir, currentClass } = get();
    set({ behaviourEvents: events });
    if (dataDir && currentClass) await guarded("behaviour events", () => repo.saveBehaviourEvents(dataDir, currentClass, events));
  },

  async setBehaviourCodes(codes) {
    const { dataDir } = get();
    set({ behaviourCodes: codes });
    if (dataDir) await guarded("behaviour buttons", () => repo.saveBehaviourCodes(dataDir, codes));
  },

  async setBathroomVisits(bathroomVisits) {
    const { dataDir, currentClass } = get();
    set({ bathroomVisits });
    if (dataDir && currentClass) await guarded("the bathroom log", () => repo.saveBathroomVisits(dataDir, currentClass, bathroomVisits));
  },

  async startBathroomVisit(studentId) {
    const { bathroomVisits } = get();
    if (bathroomVisits.some((v) => v.studentId === studentId && !v.end)) return;
    await get().setBathroomVisits([...bathroomVisits, { date: today(), studentId, start: nowIso(), end: "" }]);
  },

  async endBathroomVisit(studentId) {
    const { bathroomVisits } = get();
    if (!bathroomVisits.some((v) => v.studentId === studentId && !v.end)) return;
    await get().setBathroomVisits(
      bathroomVisits.map((v) => (v.studentId === studentId && !v.end ? { ...v, end: nowIso() } : v)),
    );
  },

  async setDesks(desks) {
    const { dataDir, currentClass } = get();
    set({ desks });
    if (dataDir && currentClass) await guarded("the room layout", () => repo.saveDesks(dataDir, currentClass, desks));
  },

  async setRoomConfig(roomConfig) {
    const { dataDir, currentClass } = get();
    set({ roomConfig });
    if (dataDir && currentClass) await guarded("room settings", () => repo.saveRoomConfig(dataDir, currentClass, roomConfig));
  },

  async setSeating(seating) {
    const { dataDir, currentClass } = get();
    set({ seating });
    if (dataDir && currentClass) await guarded("the seating plan", () => repo.saveSeating(dataDir, currentClass, seating));
  },

  async setSeatingPrefs(seatingPrefs) {
    const { dataDir, currentClass } = get();
    set({ seatingPrefs });
    if (dataDir && currentClass) await guarded("seating rules", () => repo.saveSeatingPrefs(dataDir, currentClass, seatingPrefs));
  },

  async setReportComment(studentId, comment) {
    const { dataDir, currentClass, reportComments } = get();
    const next = { ...reportComments };
    if (comment.trim()) next[studentId] = comment;
    else delete next[studentId];
    set({ reportComments: next });
    if (dataDir && currentClass) await guarded("report comments", () => repo.saveReportComments(dataDir, currentClass, next));
  },

  async addLessonRecords(records) {
    const { dataDir, currentClass, lessons } = get();
    const next = [...lessons, ...records];
    set({ lessons: next });
    if (dataDir && currentClass) await guarded("lesson history", () => repo.saveLessons(dataDir, currentClass, next));
  },

  async refreshLayoutTemplates() {
    const { dataDir } = get();
    if (dataDir) set({ layoutTemplates: await repo.listLayoutTemplates(dataDir) });
  },

  async saveLayoutTemplate(name) {
    const { dataDir, desks, roomConfig } = get();
    if (!dataDir) return;
    await repo.saveLayoutTemplate(dataDir, name, desks, roomConfig);
    await get().refreshLayoutTemplates();
  },

  async applyLayoutTemplate(name) {
    const { dataDir, currentClass, roomConfig } = get();
    if (!dataDir || !currentClass) return;
    const { desks, config } = await repo.loadLayoutTemplate(dataDir, name);
    // Keep this class's own view crop; take everything else from the template.
    const nextConfig: RoomConfig = { ...config, crop: roomConfig.crop };
    set({ desks, roomConfig: nextConfig });
    await repo.saveDesks(dataDir, currentClass, desks);
    await repo.saveRoomConfig(dataDir, currentClass, nextConfig);
  },

  async deleteLayoutTemplate(name) {
    const { dataDir, folderStatus } = get();
    if (!dataDir || folderStatus) return;
    await repo.deleteLayoutTemplate(dataDir, name);
    await get().refreshLayoutTemplates();
  },

  async setAssessments(assessments) {
    const { dataDir, currentClass } = get();
    set({ assessments });
    if (dataDir && currentClass) await guarded("assessments", () => repo.saveAssessments(dataDir, currentClass, assessments));
  },

  async setMarks(marks) {
    const { dataDir, currentClass } = get();
    set({ marks });
    if (dataDir && currentClass) await guarded("marks", () => repo.saveMarks(dataDir, currentClass, marks));
  },

  async setAssessmentQuestions(assessmentQuestions) {
    const { dataDir, currentClass } = get();
    set({ assessmentQuestions });
    if (dataDir && currentClass) await guarded("assessment questions", () => repo.saveAssessmentQuestions(dataDir, currentClass, assessmentQuestions));
  },

  async setQuestionMarks(questionMarks) {
    const { dataDir, currentClass } = get();
    set({ questionMarks });
    if (dataDir && currentClass) await guarded("question marks", () => repo.saveQuestionMarks(dataDir, currentClass, questionMarks));
  },

  async setTopics(topics) {
    const { dataDir } = get();
    set({ topics });
    if (dataDir) await guarded("topics", () => repo.saveTopics(dataDir, topics));
  },

  async setCognitiveLevels(cognitiveLevels) {
    const { dataDir } = get();
    set({ cognitiveLevels });
    if (dataDir) await guarded("cognitive levels", () => repo.saveCognitiveLevels(dataDir, cognitiveLevels));
  },

  async setUserPrefs(userPrefs) {
    const { dataDir } = get();
    // Before the state update, so every view re-renders in the new zone.
    setTimeZone(userPrefs.timeZone);
    set({ userPrefs });
    if (dataDir) await guarded("settings", () => repo.saveUserPrefs(dataDir, userPrefs));
  },

  async setTimerPresets(timerPresets) {
    const { dataDir } = get();
    set({ timerPresets });
    if (dataDir) await guarded("timer presets", () => repo.saveTimerPresets(dataDir, timerPresets));
  },
  };
});

/**
 * Subscribe to just these fields of the store: the component re-renders only
 * when one of them changes, not on every toast, tap or keystroke elsewhere in
 * the app (which a bare `useApp()` does). Actions never change, so picking
 * them costs nothing.
 */
export function useAppPick<K extends keyof AppState>(...keys: K[]): Pick<AppState, K> {
  return useApp(
    useShallow((s) => {
      const picked = {} as Pick<AppState, K>;
      for (const k of keys) picked[k] = s[k];
      return picked;
    }),
  );
}

/** Work from this computer's copy, keeping its starting point for the copy-back, and watch for the folder. */
async function openCopy(paths: LocalPaths, realDir: string): Promise<void> {
  const session = await startOfflineSession(paths, realDir);
  await useApp.getState().openFolder(paths.copy, { kind: "copy", realDir });
  useApp.setState({
    folderStatus: { kind: "copy", realDir, since: session.since, copyRefreshedAt: session.copyRefreshedAt, back: false },
  });
  watchForReturn(realDir);
}

/** At launch: poll for the saved folder; after the wait, open this computer's copy if there is one. */
function waitForFolder(realDir: string, copyAvailable: boolean): void {
  const since = Date.now();
  useApp.setState({ dataDir: null, folderStatus: { kind: "waiting", realDir, since, copyAvailable } });
  const stillWaiting = () => {
    const st = useApp.getState().folderStatus;
    return st?.kind === "waiting" && st.since === since;
  };
  const tick = async () => {
    pollTimer = undefined;
    if (!stillWaiting()) return;
    if ((await isReady(realDir, 1500)) && stillWaiting()) {
      try {
        await useApp.getState().openFolder(realDir, { kind: "data" });
        return;
      } catch (e) {
        console.warn("Couldn't open the data folder yet", e);
      }
    }
    if (!stillWaiting()) return;
    if (copyAvailable && Date.now() - since >= folderTiming.waitMs) {
      await openCopy(await localPaths(), realDir);
      return;
    }
    pollTimer = setTimeout(() => void tick(), folderTiming.pollMs);
  };
  stopPolling();
  pollTimer = setTimeout(() => void tick(), folderTiming.pollMs);
}

/**
 * While working from the copy: watch for the data folder to come back. Once
 * it has stayed ready for a while (a cloud drive shows its cached files first
 * and catches up after), copy the changes back, but only at a safe moment:
 * not mid-lesson in teaching mode, and with no dialog open. Until then the
 * banner says the folder is back and offers to do it now.
 */
function watchForReturn(realDir: string): void {
  stopPolling();
  const settle = new SettleTracker(folderTiming.settleMs);
  const tick = async () => {
    pollTimer = undefined;
    if (useApp.getState().folderStatus?.kind !== "copy") return;
    const settled = settle.poll(await isReady(realDir), Date.now());
    const st = useApp.getState();
    if (st.folderStatus?.kind !== "copy") return;
    if (settled) {
      if (!st.focusMode && !st.dialog) {
        await copyBack(realDir);
        return;
      }
      if (!st.folderStatus.back) useApp.setState({ folderStatus: { ...st.folderStatus, back: true } });
    } else if (st.folderStatus.back) {
      useApp.setState({ folderStatus: { ...st.folderStatus, back: false } });
    }
    pollTimer = setTimeout(() => void tick(), folderTiming.returnPollMs);
  };
  pollTimer = setTimeout(() => void tick(), folderTiming.returnPollMs);
}

/** Copy this computer's changes into the data folder, then reopen it on the same class and screen. */
async function copyBack(realDir: string): Promise<void> {
  stopPolling();
  const before = useApp.getState().folderStatus;
  // An Undo still on screen holds the data from before the join; it must not write over it.
  useApp.setState({ folderStatus: { kind: "syncing", realDir }, toast: null });
  const paths = await localPaths();
  try {
    await getFS().flush();
    const report = await syncBack(paths, realDir, backupStamp());
    await useApp.getState().openFolder(realDir, { kind: "data", keepClass: true });
    useApp.setState({ syncReport: report });
  } catch (e) {
    console.warn("Copying back failed", e);
    if (await readSession(paths)) {
      // Nothing lost: still working from the copy; the next poll tries again.
      if (before?.kind === "copy") useApp.setState({ folderStatus: { ...before, back: false } });
      watchForReturn(realDir);
      useApp.getState().showToast("Couldn't copy your changes back yet — still working from this computer's copy");
    } else {
      // Copied back, but the folder couldn't be opened after all: wait for it.
      waitForFolder(realDir, false);
    }
  }
}

/**
 * Whether the app is working from this computer's copy. A few actions wait
 * for the data folder: a class rename or template deletion can't be copied
 * back safely, and "Save to data folder" would land in the copy.
 */
export function useWorkingFromCopy(): boolean {
  return useApp((s) => s.folderStatus?.kind === "copy" || s.folderStatus?.kind === "syncing");
}

/** Why an action waits for the data folder (a tooltip for its disabled button). */
export const NEEDS_DATA_FOLDER = "Available again once your data folder is back";

/** Whether the open class has a lesson running; re-renders when it starts or ends. */
export function useLessonRunning(): boolean {
  useApp((s) => s.lessonRunningSince);
  useApp((s) => s.currentClass);
  return useApp.getState().lessonRunning();
}

/** The current class's grade split: the examinations' share (%) of the weighted mark. */
export function useExamWeight(): number {
  return useApp((s) => examWeightFor(s.userPrefs, s.classes.find((c) => c.name === s.currentClass)?.year ?? ""));
}
