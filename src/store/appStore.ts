import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { backupStamp, nowIso, today } from "../lib/id";
import { getFS, isTauri, onWorkWrite, useFolder } from "../lib/fs";
import { FolderAway, needsALook, sendChanges } from "../lib/batchSync";
import * as repo from "../lib/repo";
import {
  CopyBackIncomplete,
  LocalPaths,
  SettleTracker,
  SyncReport,
  changedFiles,
  decideBoot,
  describeError,
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
import { applyRenames, describeRenames, shortenCodes } from "../lib/behaviourCodes";
import { DEFAULT_NOTE_SECTIONS, Note, NoteKind, renameSectionInNotes } from "../lib/notes";
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
  | "classInfo"
  | "plugin"
  | "settings";

const DATA_DIR_KEY = "classkernel.dataDir";
const draftsKey = (className: string) => `classkernel.noteDrafts.${className}`;

/** A note typed and kept as a draft (Draft in the quick-note box) until it's sent, thrown away, or the lesson ends. */
export interface NoteDraft {
  text: string;
  tags: string[];
}

/** Which note box is open: a quick note, a detailed note or a Form F, new or an existing one. */
export interface NoteEditorRequest {
  kind: NoteKind;
  /** "" = about the whole lesson (quick notes), or not chosen yet. */
  studentId: string;
  /** Editing this note; left out, a new one. */
  noteId?: string;
  /** Opened from a seat: the student can't be changed in the box. */
  fixedStudent?: boolean;
  /** A Form F to show as the printable form rather than to edit. */
  print?: boolean;
}

function readDrafts(className: string): Record<string, NoteDraft> {
  try {
    const raw = localStorage.getItem(draftsKey(className));
    return raw ? (JSON.parse(raw) as Record<string, NoteDraft>) : {};
  } catch {
    return {};
  }
}

function writeDrafts(className: string, drafts: Record<string, NoteDraft>) {
  try {
    if (Object.keys(drafts).length) localStorage.setItem(draftsKey(className), JSON.stringify(drafts));
    else localStorage.removeItem(draftsKey(className));
  } catch {
    // Kept for this session only.
  }
}
const KEEP_COPY_KEY = "classkernel.keepLocalCopy";

/** How long the launch waits for a missing data folder before opening this computer's copy. */
export const WAIT_FOR_FOLDER_MS = 30_000;

/** How often changes go to the data folder: every 2, 5 or 10 minutes, only at natural pauses, or with every save. */
export type SendEvery = "2" | "5" | "10" | "pauses" | "now";
export const SEND_EVERY: SendEvery[] = ["2", "5", "10", "pauses", "now"];
const SEND_KEY = "classkernel.sendEvery";

/** How often this computer sends changes to the data folder (Settings → Data; every 2 minutes unless changed). */
export function sendEvery(): SendEvery {
  try {
    const v = localStorage.getItem(SEND_KEY) as SendEvery | null;
    return v && SEND_EVERY.includes(v) ? v : "2";
  } catch {
    return "2";
  }
}

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
 *   `lastError`, why the last copy-back didn't work;
 * - syncing: copying this computer's changes back into the folder.
 */
export type FolderStatus =
  | { kind: "waiting"; realDir: string; since: number; copyAvailable: boolean }
  | { kind: "copy"; realDir: string; since: string; copyRefreshedAt: string; back: boolean; lastError?: string }
  | { kind: "syncing"; realDir: string }
  /**
   * Working in this computer's copy, sending the changes to the data folder
   * (realDir) every few minutes and at natural pauses (batchSync.ts).
   * `failed`: files the last send couldn't take across (tried again next
   * time); `lastError`: why the last send, or a file in it, didn't go.
   */
  | {
      kind: "batched";
      realDir: string;
      lastSent: string | null;
      pending: boolean;
      driveAway: boolean;
      sending: boolean;
      failed: Array<{ file: string; error: string }>;
      lastError: string | null;
    };

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
  /** The most characters the prompt's input takes. */
  maxLength?: number;
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
  /** The open class's notes (notes.csv): quick, detailed and Form F. */
  notes: Note[];
  /** The open class's note drafts, by student id ("" = the lesson), kept on this computer until the lesson ends. */
  noteDrafts: Record<string, NoteDraft>;
  /** The note box that's open, if any (shown over every screen, teaching mode too). */
  noteEditor: NoteEditorRequest | null;
  /** The notes' sections, which are also the quick notes' tags (note_sections.csv, app-wide). */
  noteSections: string[];
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
  /** Send this computer's changes to the data folder now, taking in any made elsewhere (Send now). */
  sendNow(): Promise<void>;
  /** A natural pause (End lesson, Done marking, another class): send, join and take in changes from elsewhere. */
  naturalPause(): void;
  /** How often changes are sent to the data folder (this computer only). */
  setSendEvery(every: SendEvery): Promise<void>;
  /** Stop sending in batches, everything sent first; resolves false if something couldn't be sent. */
  stopBatching(): Promise<boolean>;
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
  /**
   * Rename one behaviour's code, carrying it into every class's log so each
   * logged event keeps its button. Resolves false (nothing changed) on a clash.
   */
  renameBehaviourCode(oldCode: string, newCode: string): Promise<boolean>;
  setBathroomVisits(visits: BathroomVisit[]): Promise<void>;
  /** Begin a bathroom trip for the student (no-op if one is already running). */
  startBathroomVisit(studentId: string): Promise<void>;
  /** Close the student's running trip outside, stamping the return time. */
  endBathroomVisit(studentId: string): Promise<void>;
  setDesks(desks: Desk[]): Promise<void>;
  setRoomConfig(config: RoomConfig): Promise<void>;
  setSeating(seats: SeatAssignment[]): Promise<void>;
  setSeatingPrefs(prefs: SeatingPrefs): Promise<void>;
  /** Save (or clear, with "") one student's parent-report comment. */
  setReportComment(studentId: string, comment: string): Promise<void>;
  /** Add a note, or replace the one with its id. */
  saveNote(note: Note): Promise<void>;
  /** Remove a note; resolves to it (for Undo), or null if there was none. */
  deleteNote(id: string): Promise<Note | null>;
  setNoteSections(sections: string[]): Promise<void>;
  /** Rename a section, in every class's notes too. Resolves false on a clash or a blank name. */
  renameNoteSection(from: string, to: string): Promise<boolean>;
  /** Keep (or, with null, drop) a note draft for a student ("" = the lesson). */
  setNoteDraft(studentId: string, draft: NoteDraft | null): void;
  /** The lesson ended: every draft for the open class is thrown away. */
  clearNoteDrafts(): void;
  openNoteEditor(request: NoteEditorRequest): void;
  closeNoteEditor(): void;
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
  /** False when it couldn't be written (the save-error banner says so). */
  saveLayoutTemplate(name: string): Promise<boolean>;
  /** False when the template couldn't be read (the room is left as it was). */
  applyLayoutTemplate(name: string): Promise<boolean>;
  /** False when it couldn't be deleted (a message says so; it stays in the list). */
  deleteLayoutTemplate(name: string): Promise<boolean>;
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
/** A minute, for the send interval (the browser demo's ?simulate=drive shortens it). */
export const sendTiming = { minuteMs: 60_000 };
/** Set in the browser demo with ?simulate=drive: the demo folder behaves as a synced one, with this computer's copy. */
let simulateDrive = false;
export function setSimulateDrive(on: boolean): void {
  simulateDrive = on;
}
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
  // Resolves false when the write failed and the banner is showing for it.
  const guarded = async (label: string, fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      if (get().saveError) {
        set({ saveError: null });
        lastFailedSave = null;
      }
      return true;
    } catch (e) {
      console.error(`Save failed: ${label}`, e);
      lastFailedSave = fn;
      set({ saveError: { label } });
      return false;
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
  notes: [],
  noteDrafts: {},
  noteEditor: null,
  noteSections: [...DEFAULT_NOTE_SECTIONS],
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
      const ready = target ? await isReady(target) : false;
      const plan = decideBoot({ savedDir: saved, session, ready, source: await readSource(paths) });
      if (plan.kind === "open") {
        try {
          await get().openFolder(plan.dir, { kind: "data" });
        } catch (e) {
          // The folder went away (or turned unreadable) while loading.
          console.warn("Couldn't open the data folder", e);
          waitForFolder(plan.dir, !!session || !!(await readSource(paths)));
        }
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
    if (batchedStatus() && !(await stopBatchingNow())) {
      get().showToast("This computer's latest changes haven't reached your data folder yet — try again once Google Drive is back");
      return;
    }
    const paths = await localPaths();
    if (await readSession(paths)) {
      // Only the data folder itself (wherever it is now) can take these
      // changes; an empty or unrelated folder would just set them aside.
      if (!(await isReady(path))) {
        get().showToast("That folder doesn't hold your ClassKernel data — choose the folder with behaviours.csv and classes/ in it");
        return;
      }
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
        showSyncReport(await syncBack(paths, path, backupStamp()), "This computer's changes are in that folder now");
      } catch (e) {
        if (e instanceof CopyBackIncomplete) {
          // The rest went: the files left over are sent from the folder's own session (openFolder).
          showSyncReport(e.report, "This computer's changes are in that folder now");
          await get().openFolder(path, { kind: "data", create: true });
          return;
        }
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
    if (batchedStatus()) await stopBatchingNow();
    const fs = getFS();
    const paths = await localPaths();
    const copying = (isTauri() || !!simulateMissingFolder || simulateDrive) && kind === "data";
    // Changes saved on this computer and not yet in the folder (the app was
    // closed before they were sent, or they're left from working offline):
    // carry on from this computer's copy, which holds them, and send them now.
    const waiting = copying ? await readSession(paths) : null;
    // Settles true once this computer's copy has been refreshed from the folder.
    let copyFresh: Promise<boolean> = Promise.resolve(false);
    if (kind === "data") {
      await repo.ensureDataDir(path, create);
      if (isTauri()) {
        try {
          localStorage.setItem(DATA_DIR_KEY, path);
        } catch {
          // state.json below still remembers it.
        }
      }
      if (waiting) {
        // They go to this folder (it may have moved, say to another drive letter).
        if (!sameFolder(waiting.realDir, path)) await fs.writeAtomic(paths.session, JSON.stringify({ ...waiting, realDir: path }));
        void writeState(paths, path).catch((e) => console.warn("Couldn't record the data folder", e));
        useFolder(path, null, paths.copy);
        // Today's backup of the folder; the marker keeps it from refreshing the copy.
        void fs
          .snapshot(path, backupStamp(), repo.BACKUP_DAYS_TO_KEEP, { to: paths.copy, guard: paths.session }, backupsFor(paths))
          .catch((e) => console.warn("Backup snapshot failed", e));
      } else if (copying) {
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
        copyFresh = fs
          .snapshot(path, backupStamp(), repo.BACKUP_DAYS_TO_KEEP, keep ? { to: paths.copy, guard: paths.session } : undefined, backupsFor(paths))
          .then(async () => {
            if (keep && !(await readSession(paths))) {
              await fs.writeAtomic(paths.source, JSON.stringify({ realDir: path, refreshedAt: nowIso() }));
              return true;
            }
            return false;
          })
          .catch((e) => {
            console.warn("Backup snapshot failed", e);
            return false;
          });
      } else {
        useFolder(path, null);
      }
    } else {
      // The copy is its own root and is never mirrored, snapshotted or remembered as the data folder.
      useFolder(path, null);
    }
    const { classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, noteSections } =
      await loadAppWide(path);
    setTimeZone(userPrefs.timeZone);
    // Codes are three characters now: shorten any longer ones, once, in the
    // logs first, so an interrupted run is simply finished next time. Only in
    // the data folder itself: renamed rows in this computer's copy would come
    // back as duplicates when it is joined to the folder.
    let codes = behaviourCodes;
    const renames = kind === "data" && !waiting ? shortenCodes(behaviourCodes) : new Map<string, string>();
    if (renames.size > 0) {
      try {
        await repo.renameBehaviourCodesInClasses(path, renames);
        codes = applyRenames(behaviourCodes, renames);
        await repo.saveBehaviourCodes(path, codes);
      } catch (e) {
        console.error("Couldn't shorten the behaviour codes", e);
        renames.clear();
        codes = behaviourCodes;
      }
    }
    const previous = get().currentClass;
    set({ noteSections });
    set({ dataDir: path, classes, behaviourCodes: codes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, currentClass: null });
    if (kind === "data") set({ folderStatus: waiting ? batchedStart(path, true) : null });
    else if (realDir) set({ folderStatus: { kind: "copy", realDir, since: nowIso(), copyRefreshedAt: "", back: false } });
    if (waiting) {
      unsent = true;
      watchSaves(true);
    }
    const active = classes.filter((c) => !c.archived);
    const reopen = keepClass && previous && classes.some((c) => c.name === previous) ? previous : active[0]?.name;
    // Opening a class while sending in batches is a pause: what's waiting goes now.
    if (reopen) await get().openClass(reopen);
    else if (waiting) void send(true);
    if (waiting) {
      // Batching was switched off meanwhile: send, then save straight to the folder again.
      if (sendEvery() === "now" || !keepLocalCopy()) void stopBatchingNow();
      else armSendTimer();
    }
    if (renames.size > 0) {
      get().showToast(`Behaviour codes are now 3 characters: ${describeRenames(renames)}`, { label: "OK", run: () => {} });
    }
    // Once the copy is fresh, work in it and send changes to the folder in batches.
    void copyFresh.then((fresh) => (fresh ? startBatching(path) : undefined)).catch((e) => console.warn("Couldn't start sending in batches", e));
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

  async sendNow() {
    if (!batchedStatus()) return;
    if (await send(true)) return;
    // Asked for: say why it didn't go (replacing any first-time notice).
    const s = batchedStatus();
    get().showToast(
      s?.driveAway
        ? "Still can't reach your data folder — your changes are safe on this computer"
        : `Not everything could be sent yet${s?.failed[0] ? ` (${s.failed[0].file})` : ""} — it's tried again with the next send`,
    );
  },

  naturalPause() {
    if (batchedStatus()) void send(true);
  },

  async setSendEvery(every) {
    try {
      localStorage.setItem(SEND_KEY, every);
    } catch {
      // Applies for this session only.
    }
    const { dataDir, folderStatus } = get();
    if (every === "now") {
      if (batchedStatus() && !(await stopBatchingNow())) {
        get().showToast("Your latest changes haven't reached the data folder yet — they're sent with every save once it's back");
      }
      return;
    }
    if (batchedStatus()) armSendTimer();
    else if (!folderStatus && dataDir && keepLocalCopy() && (isTauri() || simulateDrive)) await startBatching(dataDir);
  },

  stopBatching() {
    return stopBatchingNow();
  },

  async setKeepLocalCopy(on) {
    try {
      localStorage.setItem(KEEP_COPY_KEY, on ? "1" : "0");
    } catch {
      // Applies for this session only.
    }
    if (!on && batchedStatus() && !(await stopBatchingNow())) {
      get().showToast("This computer's latest changes haven't reached your data folder yet — try again once Google Drive is back");
      return;
    }
    const { dataDir, folderStatus } = get();
    if (folderStatus) return;
    const paths = await localPaths();
    if (on) {
      if (dataDir) await get().openFolder(dataDir, { kind: "data", keepClass: true });
    } else {
      useFolder(dataDir, null);
      if (!(await readSession(paths))) await getFS().removeLocal(paths.copy);
      // Its backups hold the same student information: they go too, and from
      // now on the launch backups are made in the data folder again.
      await getFS().removeLocal(paths.backups).catch((e) => console.warn("Couldn't remove this computer's backups", e));
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
    else if (nextStyle === "strip") void enterDock(userPrefs.dockSide, userPrefs.uiScale);
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
    const data = await loadClassData(dataDir, name);
    set({
      currentClass: name,
      dashboardStudent: null,
      ...data,
      noteDrafts: readDrafts(name),
      noteEditor: null,
      seatingLockedAt: readSeatedAt(name),
      lessonRunningSince: readLessonRunning(name),
      sensitiveRevealed: false,
    });
    // Another class is a natural pause: send what's waiting, and take in changes made elsewhere.
    if (batchedStatus()) void send(true);
  },

  async updateClassInfo(info) {
    const { dataDir } = get();
    if (!dataDir) return;
    await repo.saveClassInfo(dataDir, info);
    set({ classes: await repo.listClasses(dataDir) });
  },

  async renameClass(oldName, newName) {
    const { dataDir, classes, folderStatus } = get();
    if (!dataDir || !newName || oldName === newName || (folderStatus && folderStatus.kind !== "batched")) return;
    const info = classes.find((c) => c.name === oldName);
    if (!info) return;
    // Moves a folder: done in the data folder itself, not sent file by file.
    const done = await inDataFolder(async () => {
      await repo.renameClass(dataDir, oldName, newName);
      await repo.saveClassInfo(dataDir, { ...info, name: newName });
      return true;
    });
    if (!done) return;
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

  async renameBehaviourCode(oldCode, newCode) {
    const { dataDir, behaviourCodes, behaviourEvents } = get();
    if (!newCode || newCode === oldCode || behaviourCodes.some((c) => c.code === newCode)) return false;
    const renames = new Map([[oldCode, newCode]]);
    const codes = applyRenames(behaviourCodes, renames);
    set({
      behaviourCodes: codes,
      behaviourEvents: behaviourEvents.map((e) => (e.code === oldCode ? { ...e, code: newCode } : e)),
    });
    if (dataDir) {
      // The logs first, then the buttons: a failure leaves the old code, still matching its events.
      await guarded("the behaviour logs", async () => {
        await repo.renameBehaviourCodesInClasses(dataDir, renames);
        await repo.saveBehaviourCodes(dataDir, codes);
      });
    }
    return true;
  },

  async setBathroomVisits(bathroomVisits) {
    const { dataDir, currentClass } = get();
    set({ bathroomVisits });
    if (dataDir && currentClass) await guarded("the Outside log", () => repo.saveBathroomVisits(dataDir, currentClass, bathroomVisits));
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

  async saveNote(note) {
    const { dataDir, currentClass, notes } = get();
    const next = notes.some((n) => n.id === note.id) ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note];
    set({ notes: next });
    if (dataDir && currentClass) await guarded("the notes", () => repo.saveNotes(dataDir, currentClass, next));
  },

  async deleteNote(id) {
    const { dataDir, currentClass, notes } = get();
    const gone = notes.find((n) => n.id === id) ?? null;
    if (!gone) return null;
    const next = notes.filter((n) => n.id !== id);
    set({ notes: next });
    if (dataDir && currentClass) await guarded("the notes", () => repo.saveNotes(dataDir, currentClass, next));
    return gone;
  },

  async setNoteSections(sections) {
    const { dataDir } = get();
    set({ noteSections: sections });
    if (dataDir) await guarded("the note sections", () => repo.saveNoteSections(dataDir, sections));
  },

  async renameNoteSection(from, to) {
    const name = to.trim();
    const { dataDir, noteSections, notes } = get();
    if (!name || name === from || noteSections.includes(name)) return false;
    const sections = noteSections.map((s) => (s === from ? name : s));
    set({ noteSections: sections, notes: renameSectionInNotes(notes, from, name) });
    if (dataDir) {
      await guarded("the notes", async () => {
        await repo.renameNoteSectionInClasses(dataDir, from, name);
        await repo.saveNoteSections(dataDir, sections);
      });
    }
    return true;
  },

  setNoteDraft(studentId, draft) {
    const { currentClass, noteDrafts } = get();
    const next = { ...noteDrafts };
    if (draft && (draft.text.trim() || draft.tags.length)) next[studentId] = draft;
    else delete next[studentId];
    set({ noteDrafts: next });
    if (currentClass) writeDrafts(currentClass, next);
  },

  clearNoteDrafts() {
    const { currentClass } = get();
    set({ noteDrafts: {} });
    if (currentClass) writeDrafts(currentClass, {});
  },

  openNoteEditor(request) {
    set({ noteEditor: request });
  },

  closeNoteEditor() {
    set({ noteEditor: null });
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
    if (!dataDir) return false;
    // Try again on the banner saves this same layout and then lists it.
    return guarded(`the layout template "${name}"`, async () => {
      await repo.saveLayoutTemplate(dataDir, name, desks, roomConfig);
      await get().refreshLayoutTemplates();
    });
  },

  async applyLayoutTemplate(name) {
    const { dataDir, currentClass, roomConfig } = get();
    if (!dataDir || !currentClass) return false;
    let template: Awaited<ReturnType<typeof repo.loadLayoutTemplate>> | null = null;
    try {
      template = await repo.loadLayoutTemplate(dataDir, name);
    } catch (e) {
      console.error(`Couldn't read layout template ${name}`, e);
    }
    // No desks means the template's files are missing (deleted on another
    // computer, say): applying it would clear the room, so leave it alone.
    if (!template || template.desks.length === 0) {
      get().showToast(`Couldn't read the layout "${name}" — this room is unchanged`);
      return false;
    }
    // Keep this class's own view crop; take everything else from the template.
    const nextConfig: RoomConfig = { ...template.config, crop: roomConfig.crop };
    set({ desks: template.desks, roomConfig: nextConfig });
    // Applied either way; if the files can't be written, the banner says so and offers Try again.
    await guarded("the room layout", async () => {
      await repo.saveDesks(dataDir, currentClass, template.desks);
      await repo.saveRoomConfig(dataDir, currentClass, nextConfig);
    });
    return true;
  },

  async deleteLayoutTemplate(name) {
    const { dataDir, folderStatus } = get();
    if (!dataDir || (folderStatus && folderStatus.kind !== "batched")) return false;
    try {
      // Moves a folder: done in the data folder itself, not sent file by file.
      if ((await inDataFolder(async () => repo.deleteLayoutTemplate(dataDir, name).then(() => true))) === undefined) return false;
    } catch (e) {
      console.error(`Couldn't delete layout template ${name}`, e);
      await get().refreshLayoutTemplates().catch(() => {});
      // Already gone (deleted on another computer, say) is what was wanted.
      if (get().layoutTemplates.includes(name)) {
        get().showToast(`Couldn't delete the template "${name}" — it's still there`);
        return false;
      }
      return true;
    }
    await get().refreshLayoutTemplates();
    return true;
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

// ---------- sending changes to the data folder in batches ----------
// While batched, saves land in this computer's copy only (MirrorFS workIn) and
// are sent to the data folder every few minutes and at natural pauses, so a
// synced folder isn't uploading after every tap. The offline session marker
// stays while batched, so changes not yet sent survive a crash or power cut:
// the next launch works from the copy and copies them back (offline.ts).

let sendTimer: ReturnType<typeof setInterval> | undefined;
/** A save has landed in the copy since the last send began. */
let unsent = false;
/**
 * The teacher has been told, once, that the data folder can't be reached.
 * Until it's back, the chip says so quietly; once it is, they're told that too.
 */
let toldAway = false;
let sendChain: Promise<unknown> = Promise.resolve();

function batchedStatus() {
  const s = useApp.getState().folderStatus;
  return s?.kind === "batched" ? s : null;
}

function patchBatched(patch: Partial<Extract<FolderStatus, { kind: "batched" }>>): void {
  const s = batchedStatus();
  if (s) useApp.setState({ folderStatus: { ...s, ...patch } });
}

function clearSendTimer(): void {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = undefined;
}

function armSendTimer(): void {
  clearSendTimer();
  const every = sendEvery();
  if (!batchedStatus() || every === "pauses" || every === "now") return;
  sendTimer = setInterval(() => {
    if (unsent) void send(false);
  }, Number(every) * sendTiming.minuteMs);
}

function watchSaves(on: boolean): void {
  onWorkWrite(
    on
      ? () => {
          unsent = true;
          const s = batchedStatus();
          if (s && !s.pending) patchBatched({ pending: true });
        }
      : null,
  );
}

/**
 * Start working in this computer's copy (already current: just refreshed, or
 * kept so by every save), sending changes to `realDir` in batches.
 */
async function startBatching(realDir: string): Promise<void> {
  const st = useApp.getState();
  if (st.folderStatus || st.dataDir !== realDir || sendEvery() === "now" || !keepLocalCopy()) return;
  const paths = await localPaths();
  await getFS().flush();
  await startOfflineSession(paths, realDir);
  unsent = false;
  watchSaves(true);
  useFolder(realDir, null, paths.copy);
  useApp.setState({ folderStatus: batchedStart(realDir, false) });
  armSendTimer();
}

function batchedStart(realDir: string, pending: boolean): FolderStatus {
  return { kind: "batched", realDir, lastSent: null, pending, driveAway: false, sending: false, failed: [], lastError: null };
}

/**
 * Send what's waiting. At a pause it also joins files changed in both places
 * and takes in changes made elsewhere, then reads the open class again if
 * anything here changed. One send at a time. Resolves true when nothing is
 * left waiting.
 */
function send(atPause: boolean): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const s = batchedStatus();
    if (!s) return true;
    patchBatched({ sending: true });
    unsent = false;
    try {
      if (!(await isReady(s.realDir))) throw new FolderAway(`${s.realDir} can't be read just now`);
      const paths = await localPaths();
      const report = await sendChanges(paths, s.realDir, backupStamp(), atPause);
      if (report.localChanged) await reloadFromCopy();
      showSyncReport(report);
      const pending = (await changedFiles(paths)).length > 0;
      unsent = pending;
      const problem = report.failed[0];
      patchBatched({
        sending: false,
        driveAway: false,
        pending,
        lastSent: nowIso(),
        failed: report.failed,
        lastError: problem ? `${problem.file}: ${problem.error}` : null,
      });
      if (toldAway) {
        toldAway = false;
        useApp.getState().showToast("Your data folder is back — this computer's changes are in it");
      }
      return !pending;
    } catch (e) {
      console.warn("Couldn't send changes to the data folder", e);
      unsent = true;
      patchBatched({ sending: false, driveAway: true, pending: true, lastError: describeError(e) });
      if (!toldAway) {
        toldAway = true;
        useApp
          .getState()
          .showToast("Can't reach your data folder just now — your changes are safe on this computer and are sent once it's back", {
            label: "OK",
            run: () => {},
          });
      }
      return false;
    }
  };
  const next = sendChain.then(run, run);
  sendChain = next.catch(() => {});
  return next;
}

/**
 * Where the launch backups go: on this computer while it keeps a copy (so a
 * synced data folder isn't uploaded in full at every launch), otherwise in the
 * data folder's own backups/ (a shared computer keeps no student data).
 */
export function backupsFor(paths: LocalPaths): string | undefined {
  return keepLocalCopy() ? paths.backups : undefined;
}

/** The short message after a copy-back with nothing to look at. */
function copiedBack(report: SyncReport): string {
  return report.joined.length > 0
    ? "Your data folder is back — this computer's changes are in it, joined with changes made on another computer"
    : "Your data folder is back — this computer's changes are in it";
}

/**
 * A copy-back or send that needs a look (clashes, files kept aside) stays on
 * screen until dismissed; otherwise there's at most a short message.
 */
function showSyncReport(report: SyncReport, done?: string): void {
  if (needsALook(report)) useApp.setState({ syncReport: report });
  else if (done) useApp.getState().showToast(done);
}

/** Read again what a send changed here: the whole-folder lists, and the open class, keeping the screen as it is. */
async function reloadFromCopy(): Promise<void> {
  const { dataDir, currentClass } = useApp.getState();
  if (!dataDir) return;
  useApp.setState(await loadAppWide(dataDir));
  if (!currentClass) return;
  const data = await loadClassData(dataDir, currentClass);
  // Not if the teacher moved to another class meanwhile.
  if (useApp.getState().currentClass === currentClass) useApp.setState(data);
}

/** Stop working in the copy: everything sent first, then saves go straight to the data folder again. */
async function stopBatchingNow(): Promise<boolean> {
  const s = batchedStatus();
  if (!s) return true;
  clearSendTimer();
  if (!(await send(true))) {
    armSendTimer();
    return false;
  }
  const paths = await localPaths();
  // From here saves go straight to the folder (and its copy). Anything saved
  // in the moment between is sent across now.
  watchSaves(false);
  useFolder(s.realDir, keepLocalCopy() ? paths.copy : null);
  try {
    const late = await sendChanges(paths, s.realDir, backupStamp(), false);
    if (late.held.length) console.warn("Changed in both places while switching; kept in this computer's copy", late.held);
  } catch (e) {
    console.warn("Couldn't send the last changes", e);
  }
  await getFS().removeLocal(paths.session).catch((e) => console.warn("Couldn't clear the session marker", e));
  await getFS().removeLocal(paths.base).catch((e) => console.warn("Couldn't clear the starting point", e));
  useApp.setState({ folderStatus: null });
  return true;
}

/**
 * Do something to the data folder itself that a file-by-file send can't carry
 * (a class renamed, a template deleted, a backup restored): everything sent
 * first, the change made there directly, then this computer's copy refreshed
 * from it and batching started again. Resolves undefined if the folder
 * couldn't be reached first.
 */
async function inDataFolder<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const s = batchedStatus();
  if (!s) return fn();
  if (!(await stopBatchingNow())) {
    useApp
      .getState()
      .showToast("That needs your data folder, and this computer's latest changes haven't reached it yet — try again once Google Drive is back");
    return undefined;
  }
  try {
    return await fn();
  } finally {
    const paths = await localPaths();
    await getFS()
      .copyFolder(s.realDir, paths.copy, ["backups", "exports"])
      .then(() => getFS().writeAtomic(paths.source, JSON.stringify({ realDir: s.realDir, refreshedAt: nowIso() })))
      .then(() => startBatching(s.realDir))
      .catch((e) => console.warn("Couldn't start sending in batches again", e));
  }
}

/**
 * Before the app closes: send what's waiting and, if it all went, end the
 * batched session so the next launch opens the data folder as usual. If it
 * couldn't be sent, the marker stays and the next launch copies it back.
 */
export async function sendBeforeClosing(): Promise<void> {
  const s = batchedStatus();
  if (!s) return;
  clearSendTimer();
  if (!(await send(true))) return;
  const paths = await localPaths();
  await getFS().removeLocal(paths.session).catch(() => {});
  await getFS().removeLocal(paths.base).catch(() => {});
}

/** The window was hidden (minimised, another app full screen): a good moment to send, without reading anything again. */
export function sendWhileHidden(): void {
  if (batchedStatus() && unsent) void send(false);
}

/** Everything the app holds for the whole data folder (not one class). */
async function loadAppWide(path: string) {
  const [classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, noteSections] = await Promise.all([
    repo.listClasses(path),
    repo.loadBehaviourCodes(path),
    repo.listLayoutTemplates(path),
    repo.loadTopics(path),
    repo.loadCognitiveLevels(path),
    repo.loadUserPrefs(path),
    repo.loadTimerPresets(path),
    repo.loadNoteSections(path),
  ]);
  return { classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, noteSections };
}

/** One class's records. */
async function loadClassData(dataDir: string, name: string) {
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
    notes,
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
    repo.loadNotes(dataDir, name),
  ]);
  return {
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
    notes,
  };
}

/** Said once per spell on the copy that a copy-back didn't work; the chip carries the rest. */
let toldCopyBackFailed = false;

/**
 * Work from this computer's copy, keeping its starting point for the
 * copy-back, and watch for the folder. Said once; then only the small chip
 * in the top bar shows it, until the folder is back.
 */
async function openCopy(paths: LocalPaths, realDir: string, back = false): Promise<void> {
  const session = await startOfflineSession(paths, realDir);
  await useApp.getState().openFolder(paths.copy, { kind: "copy", realDir });
  useApp.setState({
    folderStatus: { kind: "copy", realDir, since: session.since, copyRefreshedAt: session.copyRefreshedAt, back },
  });
  toldCopyBackFailed = false;
  useApp
    .getState()
    .showToast("Your data folder can't be reached — you're working from this computer's copy, and your changes go back once it's there", {
      label: "OK",
      run: () => {},
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
    // Long enough for a cloud drive to fetch a file it hasn't cached yet.
    if ((await isReady(realDir, 4000)) && stillWaiting()) {
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
 * not mid-lesson in teaching mode, and with no dialog open. Meanwhile the
 * banner says whether the folder can be read now, and offers to copy back
 * straight away once it can.
 */
function watchForReturn(realDir: string): void {
  stopPolling();
  const settle = new SettleTracker(folderTiming.settleMs);
  const tick = async () => {
    pollTimer = undefined;
    if (useApp.getState().folderStatus?.kind !== "copy") return;
    const ready = await isReady(realDir);
    const settled = settle.poll(ready, Date.now());
    const st = useApp.getState();
    if (st.folderStatus?.kind !== "copy") return;
    if (settled && !st.focusMode && !st.dialog) {
      await copyBack(realDir);
      return;
    }
    if (st.folderStatus.back !== ready) useApp.setState({ folderStatus: { ...st.folderStatus, back: ready } });
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
    showSyncReport(report, copiedBack(report));
  } catch (e) {
    if (e instanceof CopyBackIncomplete) {
      // Everything else went. The marker stays, so opening the folder carries
      // on from the copy and sends the files left over in batches.
      try {
        await useApp.getState().openFolder(realDir, { kind: "data", keepClass: true });
        showSyncReport(e.report, copiedBack(e.report));
        return;
      } catch (err) {
        e = err;
      }
    }
    console.warn("Copying back failed", e);
    if (await readSession(paths)) {
      // Nothing lost: still working from the copy; the next poll tries again, quietly.
      if (before?.kind === "copy") useApp.setState({ folderStatus: { ...before, back: false, lastError: describeError(e) } });
      watchForReturn(realDir);
      if (!toldCopyBackFailed) {
        toldCopyBackFailed = true;
        useApp.getState().showToast("Couldn't copy your changes back yet — still working from this computer's copy, and it tries again by itself");
      }
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
