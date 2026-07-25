import { create } from "zustand";
import { backupStamp, nowIso, today } from "../lib/id";
import { getFS, isTauri } from "../lib/fs";
import * as repo from "../lib/repo";
import { seedDemoData } from "../lib/demo";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  BathroomVisit,
  BehaviourCode,
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
  | "dashboard"
  | "notes"
  | "timer"
  | "settings";

const DATA_DIR_KEY = "classkernel.dataDir";

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
  /** Set by Home to ask the Seating view to auto-run an animated reroll on arrival. */
  pendingRandomise: boolean;
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
  roomConfig: RoomConfig;
  layoutTemplates: string[];
  // App-wide, loaded once with the data folder.
  topics: TopicEntry[];
  cognitiveLevels: CognitiveLevel[];
  userPrefs: UserPrefs;
  timerPresets: TimerPreset[];

  boot(): Promise<void>;
  chooseDataDir(path: string): Promise<void>;
  pickAndSetDataDir(): Promise<void>;
  setView(view: View): void;
  setFocusMode(on: boolean): void;
  setPendingRandomise(on: boolean): void;
  showToast(message: string, action?: { label: string; run: () => void }): void;
  revealSensitive(): void;
  confirmDialog(opts: Omit<DialogRequest, "kind" | "placeholder" | "initial">): Promise<boolean>;
  promptDialog(opts: Omit<DialogRequest, "kind" | "danger">): Promise<string | null>;
  /** Called by the dialog component with the outcome (false/null = cancelled). */
  resolveDialog(result: boolean | string | null): void;
  retrySave(): Promise<void>;

  createClass(info: ClassInfo): Promise<void>;
  openClass(name: string): Promise<void>;
  updateClassInfo(info: ClassInfo): Promise<void>;
  renameClass(oldName: string, newName: string): Promise<void>;

  setStudents(students: Student[]): Promise<void>;
  setAttendance(entries: AttendanceEntry[]): Promise<void>;
  addBehaviourEvent(event: BehaviourEvent): Promise<void>;
  removeBehaviourEvent(timestamp: string, studentId: string, code: string): Promise<void>;
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
  pendingRandomise: false,
  toast: null,
  dialog: null,
  sensitiveRevealed: false,
  saveError: null,

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
  roomConfig: DEFAULT_ROOM_CONFIG,
  layoutTemplates: [],
  topics: [],
  cognitiveLevels: [],
  userPrefs: DEFAULT_USER_PREFS,
  timerPresets: [],

  async boot() {
    if (!isTauri()) {
      // Browser demo mode: seed an in-memory dataset so every view works.
      const dataDir = await seedDemoData();
      set({ demoMode: true });
      await get().chooseDataDir(dataDir);
      set({ booted: true });
      return;
    }
    const saved = localStorage.getItem(DATA_DIR_KEY);
    if (saved && (await getFS().exists(saved))) {
      await get().chooseDataDir(saved);
    }
    set({ booted: true });
  },

  async chooseDataDir(path: string) {
    const fs = getFS();
    await repo.ensureDataDir(path);
    if (isTauri()) {
      localStorage.setItem(DATA_DIR_KEY, path);
      try {
        await fs.snapshot(path, backupStamp(), repo.BACKUPS_TO_KEEP);
      } catch (e) {
        console.warn("Backup snapshot failed", e);
      }
    }
    const classes = await repo.listClasses(path);
    const behaviourCodes = await repo.loadBehaviourCodes(path);
    const layoutTemplates = await repo.listLayoutTemplates(path);
    const topics = await repo.loadTopics(path);
    const cognitiveLevels = await repo.loadCognitiveLevels(path);
    const userPrefs = await repo.loadUserPrefs(path);
    const timerPresets = await repo.loadTimerPresets(path);
    set({ dataDir: path, classes, behaviourCodes, layoutTemplates, topics, cognitiveLevels, userPrefs, timerPresets, currentClass: null });
    const active = classes.filter((c) => !c.archived);
    if (active.length > 0) await get().openClass(active[0].name);
  },

  async pickAndSetDataDir() {
    const picked = await getFS().pickFolder();
    if (picked) await get().chooseDataDir(picked);
  },

  setView(view) {
    set({ view, sensitiveRevealed: false });
  },

  setFocusMode(on) {
    set({ focusMode: on, ...(on ? { sensitiveRevealed: false } : {}) });
    // Teaching mode should own the whole panel; failures (e.g. browser
    // demo without a user gesture) are non-fatal.
    void (async () => {
      try {
        if (isTauri()) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setFullscreen(on);
        } else if (on && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else if (!on && document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen is best-effort; the layout change alone is still useful.
      }
    })();
  },

  setPendingRandomise(on) {
    set({ pendingRandomise: on });
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
    ]);
    set({
      currentClass: name,
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
    const { dataDir, classes } = get();
    if (!dataDir || !newName || oldName === newName) return;
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
    const { dataDir } = get();
    if (!dataDir) return;
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
