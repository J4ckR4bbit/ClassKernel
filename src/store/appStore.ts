import { create } from "zustand";
import { backupStamp } from "../lib/id";
import { getFS, isTauri } from "../lib/fs";
import * as repo from "../lib/repo";
import { seedDemoData } from "../lib/demo";
import {
  Assessment,
  AttendanceEntry,
  BehaviourCode,
  BehaviourEvent,
  ClassInfo,
  Desk,
  Mark,
  SeatAssignment,
  Student,
} from "../lib/types";

export type View =
  | "roster"
  | "attendance"
  | "layout"
  | "seating"
  | "lesson"
  | "behaviourLog"
  | "assessments"
  | "dashboard"
  | "notes"
  | "settings";

const DATA_DIR_KEY = "organik.dataDir";

export interface AppState {
  booted: boolean;
  demoMode: boolean;
  dataDir: string | null;
  classes: ClassInfo[];
  currentClass: string | null;
  view: View;
  toast: string | null;

  behaviourCodes: BehaviourCode[];
  students: Student[];
  attendance: AttendanceEntry[];
  behaviourEvents: BehaviourEvent[];
  desks: Desk[];
  seating: SeatAssignment[];
  assessments: Assessment[];
  marks: Mark[];

  boot(): Promise<void>;
  chooseDataDir(path: string): Promise<void>;
  pickAndSetDataDir(): Promise<void>;
  setView(view: View): void;
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
  setSeating(seats: SeatAssignment[]): Promise<void>;
  setAssessments(assessments: Assessment[]): Promise<void>;
  setMarks(marks: Mark[]): Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  demoMode: false,
  dataDir: null,
  classes: [],
  currentClass: null,
  view: "roster",
  toast: null,

  behaviourCodes: [],
  students: [],
  attendance: [],
  behaviourEvents: [],
  desks: [],
  seating: [],
  assessments: [],
  marks: [],

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
    set({ dataDir: path, classes, behaviourCodes, currentClass: null });
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
    const [students, attendance, behaviourEvents, desks, seating, assessments, marks] = await Promise.all([
      repo.loadStudents(dataDir, name),
      repo.loadAttendance(dataDir, name),
      repo.loadBehaviourEvents(dataDir, name),
      repo.loadDesks(dataDir, name),
      repo.loadSeating(dataDir, name),
      repo.loadAssessments(dataDir, name),
      repo.loadMarks(dataDir, name),
    ]);
    set({ currentClass: name, students, attendance, behaviourEvents, desks, seating, assessments, marks });
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

  async setSeating(seating) {
    const { dataDir, currentClass } = get();
    set({ seating });
    if (dataDir && currentClass) await repo.saveSeating(dataDir, currentClass, seating);
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
}));
