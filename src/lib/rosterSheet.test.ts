import { describe, expect, it } from "vitest";
import { applyRosterImport, planRosterImport, rosterFileName, rosterWorkbook, safeClassName } from "./rosterSheet";
import { readXlsx } from "./xlsxRead";
import { buildXlsx } from "./xlsx";
import { ClassInfo, Student } from "./types";

const cls = (name: string, year = "", room = ""): ClassInfo => ({ name, year, subject: "Physical Science", room, notes: "", archived: false, color: "" });
const stu = (id: string, firstName: string, lastName: string, extra: Partial<Student> = {}): Student => ({ id, firstName, lastName, gender: "", flags: "", notes: "", ...extra });

const classes = [cls("G10 - Key L", "10", "M6"), cls("G12 - Key C", "12", "M6")];
const students = new Map([
  ["G10 - Key L", [stu("s1", "Aidan", "Carter", { gender: "M" }), stu("s2", "Tye", "Daniel", { flags: "SEN" })]],
  ["G12 - Key C", [stu("s3", "Lebo", "Mokoena")]],
]);
const S = ["Class", "Surname", "Name", "Gender", "Flags", "Notes", "Student ID"];
const sheet = (name: string, rows: string[][]) => ({ name, rows });

describe("roster workbook", () => {
  it("lists every class and its students, and reads back the same", async () => {
    const sheets = await readXlsx(buildXlsx(rosterWorkbook(classes, students, false)));
    expect(sheets.map((s) => s.name)).toEqual(["Students", "Classes", "About"]);
    expect(sheets[0].rows[0]).toEqual(S);
    expect(sheets[0].rows[2]).toEqual(["G10 - Key L", "Daniel", "Tye", "", "SEN", "", "s2"]);
    expect(sheets[1].rows[1]).toEqual(["G10 - Key L", "10", "Physical Science", "M6"]);
    // Importing the untouched workbook changes nothing.
    const plan = planRosterImport(sheets, classes, students, null);
    expect(plan.problems).toEqual([]);
    const out = applyRosterImport(plan, students);
    expect(out.classes).toEqual([]);
    expect(out.students.size).toBe(0);
  });

  it("is named for one class or all", () => {
    expect(rosterFileName("G10 / Key L")).toBe("Students - G10  Key L.xlsx");
    expect(rosterFileName()).toBe("Classes and students.xlsx");
    expect(safeClassName(' G11: "A" ')).toBe("G11 A");
  });
});

describe("planRosterImport", () => {
  it("adds new students and classes, updates details, and leaves blanks and absentees alone", () => {
    const sheets = [
      sheet("Students", [
        S,
        ["G10 - Key L", "Carter", "Aidan", "", "SEN, Medical", "Glasses", "s1"], // blank gender left as M
        ["G10 - Key L", "Ndlovu", "Sipho", "M", "", "", ""], // new
        ["G11 - Key A", "Smith", "Ann", "F", "", "", ""], // new class from the Students sheet alone
      ]),
      sheet("Classes", [["Class", "Grade", "Subject", "Room"], ["G12 - Key C", "", "", "L3"], ["G11 - Key A", "11", "", ""]]),
    ];
    const plan = planRosterImport(sheets, classes, students, null);
    expect(plan.problems).toEqual([]);
    const g12 = plan.classes.find((c) => c.info.name === "G12 - Key C")!;
    expect(g12).toMatchObject({ isNew: false, changed: ["Room"] });
    expect(g12.info.year).toBe("12");
    expect(plan.classes.find((c) => c.info.name === "G11 - Key A")).toMatchObject({ isNew: true, info: { year: "11" } });
    expect(plan.notInFile).toEqual([{ className: "G10 - Key L", name: "Tye Daniel" }]); // listed, never removed

    const out = applyRosterImport(plan, students);
    const g10 = out.students.get("G10 - Key L")!;
    expect(g10.find((s) => s.id === "s1")).toMatchObject({ gender: "M", flags: "SEN;Medical", notes: "Glasses" });
    expect(g10.find((s) => s.id === "s2")).toBeTruthy();
    expect(g10.find((s) => s.lastName === "Ndlovu")).toMatchObject({ firstName: "Sipho", gender: "M" });
    expect(out.students.get("G11 - Key A")!.map((s) => s.lastName)).toEqual(["Smith"]);
    expect(out.students.has("G12 - Key C")).toBe(false); // nothing changed there
  });

  it("renames a student matched by Student ID, and matches by name (any case) without one", () => {
    const plan = planRosterImport(
      [sheet("Students", [S, ["G10 - Key L", "Carter-Jones", "Aidan", "", "", "", "s1"], ["g10 - key l", "DANIEL", "tye", "", "", "Left-handed", ""]])],
      classes,
      students,
      null,
    );
    expect(plan.students.map((c) => [c.student.id, c.isNew, c.changed])).toEqual([
      ["s1", false, ["Surname"]],
      ["s2", false, ["Notes"]],
    ]);
  });

  it("for one class, takes rows without a class and skips other classes", () => {
    const plan = planRosterImport(
      [sheet("CSV", [["Surname", "Name", "Class"], ["Zulu", "Nandi", ""], ["Mokoena", "Lebo", "G12 - Key C"]])],
      classes,
      students,
      "G10 - Key L",
    );
    expect(plan.problems).toEqual(['Students row 3 (Mokoena, Lebo): "G12 - Key C" isn\'t this class, so it was skipped.']);
    expect(plan.students.map((c) => [c.className, c.student.lastName, c.isNew])).toEqual([["G10 - Key L", "Zulu", true]]);
    expect(plan.classes.every((c) => !c.isNew)).toBe(true);
  });

  it("explains rows it can't use", () => {
    const plan = planRosterImport([sheet("Students", [S, ["", "Brown", "Ben", "", "", "", ""], ["G10 - Key L", "", "", "M", "", "", ""]])], classes, students, null);
    expect(plan.problems).toEqual([
      "Students row 2 (Brown, Ben): no class given, so it was skipped.",
      "Students row 3: no surname or name, so it was skipped.",
    ]);
    expect(planRosterImport([sheet("Sheet1", [["Hello"]])], classes, students, null).problems[0]).toMatch(/No Students or Classes sheet/);
  });

  it("uses the later of two rows for the same student", () => {
    const plan = planRosterImport(
      [sheet("Students", [S, ["G12 - Key C", "Mokoena", "Lebo", "M", "", "", "s3"], ["G12 - Key C", "Mokoena", "Lebo", "", "", "Captain", "s3"]])],
      classes,
      students,
      null,
    );
    expect(plan.problems[0]).toMatch(/listed more than once/);
    expect(plan.students).toHaveLength(1);
    expect(plan.students[0].student).toMatchObject({ gender: "M", notes: "Captain" });
  });
});
