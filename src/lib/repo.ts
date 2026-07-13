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
//   classes/<class>/seating_prefs.csv     type,a,b   (random-seating constraints)
//   classes/<class>/lessons.csv           session_id,date,timestamp,student_id,desk_id,desk_label,seatmates,points,positives,negatives
//   classes/<class>/assessments.csv       assessment_id,title,date,total_marks,category,question_count,content_area
//   classes/<class>/assessment_questions.csv  assessment_id,q_number,topic,marks,cognitive_level
//   classes/<class>/question_marks.csv    assessment_id,student_id,q_number,mark
//   classes/<class>/marks.csv             assessment_id,student_id,mark,comment
//   behaviours.csv, topics.csv, cognitive_levels.csv, settings.csv   app-wide (root)
//   layouts/<name>/desks.csv + room.csv   reusable room templates
//   backups/<stamp>/...                   rolling snapshots

import { getFS } from "./fs";
import { parseCsv, stringifyCsv, num, numOrNull } from "./csv";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  AttendanceStatus,
  BehaviourCode,
  BehaviourEvent,
  ClassInfo,
  CognitiveLevel,
  DEFAULT_BEHAVIOURS,
  DEFAULT_COGNITIVE_LEVELS,
  DEFAULT_ROOM_CONFIG,
  DEFAULT_SEATING_PREFS,
  Desk,
  DeskShape,
  FrontEdge,
  LessonRecord,
  Mark,
  QuestionMark,
  RoomConfig,
  SeatAssignment,
  SeatingPrefs,
  Student,
  TopicEntry,
  UserPrefs,
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
  if (!(await fs.exists(p(dataDir, "cognitive_levels.csv")))) {
    await saveCognitiveLevels(dataDir, DEFAULT_COGNITIVE_LEVELS);
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

const DESK_COLS = ["desk_id", "label", "shape", "x", "y", "w", "h", "rotation", "color"];
const VALID_SHAPES: DeskShape[] = ["single", "double", "group4", "group6", "teacher", "door", "window", "label"];

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
      color: r.color ?? "",
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
    color: d.color,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "desks.csv"), stringifyCsv(rows, DESK_COLS));
}

// ---------- room configuration (room.csv: key,value) ----------

const ROOM_COLS = ["key", "value"];
const VALID_EDGES: FrontEdge[] = ["top", "right", "bottom", "left"];

/** Font scale keys default to 1 and are clamped to a sane range on load. */
const scale = (v: string | undefined) => {
  const n = num(v, 1);
  return n > 0 ? Math.min(3, Math.max(0.5, n)) : 1;
};

export async function loadRoomConfig(dataDir: string, className: string): Promise<RoomConfig> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "room.csv"));
  const kv = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const frontEdge = (VALID_EDGES.includes(kv.get("front_edge") as FrontEdge) ? kv.get("front_edge") : "top") as FrontEdge;
  const cw = num(kv.get("crop_w"));
  const ch = num(kv.get("crop_h"));
  return {
    frontEdge,
    crop: cw > 0 && ch > 0 ? { x: num(kv.get("crop_x")), y: num(kv.get("crop_y")), w: cw, h: ch } : null,
    seatFontScale: scale(kv.get("seat_font_scale")),
    deskFontScale: scale(kv.get("desk_font_scale")),
    labelFontScale: scale(kv.get("label_font_scale")),
  };
}

