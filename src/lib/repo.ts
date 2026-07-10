// Repository layer: maps domain entities onto the .md/.csv files in the data
// folder. File layout (all portable, Excel/Notepad friendly):
//
// <dataDir>/
//   behaviours.csv                        code,label,kind,points,color
//   classes/<class>/class.md              front matter + free notes
//   classes/<class>/students.csv          id,first_name,last_name,gender,flags,notes
//   classes/<class>/attendance.csv        date,student_id,status,note
//   classes/<class>/behaviour.csv         timestamp,student_id,code,points,note
//   classes/<class>/desks.csv             desk_id,label,shape,x,y,w,h,rotation
//   classes/<class>/seating.csv           plan_name,desk_id,seat_index,student_id
//   classes/<class>/assessments.csv       assessment_id,title,date,total_marks,weight,category
//   classes/<class>/marks.csv             assessment_id,student_id,mark,comment
//   backups/<stamp>/...                   rolling snapshots

import { getFS } from "./fs";
import { parseCsv, stringifyCsv, num, numOrNull } from "./csv";
import {
  Assessment,
  AttendanceEntry,
  AttendanceStatus,
  BehaviourCode,
  BehaviourEvent,
  ClassInfo,
  DEFAULT_BEHAVIOURS,
  Desk,
  DeskShape,
  Mark,
  SeatAssignment,
  Student,
} from "./types";

export const BACKUPS_TO_KEEP = 14;

const p = (...parts: string[]) => parts.join("/");
export const classDir = (dataDir: string, className: string) => p(dataDir, "classes", className);

// ---------- data folder ----------

export async function ensureDataDir(dataDir: string): Promise<void> {
  const fs = getFS();
  await fs.mkdirs(p(dataDir, "classes"));
  await fs.mkdirs(p(dataDir, "backups"));
  if (!(await fs.exists(p(dataDir, "behaviours.csv")))) {
    await saveBehaviourCodes(dataDir, DEFAULT_BEHAVIOURS);
  }
}

// ---------- class.md ----------
// Format: a small front-matter block, then free markdown notes:
//   ---
//   name: 7B Science
//   year: 7
//   subject: Science
//   room: Lab 2
//   archived: false
//   ---
//   Anything below is free-form notes.

export function serializeClassMd(info: ClassInfo): string {
  const fm = [
    "---",
    `name: ${info.name}`,
    `year: ${info.year}`,
    `subject: ${info.subject}`,
    `room: ${info.room}`,
    `archived: ${info.archived}`,
    "---",
    "",
  ].join("\n");
  return fm + info.notes;
}

export function parseClassMd(name: string, text: string): ClassInfo {
  const info: ClassInfo = { name, year: "", subject: "", room: "", notes: "", archived: false };
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key === "year") info.year = value;
      else if (key === "subject") info.subject = value;
      else if (key === "room") info.room = value;
      else if (key === "archived") info.archived = value === "true";
    }
    info.notes = text.slice(m[0].length).replace(/^\r?\n/, "");
  } else {
    info.notes = text;
  }
  return info;
}

