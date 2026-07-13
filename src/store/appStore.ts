import { create } from "zustand";
import { backupStamp } from "../lib/id";
import { getFS, isTauri } from "../lib/fs";
import * as repo from "../lib/repo";
import { seedDemoData } from "../lib/demo";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
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
  toast: string | null;

  behaviourCodes: BehaviourCode[];
  students: Student[];
  attendance: AttendanceEntry[];
  behaviourEvents: BehaviourEvent[];
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
  showToast(message: string): void;

  createClass(info: ClassInfo): Promise<void>;
  openClass(name: string): Promise<void>;
  updateClassInfo(info: ClassInfo): Promise<void>;
  renameClass(oldName: string, newName: string): Promise<void>;

  setStudents(students: Student[]): Promise<void>;
  setAttendance(entries: AttendanceEntry[]): Promise<void>;
  addBehaviourEvent(event: BehaviourEvent): Promise<void>;
  removeBehaviourEvent(timestamp: string, studentId: string, code: string): Promise<void>;
  setBehaviourCodes(codes: BehaviourCode[]): Promise<void>;
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

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  demoMode: false,
  dataDir: null,
  classes: [],
  currentClass: null,
  view: "home",
  focusMode: false,
  pendingRandomise: false,
  toast: null,

  behaviourCodes: [],
  students: [],
  attendance: [],
  behaviourEvents: [],
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
    set({ view });
  },

  setFocusMode(on) {
    set({ focusMode: on });
  },

  setPendingRandomise(on) {
    set({ pendingRandomise: on });
  },

  showToast(message) {
    set({ toast: message });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2500);
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
      desks,
      seating,
      seatingPrefs,
      lessons,
      assessments,
      marks,
      assessmentQuestions,
      questionMarks,
      roomConfig,
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
    if (dataDir && currentClass) await repo.saveStudents(dataDir, currentClass, students);
  },

  async setAttendance(attendance) {
    const { dataDir, currentClass } = get();
    set({ attendance });
    if (dataDir && currentClass) await repo.saveAttendance(dataDir, currentClass, attendance);
  },

  async addBehaviourEvent(event) {
    const { dataDir, currentClass, behaviourEvents } = get();
    const next = [...behaviourEvents, event];
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await repo.saveBehaviourEvents(dataDir, currentClass, next);
  },

  async removeBehaviourEvent(timestamp, studentId, code) {
    const { dataDir, currentClass, behaviourEvents } = get();
    const idx = behaviourEvents.findIndex(
      (e) => e.timestamp === timestamp && e.studentId === studentId && e.code === code,
    );
    if (idx < 0) return;
    const next = behaviourEvents.filter((_, i) => i !== idx);
    set({ behaviourEvents: next });
    if (dataDir && currentClass) await repo.saveBehaviourEvents(dataDir, currentClass, next);
  },

  async setBehaviourCodes(codes) {
    const { dataDir } = get();
    set({ behaviourCodes: codes });
    if (dataDir) await repo.saveBehaviourCodes(dataDir, codes);
  },

  async setDesks(desks) {
    const { dataDir, currentClass } = get();
    set({ desks });
    if (dataDir && currentClass) await repo.saveDesks(dataDir, currentClass, desks);
  },

  async setRoomConfig(roomConfig) {
    const { dataDir, currentClass } = get();
    set({ roomConfig });
    if (dataDir && currentClass) await repo.saveRoomConfig(dataDir, currentClass, roomConfig);
  },

  async setSeating(seating) {
    const { dataDir, currentClass } = get();
    set({ seating });
    if (dataDir && currentClass) await repo.saveSeating(dataDir, currentClass, seating);
  },

  async setSeatingPrefs(seatingPrefs) {
    const { dataDir, currentClass } = get();
    set({ seatingPrefs });
    if (dataDir && currentClass) await repo.saveSeatingPrefs(dataDir, currentClass, seatingPrefs);
  },

  async addLessonRecords(records) {
    const { dataDir, currentClass, lessons } = get();
    const next = [...lessons, ...records];
    set({ lessons: next });
    if (dataDir && currentClass) await repo.saveLessons(dataDir, currentClass, next);
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
    if (dataDir && currentClass) await repo.saveAssessments(dataDir, currentClass, assessments);
  },

  async setMarks(marks) {
    const { dataDir, currentClass } = get();
    set({ marks });
    if (dataDir && currentClass) await repo.saveMarks(dataDir, currentClass, marks);
  },

  async setAssessmentQuestions(assessmentQuestions) {
    const { dataDir, currentClass } = get();
    set({ assessmentQuestions });
    if (dataDir && currentClass) await repo.saveAssessmentQuestions(dataDir, currentClass, assessmentQuestions);
  },

  async setQuestionMarks(questionMarks) {
    const { dataDir, currentClass } = get();
    set({ questionMarks });
    if (dataDir && currentClass) await repo.saveQuestionMarks(dataDir, currentClass, questionMarks);
  },

  async setTopics(topics) {
    const { dataDir } = get();
    set({ topics });
    if (dataDir) await repo.saveTopics(dataDir, topics);
  },

  async setCognitiveLevels(cognitiveLevels) {
    const { dataDir } = get();
    set({ cognitiveLevels });
    if (dataDir) await repo.saveCognitiveLevels(dataDir, cognitiveLevels);
  },

  async setUserPrefs(userPrefs) {
    const { dataDir } = get();
    set({ userPrefs });
    if (dataDir) await repo.saveUserPrefs(dataDir, userPrefs);
  },

  async setTimerPresets(timerPresets) {
    const { dataDir } = get();
    set({ timerPresets });
    if (dataDir) await repo.saveTimerPresets(dataDir, timerPresets);
  },
}));