export async function saveRoomConfig(dataDir: string, className: string, config: RoomConfig): Promise<void> {
  const rows: Array<{ key: string; value: string | number }> = [
    { key: "front_edge", value: config.frontEdge },
    { key: "seat_font_scale", value: config.seatFontScale },
    { key: "desk_font_scale", value: config.deskFontScale },
    { key: "label_font_scale", value: config.labelFontScale },
  ];
  if (config.crop) {
    rows.push(
      { key: "crop_x", value: config.crop.x },
      { key: "crop_y", value: config.crop.y },
      { key: "crop_w", value: config.crop.w },
      { key: "crop_h", value: config.crop.h },
    );
  }
  await getFS().writeAtomic(p(classDir(dataDir, className), "room.csv"), stringifyCsv(rows, ROOM_COLS));
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

// ---------- random-seating preferences (per class) ----------
// Stored as a tall type/a/b table so it opens cleanly in Excel:
//   apart,<idA>,<idB>   together,<idA>,<idB>   front,<id>,

const SEATING_PREFS_COLS = ["type", "a", "b"];

export async function loadSeatingPrefs(dataDir: string, className: string): Promise<SeatingPrefs> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "seating_prefs.csv"));
  const prefs: SeatingPrefs = { ...DEFAULT_SEATING_PREFS, apartPairs: [], togetherPairs: [], frontIds: [] };
  for (const r of rows) {
    if (r.type === "apart" && r.a && r.b) prefs.apartPairs.push([r.a, r.b]);
    else if (r.type === "together" && r.a && r.b) prefs.togetherPairs.push([r.a, r.b]);
    else if (r.type === "front" && r.a) prefs.frontIds.push(r.a);
  }
  return prefs;
}

export async function saveSeatingPrefs(dataDir: string, className: string, prefs: SeatingPrefs): Promise<void> {
  const rows: Array<{ type: string; a: string; b: string }> = [
    ...prefs.apartPairs.map(([a, b]) => ({ type: "apart", a, b })),
    ...prefs.togetherPairs.map(([a, b]) => ({ type: "together", a, b })),
    ...prefs.frontIds.map((a) => ({ type: "front", a, b: "" })),
  ];
  await getFS().writeAtomic(p(classDir(dataDir, className), "seating_prefs.csv"), stringifyCsv(rows, SEATING_PREFS_COLS));
}

// ---------- lesson history (per class) ----------

const LESSON_COLS = [
  "session_id",
  "date",
  "timestamp",
  "student_id",
  "desk_id",
  "desk_label",
  "seatmates",
  "points",
  "positives",
  "negatives",
];

export async function loadLessons(dataDir: string, className: string): Promise<LessonRecord[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "lessons.csv"));
  return rows
    .filter((r) => r.session_id && r.student_id)
    .map((r) => ({
      sessionId: r.session_id,
      date: r.date ?? "",
      timestamp: r.timestamp ?? "",
      studentId: r.student_id,
      deskId: r.desk_id ?? "",
      deskLabel: r.desk_label ?? "",
      seatmates: r.seatmates ?? "",
      points: num(r.points),
      positives: num(r.positives),
      negatives: num(r.negatives),
    }));
}