export async function listClasses(dataDir: string): Promise<ClassInfo[]> {
  const fs = getFS();
  const dir = p(dataDir, "classes");
  if (!(await fs.exists(dir))) return [];
  const entries = await fs.listDir(dir);
  const classes: ClassInfo[] = [];
  for (const e of entries.filter((e) => e.isDir)) {
    const mdPath = p(dir, e.name, "class.md");
    if (await fs.exists(mdPath)) {
      classes.push(parseClassMd(e.name, await fs.readText(mdPath)));
    } else {
      classes.push({ name: e.name, year: "", subject: "", room: "", notes: "", archived: false });
    }
  }
  return classes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveClassInfo(dataDir: string, info: ClassInfo): Promise<void> {
  const fs = getFS();
  await fs.mkdirs(classDir(dataDir, info.name));
  await fs.writeAtomic(p(classDir(dataDir, info.name), "class.md"), serializeClassMd(info));
}

export async function renameClass(dataDir: string, oldName: string, newName: string): Promise<void> {
  await getFS().rename(classDir(dataDir, oldName), classDir(dataDir, newName));
}

// ---------- generic CSV helpers ----------

async function loadCsvFile(path: string): Promise<ReturnType<typeof parseCsv>> {
  const fs = getFS();
  if (!(await fs.exists(path))) return [];
  return parseCsv(await fs.readText(path));
}

// ---------- students ----------

const STUDENT_COLS = ["id", "first_name", "last_name", "gender", "flags", "notes"];

export async function loadStudents(dataDir: string, className: string): Promise<Student[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "students.csv"));
  return rows
    .filter((r) => r.id)
    .map((r) => ({
      id: r.id,
      firstName: r.first_name ?? "",
      lastName: r.last_name ?? "",
      gender: r.gender ?? "",
      flags: r.flags ?? "",
      notes: r.notes ?? "",
    }));
}

export async function saveStudents(dataDir: string, className: string, students: Student[]): Promise<void> {
  const rows = students.map((s) => ({
    id: s.id,
    first_name: s.firstName,
    last_name: s.lastName,
    gender: s.gender,
    flags: s.flags,
    notes: s.notes,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "students.csv"), stringifyCsv(rows, STUDENT_COLS));
}

// ---------- attendance ----------

const ATTENDANCE_COLS = ["date", "student_id", "status", "note"];

export async function loadAttendance(dataDir: string, className: string): Promise<AttendanceEntry[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "attendance.csv"));
  return rows
    .filter((r) => r.date && r.student_id)
    .map((r) => ({
      date: r.date,
      studentId: r.student_id,
      status: (["P", "A", "L", "E"].includes(r.status) ? r.status : "P") as AttendanceStatus,
      note: r.note ?? "",
    }));
}

export async function saveAttendance(dataDir: string, className: string, entries: AttendanceEntry[]): Promise<void> {
  const rows = entries.map((e) => ({ date: e.date, student_id: e.studentId, status: e.status, note: e.note }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "attendance.csv"), stringifyCsv(rows, ATTENDANCE_COLS));
}

// ---------- behaviour catalog + events ----------

const BEHAVIOUR_CODE_COLS = ["code", "label", "kind", "points", "color"];

export async function loadBehaviourCodes(dataDir: string): Promise<BehaviourCode[]> {
  const rows = await loadCsvFile(p(dataDir, "behaviours.csv"));
  const codes = rows
    .filter((r) => r.code)
    .map((r) => ({
      code: r.code,
      label: r.label ?? r.code,
      kind: (r.kind === "negative" ? "negative" : "positive") as "positive" | "negative",
      points: num(r.points),
      color: r.color || "#888888",
    }));
  return codes.length ? codes : DEFAULT_BEHAVIOURS;
}

export async function saveBehaviourCodes(dataDir: string, codes: BehaviourCode[]): Promise<void> {
  const rows = codes.map((c) => ({ code: c.code, label: c.label, kind: c.kind, points: c.points, color: c.color }));
  await getFS().writeAtomic(p(dataDir, "behaviours.csv"), stringifyCsv(rows, BEHAVIOUR_CODE_COLS));
}

const BEHAVIOUR_EVENT_COLS = ["timestamp", "student_id", "code", "points", "note"];

export async function loadBehaviourEvents(dataDir: string, className: string): Promise<BehaviourEvent[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "behaviour.csv"));
  return rows
    .filter((r) => r.timestamp && r.student_id)
    .map((r) => ({
      timestamp: r.timestamp,
      studentId: r.student_id,
      code: r.code ?? "",
      points: num(r.points),
      note: r.note ?? "",
    }));
}

