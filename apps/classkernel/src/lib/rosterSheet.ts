// Classes and students in a spreadsheet: a workbook with a Classes sheet
// (Class, Grade, Subject, Room) and a Students sheet (Class, Surname, Name,
// Gender, Flags, Notes, Student ID), downloaded for every class (Settings) or
// for one (its Students page), filled in elsewhere and imported back.
//
// An import adds and updates, and never removes: a blank cell leaves that
// detail as it is, and a student missing from the file stays in the class
// (the preview lists them). Nothing is saved until the teacher has seen it.

import { newId } from "./id";
import { ClassInfo, Student, adamKey, byName } from "./types";
import { SheetSpec } from "./xlsx";
import { ReadSheet } from "./xlsxRead";

export const CLASSES_SHEET = "Classes";
export const STUDENTS_SHEET = "Students";

const CLASS_COLUMNS = ["Class", "Grade", "Subject", "Room"];
const STUDENT_COLUMNS = ["Class", "Surname", "Name", "Adam number", "Gender", "Flags", "Notes", "Student ID"];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A class name as a folder can hold it (the same rule as the New class dialog). */
export const safeClassName = (name: string) => name.replace(/[<>:"/\\|?*]/g, "").trim();

/** Flags typed as "SEN, Medical" or "SEN;Medical" → "SEN;Medical". */
const normFlags = (text: string) =>
  text
    .split(/[;,]/)
    .map((f) => f.trim())
    .filter(Boolean)
    .join(";");

/**
 * The workbook for some classes: one Classes row each, their students (by
 * surname) on the Students sheet, and an About sheet on how to use it.
 */
export function rosterWorkbook(classes: ClassInfo[], studentsByClass: Map<string, Student[]>, forOneClass: boolean): SheetSpec[] {
  const students = classes.flatMap((c) =>
    [...(studentsByClass.get(c.name) ?? [])]
      .sort(byName)
      .map((s) => [c.name, s.lastName, s.firstName, s.adamNo, s.gender, s.flags.split(";").join("; "), s.notes, s.id]),
  );
  return [
    { name: STUDENTS_SHEET, columns: STUDENT_COLUMNS, rows: students },
    { name: CLASSES_SHEET, columns: CLASS_COLUMNS, rows: classes.map((c) => [c.name, c.year, c.subject, c.room]) },
    {
      name: "About",
      columns: ["ClassKernel classes and students", ""],
      rows: [
        ["How to use", "Students: one row per student, with their class in the Class column. New rows become new students."],
        ["", forOneClass ? "This file is for one class: rows for any other class are skipped." : "Classes: one row per class. A class named here or on the Students sheet that doesn't exist yet is created."],
        ["", "A blank cell leaves that detail as it is in ClassKernel. Nobody is removed by an import."],
        ["", "Flags are separated by ; or , (e.g. SEN; Medical). Students are recognised by Student ID, then Adam number, then name, so keep those columns."],
        ["", forOneClass ? "Save the file, then on the class's Students page press Import spreadsheet." : "Save the file, then under Settings › General press Import classes and students."],
      ],
    },
  ];
}

/** A file name for the workbook. */
export function rosterFileName(oneClass?: string): string {
  return oneClass ? `Students - ${safeClassName(oneClass) || "class"}.xlsx` : "Classes and students.xlsx";
}

// ---------- import ----------

export interface ClassChange {
  info: ClassInfo;
  isNew: boolean;
  /** Fields that differ from the app ("Grade", "Room" …); empty when nothing changes. */
  changed: string[];
}

export interface StudentChange {
  className: string;
  student: Student;
  isNew: boolean;
  changed: string[];
}

export interface RosterPlan {
  classes: ClassChange[];
  students: StudentChange[];
  /** Students in a class the file lists, who aren't in the file: left as they are. */
  notInFile: Array<{ className: string; name: string }>;
  /** One line per row or cell that was skipped, and why. */
  problems: string[];
}

/** The heading row: the first row naming any of `wanted`, with each wanted column's position (-1 when missing). */
function headings(rows: string[][], wanted: string[]): { at: number; col: (name: string, ...aliases: string[]) => number } | null {
  const at = rows.findIndex((r) => r.some((c) => wanted.includes(norm(c ?? ""))));
  if (at < 0) return null;
  const header = rows[at].map((c) => norm(c ?? ""));
  return { at, col: (name, ...aliases) => header.findIndex((h) => h === name || aliases.includes(h)) };
}

/**
 * Read the Classes and Students sheets (either may be missing; a single
 * sheet, as from a .csv, is read as whichever its headings match) against the
 * app's classes and their students. `onlyClass` limits it to one class, which
 * the rows may also leave blank.
 */
export function planRosterImport(
  sheets: ReadSheet[],
  classes: ClassInfo[],
  studentsByClass: Map<string, Student[]>,
  onlyClass: string | null,
): RosterPlan {
  const problems: string[] = [];
  const findSheet = (name: string, mustHave: string) =>
    sheets.find((s) => s.name === name) ?? sheets.find((s) => s.rows.some((r) => r.some((c) => norm(c ?? "") === mustHave)));
  const classSheet = findSheet(CLASSES_SHEET, "grade");
  const studentSheet = findSheet(STUDENTS_SHEET, "surname");

  // Classes: the app's, plus any the file adds. Matched by name, ignoring case
  // (Windows folders do the same).
  const planned = new Map<string, ClassChange>(); // by norm(name)
  const existing = new Map(classes.map((c) => [norm(c.name), c]));
  const classFor = (raw: string, where: string): ClassChange | null => {
    let name = safeClassName(raw);
    if (onlyClass) {
      if (name && norm(name) !== norm(onlyClass)) {
        problems.push(`${where}: "${raw}" isn't this class, so it was skipped.`);
        return null;
      }
      name = onlyClass; // blank or this class
    }
    if (!name) {
      problems.push(`${where}: no class given, so it was skipped.`);
      return null;
    }
    let change = planned.get(norm(name));
    if (!change) {
      const info = existing.get(norm(name));
      change = info
        ? { info: { ...info }, isNew: false, changed: [] }
        : { info: { name, year: "", subject: "", room: "", notes: "", archived: false, color: "" }, isNew: true, changed: [] };
      planned.set(norm(name), change);
    }
    return change;
  };

  if (classSheet && classSheet !== studentSheet) {
    const h = headings(classSheet.rows, ["class"]);
    if (!h) problems.push(`The ${classSheet.name} sheet has no heading row with Class, so it was skipped.`);
    else {
      const cols = { name: h.col("class"), year: h.col("grade", "year"), subject: h.col("subject"), room: h.col("room") };
      for (let r = h.at + 1; r < classSheet.rows.length; r++) {
        const row = classSheet.rows[r] ?? [];
        const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
        if (!row.some((c) => c && c.trim())) continue;
        const change = classFor(cell(cols.name), `${CLASSES_SHEET} row ${r + 1}`);
        if (!change) continue;
        for (const [key, label] of [["year", "Grade"], ["subject", "Subject"], ["room", "Room"]] as const) {
          const v = cell(cols[key]);
          if (v && v !== change.info[key]) {
            change.info[key] = v;
            if (!change.isNew && !change.changed.includes(label)) change.changed.push(label);
          }
        }
      }
    }
  }

  const studentChanges: StudentChange[] = [];
  const listed = new Map<string, Set<string>>(); // class → student ids in the file
  if (!studentSheet) {
    if (!classSheet) problems.push("No Students or Classes sheet was found (a heading row with Surname, or with Class and Grade).");
  } else {
    const h = headings(studentSheet.rows, ["surname", "student id"]);
    if (!h) problems.push(`The ${studentSheet.name} sheet has no heading row with Surname, so it was skipped.`);
    else {
      const cols = {
        cls: h.col("class"),
        last: h.col("surname", "last name"),
        first: h.col("name", "first name", "firstname"),
        adam: h.col("adam number", "adam no", "adam no.", "adam"),
        gender: h.col("gender"),
        flags: h.col("flags"),
        notes: h.col("notes"),
        id: h.col("student id"),
      };
      for (let r = h.at + 1; r < studentSheet.rows.length; r++) {
        const row = studentSheet.rows[r] ?? [];
        const cell = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
        if (!row.some((c) => c && c.trim())) continue;
        const last = cell(cols.last);
        const first = cell(cols.first);
        const where = `${STUDENTS_SHEET} row ${r + 1}${last || first ? ` (${[last, first].filter(Boolean).join(", ")})` : ""}`;
        const cls = classFor(cell(cols.cls), where);
        if (!cls) continue;
        const className = cls.info.name;
        const inClass = [...(studentsByClass.get(className) ?? []), ...studentChanges.filter((c) => c.className === className && c.isNew).map((c) => c.student)];
        const id = cell(cols.id);
        const adam = adamKey(cell(cols.adam));
        // Recognised by ClassKernel's id, then the school's Adam number, then the name.
        const byId = (id ? inClass.find((s) => s.id === id) : undefined) ?? (adam ? inClass.find((s) => adamKey(s.adamNo) === adam) : undefined);
        const match = byId ?? inClass.find((s) => norm(s.lastName) === norm(last) && norm(s.firstName) === norm(first));
        if (!match && !last && !first) {
          problems.push(`${where}: no surname or name, so it was skipped.`);
          continue;
        }
        const ids = listed.get(className) ?? new Set<string>();
        listed.set(className, ids);
        if (match && ids.has(match.id)) problems.push(`${where}: ${match.firstName} ${match.lastName} is listed more than once in ${className}; this later row was used.`);

        const prior = studentChanges.find((c) => c.className === className && c.student.id === match?.id);
        const change: StudentChange = prior ?? {
          className,
          student: match ? { ...match } : { id: newId("s"), firstName: first, lastName: last, adamNo: "", gender: "", flags: "", notes: "" },
          isNew: !match,
          changed: [],
        };
        const set = (key: "firstName" | "lastName" | "adamNo" | "gender" | "flags" | "notes", value: string, label: string) => {
          if (!value || value === change.student[key]) return;
          change.student[key] = value;
          if (!change.isNew && !change.changed.includes(label)) change.changed.push(label);
        };
        // A new name only takes when the row was matched by Student ID or Adam number (a rename); otherwise the name is how it matched.
        if (byId || change.isNew) {
          set("lastName", last, "Surname");
          set("firstName", first, "Name");
        }
        if (adamKey(cell(cols.adam)) !== adamKey(change.student.adamNo)) set("adamNo", cell(cols.adam), "Adam number");
        set("gender", cell(cols.gender), "Gender");
        set("flags", normFlags(cell(cols.flags)), "Flags");
        set("notes", cell(cols.notes), "Notes");
        ids.add(change.student.id);
        if (!prior) studentChanges.push(change);
      }
    }
  }

  const notInFile = [...listed.entries()].flatMap(([className, ids]) =>
    (studentsByClass.get(className) ?? [])
      .filter((s) => !ids.has(s.id))
      .sort(byName)
      .map((s) => ({ className, name: `${s.firstName} ${s.lastName}` })),
  );
  return { classes: [...planned.values()], students: studentChanges, notInFile, problems };
}

/** What an import writes: every class it adds or changes, and the full student list of every class it touches. */
export function applyRosterImport(plan: RosterPlan, studentsByClass: Map<string, Student[]>): { classes: ClassInfo[]; students: Map<string, Student[]> } {
  const classes = plan.classes.filter((c) => c.isNew || c.changed.length).map((c) => c.info);
  const students = new Map<string, Student[]>();
  for (const c of plan.students) {
    if (!c.isNew && c.changed.length === 0) continue;
    const list = students.get(c.className) ?? [...(studentsByClass.get(c.className) ?? [])];
    const i = list.findIndex((s) => s.id === c.student.id);
    if (i >= 0) list[i] = c.student;
    else list.push(c.student);
    students.set(c.className, list);
  }
  // A new class with no students still gets its (empty) list written.
  for (const c of plan.classes) if (c.isNew && !students.has(c.info.name)) students.set(c.info.name, []);
  return { classes, students };
}