export async function saveLessons(dataDir: string, className: string, lessons: LessonRecord[]): Promise<void> {
  const rows = lessons.map((l) => ({
    session_id: l.sessionId,
    date: l.date,
    timestamp: l.timestamp,
    student_id: l.studentId,
    desk_id: l.deskId,
    desk_label: l.deskLabel,
    seatmates: l.seatmates,
    points: l.points,
    positives: l.positives,
    negatives: l.negatives,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "lessons.csv"), stringifyCsv(rows, LESSON_COLS));
}

// ---------- reusable room layout templates (shared across classes) ----------
// Each template is a folder under layouts/ holding the same desks.csv / room.csv
// files a class uses, so saving and applying reuses the serialisers above.

const layoutsDir = (dataDir: string) => p(dataDir, "layouts");
const templateDir = (dataDir: string, name: string) => p(layoutsDir(dataDir), name);

export async function listLayoutTemplates(dataDir: string): Promise<string[]> {
  const fs = getFS();
  const dir = layoutsDir(dataDir);
  if (!(await fs.exists(dir))) return [];
  const entries = await fs.listDir(dir);
  return entries
    .filter((e) => e.isDir && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function saveLayoutTemplate(
  dataDir: string,
  name: string,
  desks: Desk[],
  config: RoomConfig,
): Promise<void> {
  const fs = getFS();
  const dir = templateDir(dataDir, name);
  await fs.mkdirs(dir);
  const deskRows = desks.map((d) => ({
    desk_id: d.id,
    label: d.label,
    shape: d.shape,
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    rotation: d.rotation,
    color: d.color,
  }));
  await fs.writeAtomic(p(dir, "desks.csv"), stringifyCsv(deskRows, DESK_COLS));
  // Template keeps display settings but not a class-specific crop.
  const roomRows: Array<{ key: string; value: string | number }> = [
    { key: "front_edge", value: config.frontEdge },
    { key: "seat_font_scale", value: config.seatFontScale },
    { key: "desk_font_scale", value: config.deskFontScale },
    { key: "label_font_scale", value: config.labelFontScale },
  ];
  await fs.writeAtomic(p(dir, "room.csv"), stringifyCsv(roomRows, ROOM_COLS));
}

export async function loadLayoutTemplate(
  dataDir: string,
  name: string,
): Promise<{ desks: Desk[]; config: RoomConfig }> {
  const dir = templateDir(dataDir, name);
  const deskRows = await loadCsvFile(p(dir, "desks.csv"));
  const desks: Desk[] = deskRows
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
      color: r.color ?? "",
    }));
  const roomRows = await loadCsvFile(p(dir, "room.csv"));
  const kv = new Map(roomRows.map((r) => [r.key, r.value ?? ""]));
  const frontEdge = (VALID_EDGES.includes(kv.get("front_edge") as FrontEdge) ? kv.get("front_edge") : "top") as FrontEdge;
  const config: RoomConfig = {
    ...DEFAULT_ROOM_CONFIG,
    frontEdge,
    seatFontScale: scale(kv.get("seat_font_scale")),
    deskFontScale: scale(kv.get("desk_font_scale")),
    labelFontScale: scale(kv.get("label_font_scale")),
    crop: null,
  };
  return { desks, config };
}

export async function deleteLayoutTemplate(dataDir: string, name: string): Promise<void> {
  // No recursive delete in the FS abstraction; rename the folder out to a
  // trash area so it disappears from the template list.
  const trash = p(dataDir, "layouts", `.trash-${name}-${Date.now()}`);
  await getFS().rename(templateDir(dataDir, name), trash);
}

// ---------- assessments + marks ----------

const ASSESSMENT_COLS = ["assessment_id", "title", "date", "total_marks", "category", "question_count", "content_area"];

export async function loadAssessments(dataDir: string, className: string): Promise<Assessment[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "assessments.csv"));
  return rows
    .filter((r) => r.assessment_id)
    .map((r) => ({
      id: r.assessment_id,
      title: r.title ?? "",
      date: r.date ?? "",
      totalMarks: num(r.total_marks, 100),
      category: r.category ?? "",
      questionCount: Math.max(1, num(r.question_count, 1)),
      contentArea: r.content_area ?? "",
    }));
}

export async function saveAssessments(dataDir: string, className: string, assessments: Assessment[]): Promise<void> {
  const rows = assessments.map((a) => ({
    assessment_id: a.id,
    title: a.title,
    date: a.date,
    total_marks: a.totalMarks,
    category: a.category,
    question_count: a.questionCount,
    content_area: a.contentArea,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "assessments.csv"), stringifyCsv(rows, ASSESSMENT_COLS));
}

// ---------- assessment questions + per-question marks (per class) ----------

const QUESTION_COLS = ["assessment_id", "q_number", "topic", "marks", "cognitive_level"];

export async function loadAssessmentQuestions(dataDir: string, className: string): Promise<AssessmentQuestion[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "assessment_questions.csv"));
  return rows
    .filter((r) => r.assessment_id && r.q_number)
    .map((r) => ({
      assessmentId: r.assessment_id,
      number: num(r.q_number),
      topic: r.topic ?? "",
      marks: num(r.marks),
      cognitiveLevel: r.cognitive_level ?? "",
    }));
}

