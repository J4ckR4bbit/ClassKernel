import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { applyImport, markTemplate, planImport, templateFileName } from "./markSheet";
import { readXlsx } from "./xlsxRead";
import { buildXlsx, crc32 } from "./xlsx";
import { Assessment, AssessmentQuestion, Mark, QuestionMark, Student } from "./types";

const student = (id: string, firstName: string, lastName: string): Student => ({ id, firstName, lastName, gender: "", flags: "", notes: "" });
const students = [student("s1", "Amelia", "Adams"), student("s2", "Harry", "Baker"), student("s3", "Olivia", "Clark")];

const single: Assessment = { id: "a1", title: "Cells test", date: "2026-08-28", totalMarks: 40, category: "Test", questionCount: 1, contentArea: "", kind: "informal", weight: 1 };
const perQ: Assessment = { ...single, id: "a2", title: "Forces test", totalMarks: 20, questionCount: 2 };
const questions: AssessmentQuestion[] = [
  { assessmentId: "a2", number: 1, topic: "Forces", marks: 7.5, cognitiveLevel: "L1" },
  { assessmentId: "a2", number: 2, topic: "Energy", marks: 12.5, cognitiveLevel: "L2" },
];

/** Re-zip a stored workbook with every entry deflated, as Excel saves it. */
function deflateZip(stored: Uint8Array): Uint8Array {
  const view = new DataView(stored.buffer, stored.byteOffset, stored.byteLength);
  const files: Array<{ name: Uint8Array; data: Uint8Array; packed: Uint8Array }> = [];
  let off = 0;
  while (view.getUint32(off, true) === 0x04034b50) {
    const nameLen = view.getUint16(off + 26, true);
    const size = view.getUint32(off + 18, true);
    const name = stored.subarray(off + 30, off + 30 + nameLen);
    const data = stored.subarray(off + 30 + nameLen, off + 30 + nameLen + size);
    files.push({ name, data, packed: new Uint8Array(deflateRawSync(data)) });
    off += 30 + nameLen + size;
  }
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  for (const f of files) {
    const at = parts.length;
    u32(parts, 0x04034b50); u16(parts, 20); u16(parts, 0); u16(parts, 8); u16(parts, 0); u16(parts, 0);
    u32(parts, crc32(f.data)); u32(parts, f.packed.length); u32(parts, f.data.length); u16(parts, f.name.length); u16(parts, 0);
    parts.push(...f.name, ...f.packed);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, 0); u16(central, 8); u16(central, 0); u16(central, 0);
    u32(central, crc32(f.data)); u32(central, f.packed.length); u32(central, f.data.length); u16(central, f.name.length);
    u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, at);
    central.push(...f.name);
  }
  const end: number[] = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length);
  u32(end, central.length); u32(end, parts.length); u16(end, 0);
  return new Uint8Array([...parts, ...central, ...end]);
}

describe("marks template", () => {
  it("lists the class with any marks so far, and says which assessment it is for", async () => {
    const marks: Mark[] = [{ assessmentId: "a1", studentId: "s2", mark: 31.5, comment: "late" }];
    const sheets = await readXlsx(buildXlsx(markTemplate(single, "7B", students, [], marks, [])));
    expect(sheets.map((s) => s.name)).toEqual(["Marks", "About"]);
    expect(sheets[0].rows[0]).toEqual(["No", "Surname", "Name", "Mark (out of 40)", "Comment", "Student ID"]);
    expect(sheets[0].rows[2]).toEqual(["2", "Baker", "Harry", "31.5", "late", "s2"]);
    expect(sheets[1].rows.find((r) => r[0] === "Assessment ID")?.[1]).toBe("a1");
  });

  it("has a column per question, headed with its maximum", async () => {
    const sheets = await readXlsx(buildXlsx(markTemplate(perQ, "7B", students, questions, [], [])));
    expect(sheets[0].rows[0]).toEqual(["No", "Surname", "Name", "Q1 (/7,5)", "Q2 (/12,5)", "Student ID"]);
  });

  it("is named after the assessment", () => {
    expect(templateFileName({ ...single, title: "Term 3: test/1" })).toBe("Marks - Term 3 test 1.xlsx");
  });
});

