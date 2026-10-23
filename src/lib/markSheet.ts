// Marks templates: a spreadsheet of the class for one assessment, filled in
// away from the app (Excel, Google Sheets…) and imported back. One mark per
// student, or one column per question for a test marked per question.
//
// The template lists every student with any marks already entered, so it also
// serves to correct marks in bulk. On import a blank cell leaves the app's mark
// as it is; nothing is saved until the teacher has seen what will change.

import { fmtDecimal, parseDecimal } from "./format";
import { Assessment, AssessmentQuestion, Mark, QuestionMark, Student, adamKey, byName } from "./types";
import { SheetSpec } from "./xlsx";

/** The template's main sheet; the second, About, says which assessment it is for. */
export const MARKS_SHEET = "Marks";
const ABOUT_SHEET = "About";
const ID_LABEL = "Assessment ID";


/** The column heading for a question: "Q3 (/7,5)". */
const questionHeading = (q: AssessmentQuestion) => `Q${q.number} (/${fmtDecimal(q.marks)})`;

/** A file name for an assessment's template: "Marks - Cells test.xlsx". */
export function templateFileName(a: Assessment): string {
  const title = a.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "assessment";
  return `Marks - ${title}.xlsx`;
}

/**
 * The template for one assessment: a Marks sheet (No, Surname, Name, the mark
 * or one column per question, Comment for a single mark, Student ID) and an
 * About sheet with the assessment's details and how to use it.
 */
export function markTemplate(
  a: Assessment,
  className: string,
  students: Student[],
  questions: AssessmentQuestion[],
  marks: Mark[],
  questionMarks: QuestionMark[],
): SheetSpec[] {
  const perQuestion = a.questionCount > 1;
  const sorted = [...students].sort(byName);
  const markOf = (id: string) => marks.find((m) => m.assessmentId === a.id && m.studentId === id);
  const qMarkOf = (id: string, n: number) =>
    questionMarks.find((m) => m.assessmentId === a.id && m.studentId === id && m.number === n)?.mark ?? null;

  const columns = perQuestion
    ? ["No", "Surname", "Name", ...questions.map(questionHeading), "Adam number", "Student ID"]
    : ["No", "Surname", "Name", `Mark (out of ${fmtDecimal(a.totalMarks)})`, "Comment", "Adam number", "Student ID"];
  const rows = sorted.map((s, i) =>
    perQuestion
      ? [i + 1, s.lastName, s.firstName, ...questions.map((q) => qMarkOf(s.id, q.number)), s.adamNo, s.id]
      : [i + 1, s.lastName, s.firstName, markOf(s.id)?.mark ?? null, markOf(s.id)?.comment ?? "", s.adamNo, s.id],
  );

  const about: SheetSpec = {
    name: ABOUT_SHEET,
    columns: ["ClassKernel marks template", ""],
    rows: [
      ["Assessment", a.title],
      ["Class", className],
      ["Date", a.date],
      ["Out of", a.totalMarks],
      ["Marked", perQuestion ? `per question (${questions.length} questions)` : "one mark per student"],
      [ID_LABEL, a.id],
      [],
      ["How to use", `Type the marks on the ${MARKS_SHEET} sheet: one row per student${perQuestion ? ", one column per question" : ""}.`],
      ["", "A blank cell leaves that mark as it is in ClassKernel. A decimal comma or point both work (8,5 or 8.5)."],
      ["", "Keep the heading row. Students are recognised by Student ID, then Adam number, then name; sort the rows any way you like."],
      ["", "Save the file, then in ClassKernel open this assessment and press Import marks."],
    ],
  };
  return [{ name: MARKS_SHEET, columns, rows }, about];
}

// ---------- import ----------

export interface ImportRow {
  studentId: string;
  /** The student's name as the class has it. */
  name: string;
  /** Question number → mark (1 for a single-mark test). Blank cells are left out. */
  values: Map<number, number>;
  /** A single-mark test's comment; null when the cell is blank or there is no column. */
  comment: string | null;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** One line per cell or row that was skipped, and why. */
  problems: string[];
  /** The title of the assessment the file was made for, when it is another one. */
  otherAssessment: string | null;
  /** Marks the import adds, changes, or finds already the same. */
  added: number;
  changed: number;
  same: number;
}

/** Cells a teacher might type for "didn't write": treated as blank. */
const ABSENT = new Set(["ab", "abs", "absent", "-", "—", "–", "x"]);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Read a filled-in sheet (rows of cell text, any header row position) against
 * one assessment: match each row to a student by Student ID, Adam number, or
 * surname and name, check every mark lies between 0 and its maximum, and count what would
 * change. `aboutRows` is the template's About sheet, when the file has one.
 */