export async function saveBehaviourEvents(dataDir: string, className: string, events: BehaviourEvent[]): Promise<void> {
  const rows = events.map((e) => ({
    timestamp: e.timestamp,
    student_id: e.studentId,
    code: e.code,
    points: e.points,
    note: e.note,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "behaviour.csv"), stringifyCsv(rows, BEHAVIOUR_EVENT_COLS));
}

// ---------- desks + seating ----------

const DESK_COLS = ["desk_id", "label", "shape", "x", "y", "w", "h", "rotation"];
const VALID_SHAPES: DeskShape[] = ["single", "double", "group4", "group6", "teacher", "door", "window"];

export async function loadDesks(dataDir: string, className: string): Promise<Desk[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "desks.csv"));
  return rows
    .filter((r) => r.desk_id)
    .map((r) => ({
      id: r.desk_id,
      label: r.label ?? "",
      shape: (VALID_SHAPES.includes(r.shape as DeskShape) ? r.shape : "single") as DeskShape,
      x: num(r.x),
      y: num(r.y),
      w: num(r.w, 80),
      h: num(r.h, 60),
      rotation: num(r.rotation),
    }));
}

export async function saveDesks(dataDir: string, className: string, desks: Desk[]): Promise<void> {
  const rows = desks.map((d) => ({
    desk_id: d.id,
    label: d.label,
    shape: d.shape,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    rotation: d.rotation,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "desks.csv"), stringifyCsv(rows, DESK_COLS));
}

const SEATING_COLS = ["plan_name", "desk_id", "seat_index", "student_id"];

export async function loadSeating(dataDir: string, className: string): Promise<SeatAssignment[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "seating.csv"));
  return rows
    .filter((r) => r.plan_name && r.desk_id)
    .map((r) => ({
      planName: r.plan_name,
      deskId: r.desk_id,
      seatIndex: num(r.seat_index),
      studentId: r.student_id ?? "",
    }));
}

export async function saveSeating(dataDir: string, className: string, seats: SeatAssignment[]): Promise<void> {
  const rows = seats.map((s) => ({
    plan_name: s.planName,
    desk_id: s.deskId,
    seat_index: s.seatIndex,
    student_id: s.studentId,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "seating.csv"), stringifyCsv(rows, SEATING_COLS));
}

// ---------- assessments + marks ----------

const ASSESSMENT_COLS = ["assessment_id", "title", "date", "total_marks", "weight", "category"];

export async function loadAssessments(dataDir: string, className: string): Promise<Assessment[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "assessments.csv"));
  return rows
    .filter((r) => r.assessment_id)
    .map((r) => ({
      id: r.assessment_id,
      title: r.title ?? "",
      date: r.date ?? "",
      totalMarks: num(r.total_marks, 100),
      weight: num(r.weight, 1),
      category: r.category ?? "",
    }));
}

export async function saveAssessments(dataDir: string, className: string, assessments: Assessment[]): Promise<void> {
  const rows = assessments.map((a) => ({
    assessment_id: a.id,
    title: a.title,
    date: a.date,
    total_marks: a.totalMarks,
    weight: a.weight,
    category: a.category,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "assessments.csv"), stringifyCsv(rows, ASSESSMENT_COLS));
}

const MARK_COLS = ["assessment_id", "student_id", "mark", "comment"];

export async function loadMarks(dataDir: string, className: string): Promise<Mark[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "marks.csv"));
  return rows
    .filter((r) => r.assessment_id && r.student_id)
    .map((r) => ({
      assessmentId: r.assessment_id,
      studentId: r.student_id,
      mark: numOrNull(r.mark),
      comment: r.comment ?? "",
    }));
}

export async function saveMarks(dataDir: string, className: string, marks: Mark[]): Promise<void> {
  const rows = marks.map((m) => ({
    assessment_id: m.assessmentId,
    student_id: m.studentId,
    mark: m.mark === null ? "" : m.mark,
    comment: m.comment,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "marks.csv"), stringifyCsv(rows, MARK_COLS));
}