describe("readXlsx", () => {
  it("reads a deflated workbook, as Excel and Google Sheets save it", async () => {
    const stored = buildXlsx(markTemplate(single, "7B", students, [], [], []));
    const sheets = await readXlsx(deflateZip(stored));
    expect(sheets[0].rows[1].slice(0, 3)).toEqual(["1", "Adams", "Amelia"]);
  });

  it("refuses a file that isn't a spreadsheet", async () => {
    await expect(readXlsx(new TextEncoder().encode("Surname,Name\nAdams,Amelia"))).rejects.toThrow(/not a spreadsheet/);
  });
});

describe("planImport / applyImport", () => {
  const header = ["No", "Surname", "Name", "Mark (out of 40)", "Comment", "Student ID"];

  it("matches by Student ID, or by name when the ID is gone, and counts what changes", () => {
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 20, comment: "" },
      { assessmentId: "a1", studentId: "s2", mark: 30, comment: "keep" },
    ];
    const rows = [header, ["1", "Adams", "Amelia", "20", "", "s1"], ["2", "Baker", "Harry", "32,5", "", ""], ["3", "clark ", "OLIVIA", "18", "well done", ""]];
    const plan = planImport(rows, null, single, [], students, marks, []);
    expect(plan.problems).toEqual([]);
    expect([plan.added, plan.changed, plan.same]).toEqual([1, 1, 1]);
    const next = applyImport(plan, single, marks, []).marks;
    const of = (id: string) => next.find((m) => m.studentId === id);
    expect(of("s2")).toMatchObject({ mark: 32.5, comment: "keep" });
    expect(of("s3")).toMatchObject({ mark: 18, comment: "well done" });
  });

  it("leaves blank and 'absent' cells as they are, and skips bad values with a reason", () => {
    const marks: Mark[] = [{ assessmentId: "a1", studentId: "s1", mark: 20, comment: "" }];
    const rows = [
      ["Cells test marks"], // a title row above the headings is fine
      header,
      ["1", "Adams", "Amelia", "", "", "s1"],
      ["2", "Baker", "Harry", "ab", "", "s2"],
      ["3", "Clark", "Olivia", "41", "", "s3"],
      ["4", "Dlamini", "Sipho", "30", "", ""],
      ["5", "Clark", "Olivia", "abc", "", "s3"],
    ];
    const plan = planImport(rows, null, single, [], students, marks, []);
    expect(plan.problems).toEqual([
      "Row 5 (Clark, Olivia): 41 is more than 40, so it was skipped.",
      "Row 6 (Dlamini, Sipho): no such student in this class, so the row was skipped.",
      "Row 7 (Clark, Olivia): Olivia Clark is listed more than once; this later row was used.",
      'Row 7 (Clark, Olivia): "abc" isn\'t a number, so it was skipped.',
    ]);
    expect(applyImport(plan, single, marks, []).marks).toEqual(marks);
  });

  it("imports question marks and recomputes each student's total", () => {
    const rows = [
      ["No", "Surname", "Name", "Q1 (/7,5)", "Q2 (/12,5)", "Q3 (/5)", "Student ID"],
      ["1", "Adams", "Amelia", "7.5", "10,5", "", "s1"],
      ["2", "Baker", "Harry", "3", "", "", "s2"],
    ];
    const existing: QuestionMark[] = [{ assessmentId: "a2", studentId: "s2", number: 2, mark: 9 }];
    const plan = planImport(rows, null, perQ, questions, students, [], existing);
    expect(plan.problems).toEqual(['Column "Q3 (/5)" isn\'t a question of this test, so it was ignored.']);
    const next = applyImport(plan, perQ, [], existing);
    expect(next.marks.find((m) => m.studentId === "s1")?.mark).toBe(18);
    expect(next.marks.find((m) => m.studentId === "s2")?.mark).toBe(12); // 3 imported + the 9 already there
  });

  it("notices a file made for another assessment", () => {
    const about = [["Assessment", "Energy project"], ["Assessment ID", "a9"]];
    expect(planImport([header], about, single, [], students, [], []).otherAssessment).toBe("Energy project");
    expect(planImport([header], [["Assessment ID", "a1"]], single, [], students, [], []).otherAssessment).toBeNull();
  });

  it("explains a sheet it can't read", () => {
    expect(planImport([["Hello"]], null, single, [], students, [], []).problems[0]).toMatch(/No heading row/);
    expect(planImport([["Surname", "Name"]], null, single, [], students, [], []).problems).toEqual(["No Mark column was found in the heading row."]);
  });
});