export async function saveAssessmentQuestions(
  dataDir: string,
  className: string,
  questions: AssessmentQuestion[],
): Promise<void> {
  const rows = questions.map((q) => ({
    assessment_id: q.assessmentId,
    q_number: q.number,
    topic: q.topic,
    marks: q.marks,
    cognitive_level: q.cognitiveLevel,
  }));
  await getFS().writeAtomic(
    p(classDir(dataDir, className), "assessment_questions.csv"),
    stringifyCsv(rows, QUESTION_COLS),
  );
}

const QUESTION_MARK_COLS = ["assessment_id", "student_id", "q_number", "mark"];

export async function loadQuestionMarks(dataDir: string, className: string): Promise<QuestionMark[]> {
  const rows = await loadCsvFile(p(classDir(dataDir, className), "question_marks.csv"));
  return rows
    .filter((r) => r.assessment_id && r.student_id && r.q_number)
    .map((r) => ({
      assessmentId: r.assessment_id,
      studentId: r.student_id,
      number: num(r.q_number),
      mark: numOrNull(r.mark),
    }));
}

export async function saveQuestionMarks(dataDir: string, className: string, marks: QuestionMark[]): Promise<void> {
  const rows = marks.map((m) => ({
    assessment_id: m.assessmentId,
    student_id: m.studentId,
    q_number: m.number,
    mark: m.mark === null ? "" : m.mark,
  }));
  await getFS().writeAtomic(p(classDir(dataDir, className), "question_marks.csv"), stringifyCsv(rows, QUESTION_MARK_COLS));
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

// ---------- assessable topic bank (app-wide, keyed by grade) ----------
// Tall grade/area/subtopic/short table so it opens cleanly in Excel. An area
// with no subtopics yet is kept alive by a row with an empty subtopic.

const TOPIC_COLS = ["grade", "area", "subtopic", "short"];

export async function loadTopics(dataDir: string): Promise<TopicEntry[]> {
  const rows = await loadCsvFile(p(dataDir, "topics.csv"));
  return rows
    .filter((r) => r.grade && r.area)
    .map((r) => ({
      grade: r.grade,
      area: r.area,
      subtopic: r.subtopic ?? "",
      short: r.short ?? "",
    }));
}

export async function saveTopics(dataDir: string, topics: TopicEntry[]): Promise<void> {
  const rows = topics.map((t) => ({ grade: t.grade, area: t.area, subtopic: t.subtopic, short: t.short }));
  await getFS().writeAtomic(p(dataDir, "topics.csv"), stringifyCsv(rows, TOPIC_COLS));
}

// ---------- cognitive levels (app-wide, editable) ----------

const COGNITIVE_LEVEL_COLS = ["code", "label"];

export async function loadCognitiveLevels(dataDir: string): Promise<CognitiveLevel[]> {
  const rows = await loadCsvFile(p(dataDir, "cognitive_levels.csv"));
  const levels = rows.filter((r) => r.code).map((r) => ({ code: r.code, label: r.label ?? r.code }));
  return levels.length ? levels : DEFAULT_COGNITIVE_LEVELS;
}

export async function saveCognitiveLevels(dataDir: string, levels: CognitiveLevel[]): Promise<void> {
  const rows = levels.map((l) => ({ code: l.code, label: l.label }));
  await getFS().writeAtomic(p(dataDir, "cognitive_levels.csv"), stringifyCsv(rows, COGNITIVE_LEVEL_COLS));
}

// ---------- app-wide user preferences (settings.csv: key,value) ----------

const SETTINGS_COLS = ["key", "value"];

export async function loadUserPrefs(dataDir: string): Promise<UserPrefs> {
  const rows = await loadCsvFile(p(dataDir, "settings.csv"));
  const kv = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  const enter = kv.get("mark_entry_enter");
  return {
    markGridEnter: enter === "down" ? "down" : "across",
  };
}

export async function saveUserPrefs(dataDir: string, prefs: UserPrefs): Promise<void> {
  const rows: Array<{ key: string; value: string }> = [{ key: "mark_entry_enter", value: prefs.markGridEnter }];
  await getFS().writeAtomic(p(dataDir, "settings.csv"), stringifyCsv(rows, SETTINGS_COLS));
}