export function planImport(
  rows: string[][],
  aboutRows: string[][] | null,
  a: Assessment,
  questions: AssessmentQuestion[],
  students: Student[],
  marks: Mark[],
  questionMarks: QuestionMark[],
): ImportPlan {
  const perQuestion = a.questionCount > 1;
  const problems: string[] = [];

  const madeFor = aboutRows?.find((r) => norm(r[0] ?? "") === norm(ID_LABEL))?.[1]?.trim();
  const otherAssessment = madeFor && madeFor !== a.id ? (aboutRows?.find((r) => norm(r[0] ?? "") === "assessment")?.[1] ?? "another assessment") : null;

  const headerAt = rows.findIndex((r) => r.some((c) => ["surname", "student id"].includes(norm(c))));
  if (headerAt < 0) {
    return { rows: [], problems: ["No heading row with Surname or Student ID was found, so no marks could be read."], otherAssessment, added: 0, changed: 0, same: 0 };
  }
  const header = rows[headerAt].map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idCol = col("student id");
  const adamCol = col("adam number", "adam no", "adam no.", "adam");
  const surnameCol = col("surname");
  const nameCol = col("name", "first name", "firstname");
  const commentCol = perQuestion ? -1 : col("comment");

  // Which column holds which question (1 for a single mark).
  const markCols = new Map<number, number>();
  const maxOf = new Map<number, number>();
  if (perQuestion) {
    for (const q of questions) maxOf.set(q.number, q.marks);
    header.forEach((h, i) => {
      const m = /^q\s*(\d+)\b/.exec(h);
      if (!m) return;
      const n = Number(m[1]);
      if (maxOf.has(n)) markCols.set(n, i);
      else problems.push(`Column "${rows[headerAt][i]}" isn't a question of this test, so it was ignored.`);
    });
    if (markCols.size === 0) problems.push("No question columns (Q1, Q2 …) were found in the heading row.");
  } else {
    maxOf.set(1, a.totalMarks);
    const i = header.findIndex((h) => h.startsWith("mark"));
    if (i >= 0) markCols.set(1, i);
    else problems.push("No Mark column was found in the heading row.");
  }

  const byId = new Map(students.map((s) => [s.id, s]));
  const byAdam = new Map(students.filter((s) => adamKey(s.adamNo)).map((s) => [adamKey(s.adamNo), s]));
  const byFullName = new Map(students.map((s) => [`${norm(s.lastName)}|${norm(s.firstName)}`, s]));
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  let added = 0;
  let changed = 0;
  let same = 0;

  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
    if (!row.some((c) => c && c.trim())) continue;
    const surname = cell(surnameCol);
    const first = cell(nameCol);
    const label = `Row ${r + 1}${surname || first ? ` (${[surname, first].filter(Boolean).join(", ")})` : ""}`;
    // Recognised by ClassKernel's id, then the school's Adam number, then the name.
    const student = byId.get(cell(idCol)) ?? byAdam.get(adamKey(cell(adamCol))) ?? byFullName.get(`${norm(surname)}|${norm(first)}`);
    if (!student) {
      problems.push(`${label}: no such student in this class, so the row was skipped.`);
      continue;
    }
    if (seen.has(student.id)) problems.push(`${label}: ${student.firstName} ${student.lastName} is listed more than once; this later row was used.`);
    seen.add(student.id);

    const values = new Map<number, number>();
    for (const [n, i] of markCols) {
      const text = cell(i);
      if (!text || ABSENT.has(norm(text))) continue;
      const v = parseDecimal(text);
      const where = perQuestion ? `${label}, Q${n}` : label;
      if (!Number.isFinite(v)) problems.push(`${where}: "${text}" isn't a number, so it was skipped.`);
      else if (v < 0) problems.push(`${where}: ${fmtDecimal(v)} is below 0, so it was skipped.`);
      else if (v > maxOf.get(n)!) problems.push(`${where}: ${fmtDecimal(v)} is more than ${fmtDecimal(maxOf.get(n)!)}, so it was skipped.`);
      else values.set(n, v);
    }
    const comment = cell(commentCol) || null;

    for (const [n, v] of values) {
      const before = perQuestion
        ? (questionMarks.find((m) => m.assessmentId === a.id && m.studentId === student.id && m.number === n)?.mark ?? null)
        : (marks.find((m) => m.assessmentId === a.id && m.studentId === student.id)?.mark ?? null);
      if (before === null) added++;
      else if (before === v) same++;
      else changed++;
    }
    const index = out.findIndex((x) => x.studentId === student.id);
    const entry = { studentId: student.id, name: `${student.firstName} ${student.lastName}`, values, comment };
    if (index >= 0) out[index] = entry;
    else out.push(entry);
  }
  return { rows: out, problems, otherAssessment, added, changed, same };
}

/**
 * The marks after an import. Per question, each student's total in marks.csv
 * is recomputed from their question marks, as the marking grid does.
 */
export function applyImport(plan: ImportPlan, a: Assessment, marks: Mark[], questionMarks: QuestionMark[]): { marks: Mark[]; questionMarks: QuestionMark[] } {
  if (a.questionCount <= 1) {
    let next = marks;
    for (const row of plan.rows) {
      const value = row.values.get(1);
      if (value === undefined && row.comment === null) continue;
      const existing = next.find((m) => m.assessmentId === a.id && m.studentId === row.studentId);
      const rest = next.filter((m) => m !== existing);
      next = [...rest, { assessmentId: a.id, studentId: row.studentId, mark: value ?? existing?.mark ?? null, comment: row.comment ?? existing?.comment ?? "" }];
    }
    return { marks: next, questionMarks };
  }

  let qm = questionMarks;
  let next = marks;
  for (const row of plan.rows) {
    if (row.values.size === 0) continue;
    qm = qm.filter((m) => !(m.assessmentId === a.id && m.studentId === row.studentId && row.values.has(m.number)));
    for (const [number, mark] of row.values) qm.push({ assessmentId: a.id, studentId: row.studentId, number, mark });
    const mine = qm.filter((m) => m.assessmentId === a.id && m.studentId === row.studentId && m.mark != null);
    const total = mine.reduce((s, m) => s + (m.mark as number), 0);
    const existing = next.find((m) => m.assessmentId === a.id && m.studentId === row.studentId);
    next = [...next.filter((m) => m !== existing), { assessmentId: a.id, studentId: row.studentId, mark: total, comment: existing?.comment ?? "" }];
  }
  return { marks: next, questionMarks: qm };
}
