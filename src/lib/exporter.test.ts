import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "./fs";
import * as repo from "./repo";
import {
  DEFAULT_SECTIONS,
  EXPORT_SECTIONS,
  ExportData,
  buildSheets,
  exportFileName,
  loadExportData,
} from "./exporter";
import { SheetSpec } from "./xlsx";
import { setTimeZone } from "./time";

const DIR = "/data";
const CLS = "7B-Science";
const ALL = EXPORT_SECTIONS.map((s) => s.id);

let data: ExportData;

const sheet = (sheets: SheetSpec[], name: string): SheetSpec => {
  const found = sheets.find((s) => s.name === name);
  if (!found) throw new Error(`no sheet named ${name} (have: ${sheets.map((s) => s.name).join(", ")})`);
  return found;
};

/** Index a sheet row by its column header so assertions read clearly. */
const cell = (s: SheetSpec, row: number, column: string) => s.rows[row][s.columns.indexOf(column)];

beforeEach(async () => {
  // Fixture timestamps are UTC; show them in UTC so results don't depend on the machine.
  setTimeZone("UTC");
  setFS(new MemFS());
  await repo.ensureDataDir(DIR);
  await repo.saveClassInfo(DIR, { name: CLS, year: "7", subject: "Science", room: "Lab 2", notes: "", archived: false, color: "" });
  await repo.saveStudents(DIR, CLS, [
    { id: "s1", firstName: "Anna", lastName: "Brown", adamNo: "", gender: "F", flags: "SEN", notes: "sits at front" },
    { id: "s2", firstName: "Ben", lastName: "Clark", adamNo: "", gender: "M", flags: "", notes: "" },
  ]);
  await repo.saveAttendance(DIR, CLS, [
    { date: "2026-01-10", studentId: "s1", status: "P", note: "" },
    { date: "2026-01-10", studentId: "s2", status: "A", note: "ill" },
    { date: "2026-03-05", studentId: "s1", status: "L", note: "" },
    { date: "2026-03-05", studentId: "s2", status: "P", note: "" },
  ]);
  await repo.saveBehaviourEvents(DIR, CLS, [
    { timestamp: "2026-01-10T09:15:00.000Z", studentId: "s1", code: "EFF", points: 1, note: "" },
    { timestamp: "2026-03-05T10:20:00.000Z", studentId: "s2", code: "TALK", points: -1, note: "chatting" },
  ]);
  await repo.saveBathroomVisits(DIR, CLS, [
    { date: "2026-01-10", studentId: "s1", start: "2026-01-10T09:30:00.000Z", end: "2026-01-10T09:34:10.000Z" },
    { date: "2026-03-05", studentId: "s2", start: "2026-03-05T11:00:00.000Z", end: "" },
  ]);
  await repo.saveAssessments(DIR, CLS, [
    { id: "a1", title: "Topic test 1", date: "2026-01-20", totalMarks: 20, category: "Test", questionCount: 2, contentArea: "Chemistry", kind: "informal", weight: 1 },
    { id: "a2", title: "Topic test 2", date: "2026-03-20", totalMarks: 50, category: "Test", questionCount: 1, contentArea: "Physics", kind: "informal", weight: 1 },
  ]);
  await repo.saveMarks(DIR, CLS, [
    { assessmentId: "a1", studentId: "s1", mark: 18, comment: "excellent" },
    { assessmentId: "a1", studentId: "s2", mark: 10, comment: "" },
    { assessmentId: "a2", studentId: "s1", mark: 25, comment: "" },
  ]);
  await repo.saveAssessmentQuestions(DIR, CLS, [
    { assessmentId: "a1", number: 1, topic: "Acids & Bases", marks: 10, cognitiveLevel: "L1" },
    { assessmentId: "a1", number: 2, topic: "Particles", marks: 10, cognitiveLevel: "L3" },
  ]);
  await repo.saveQuestionMarks(DIR, CLS, [
    { assessmentId: "a1", studentId: "s1", number: 1, mark: 9 },
    { assessmentId: "a1", studentId: "s1", number: 2, mark: 9 },
    { assessmentId: "a1", studentId: "s2", number: 1, mark: 6 },
    { assessmentId: "a1", studentId: "s2", number: 2, mark: null },
  ]);
  await repo.saveDesks(DIR, CLS, [
    { id: "d1", label: "Front left", shape: "double", x: 0, y: 0, w: 160, h: 60, rotation: 0, color: "", textColor: "", stripColor: "" },
  ]);
  await repo.saveSeating(DIR, CLS, [
    { planName: "Default", deskId: "d1", seatIndex: 0, studentId: "s1" },
    { planName: "Default", deskId: "d1", seatIndex: 1, studentId: "s2" },
  ]);
  await repo.saveLessons(DIR, CLS, [
    { sessionId: "L1", date: "2026-01-10", timestamp: "2026-01-10T10:00:00.000Z", studentId: "s1", deskId: "d1", deskLabel: "Front left", seatmates: "s2", points: 2, positives: 2, negatives: 0 },
    { sessionId: "L1", date: "2026-01-10", timestamp: "2026-01-10T10:00:00.000Z", studentId: "s2", deskId: "d1", deskLabel: "Front left", seatmates: "s1", points: -1, positives: 0, negatives: 1 },
  ]);
  data = await loadExportData(DIR, [CLS]);
});

describe("loadExportData", () => {
  it("loads every dataset for the chosen classes", () => {
    expect(data.bundles).toHaveLength(1);
    const b = data.bundles[0];
    expect(b.info.subject).toBe("Science");
    expect(b.students).toHaveLength(2);
    expect(b.attendance).toHaveLength(4);
    expect(b.assessments).toHaveLength(2);
    expect(b.lessons).toHaveLength(2);
    expect(data.behaviourCodes.length).toBeGreaterThan(0);
  });

  it("does not fall over on a class with no files yet", async () => {
    await repo.saveClassInfo(DIR, { name: "Empty", year: "8", subject: "", room: "", notes: "", archived: false, color: "" });
    const loaded = await loadExportData(DIR, ["Empty"]);
    expect(loaded.bundles[0].students).toEqual([]);
    const sheets = buildSheets(loaded, { sections: ALL });
    expect(sheet(sheets, "Students").rows).toHaveLength(0);
  });
});

describe("buildSheets", () => {
  it("always writes an info sheet and only the sections asked for", () => {
    const sheets = buildSheets(data, { sections: ["students"], dataDir: DIR });
    expect(sheets.map((s) => s.name)).toEqual(["Export info", "Students"]);
    expect(sheet(sheets, "Export info").rows.some((r) => r[1] === DIR)).toBe(true);
  });

  it("produces exactly the sheets each section advertises", () => {
    for (const section of EXPORT_SECTIONS) {
      const sheets = buildSheets(data, { sections: [section.id] });
      expect(sheets.slice(1).map((s) => s.name)).toEqual(section.sheetNames);
    }
  });

  it("gives every row the same width as its header", () => {
    const sheets = buildSheets(data, { sections: ALL });
    for (const s of sheets) {
      for (const row of s.rows) expect(row).toHaveLength(s.columns.length);
    }
  });

  it("summarises the class on the overview sheet", () => {
    const s = sheet(buildSheets(data, { sections: ["overview"] }), "Overview");
    expect(cell(s, 0, "Class")).toBe(CLS);
    expect(cell(s, 0, "Students")).toBe(2);
    expect(cell(s, 0, "Assessments")).toBe(2);
    // s1: present + late = 100%, s2: 1 of 2 = 50% -> mean 75%
    expect(cell(s, 0, "Attendance %")).toBe(75);
    expect(cell(s, 0, "Net behaviour points")).toBe(0);
  });

  it("expands attendance into readable rows and a per-student summary", () => {
    const sheets = buildSheets(data, { sections: ["attendance", "attendanceSummary"] });
    const log = sheet(sheets, "Attendance");
    expect(log.rows).toHaveLength(4);
    expect(cell(log, 0, "Student")).toBe("Anna Brown");
    expect(cell(log, 0, "Status label")).toBe("Present");

    const summary = sheet(sheets, "Attendance summary");
    const anna = summary.rows.find((r) => r[2] === "Anna Brown")!;
    expect(anna[summary.columns.indexOf("Attendance %")]).toBe(100);
    const ben = summary.rows.find((r) => r[2] === "Ben Clark")!;
    expect(ben[summary.columns.indexOf("Absent")]).toBe(1);
    expect(ben[summary.columns.indexOf("Attendance %")]).toBe(50);
  });

  it("labels behaviour events from the shared behaviour catalog", () => {
    const s = sheet(buildSheets(data, { sections: ["behaviour"] }), "Behaviour log");
    expect(cell(s, 0, "Student")).toBe("Anna Brown");
    expect(cell(s, 0, "Behaviour")).toBe("Great effort");
    expect(cell(s, 0, "Type")).toBe("positive");
    expect(cell(s, 1, "Points")).toBe(-1);
    expect(cell(s, 1, "Time")).toBe("10:20");
  });

  it("logs bathroom trips with durations, flagging one still out", () => {
    const s = sheet(buildSheets(data, { sections: ["bathroom"] }), "Bathroom log");
    expect(s.rows).toHaveLength(2);
    expect(cell(s, 0, "Student")).toBe("Anna Brown");
    expect(cell(s, 0, "Out")).toBe("09:30");
    expect(cell(s, 0, "Back")).toBe("09:34");
    expect(cell(s, 0, "Duration")).toBe("4:10");
    expect(cell(s, 0, "Seconds")).toBe(250);
    expect(cell(s, 1, "Duration")).toBe("still out");
    expect(cell(s, 1, "Seconds")).toBeNull();
  });

  it("writes marks as numbers with percentage and level", () => {
    const s = sheet(buildSheets(data, { sections: ["marks"] }), "Marks");
    // 2 assessments x 2 students, oldest assessment first
    expect(s.rows).toHaveLength(4);
    expect(cell(s, 0, "Student")).toBe("Anna Brown");
    expect(cell(s, 0, "Mark")).toBe(18);
    expect(cell(s, 0, "Out of")).toBe(20);
    expect(cell(s, 0, "Percent")).toBe(90);
    expect(cell(s, 0, "Level")).toBe("7");
    // Ben has no mark for the second test: the row stays, the mark is blank.
    const missing = s.rows.find((r) => r[1] === "Topic test 2" && r[s.columns.indexOf("Student")] === "Ben Clark")!;
    expect(missing[s.columns.indexOf("Mark")]).toBeNull();
    expect(missing[s.columns.indexOf("Percent")]).toBeNull();
  });

  it("writes symbols instead of levels when chosen", () => {
    const s = sheet(buildSheets(data, { sections: ["marks"], gradeScale: "symbol" }), "Marks");
    expect(s.columns).toContain("Symbol");
    expect(s.columns).not.toContain("Level");
    expect(cell(s, 0, "Symbol")).toBe("A");
  });

  it("reports assessment statistics", () => {
    const s = sheet(buildSheets(data, { sections: ["assessments"] }), "Assessments");
    expect(cell(s, 0, "Title")).toBe("Topic test 1");
    expect(cell(s, 0, "Marks entered")).toBe(2);
    expect(cell(s, 0, "Mean %")).toBe(70); // (90 + 50) / 2
    expect(cell(s, 0, "Lowest %")).toBe(50);
    expect(cell(s, 0, "Highest %")).toBe(90);
  });

  it("skips question marks that were never entered", () => {
    const s = sheet(buildSheets(data, { sections: ["questionMarks"] }), "Question marks");
    expect(s.rows).toHaveLength(3);
    expect(cell(s, 0, "Topic")).toBe("Acids & Bases");
    expect(cell(s, 0, "Cognitive level")).toBe("L1");
    expect(cell(s, 0, "Percent")).toBe(90);
  });

  it("aggregates marks per student per topic", () => {
    const s = sheet(buildSheets(data, { sections: ["topicPerformance"] }), "Topic performance");
    const annaAcids = s.rows.find((r) => r[2] === "Anna Brown" && r[3] === "Acids & Bases")!;
    expect(annaAcids[s.columns.indexOf("Marks")]).toBe(9);
    expect(annaAcids[s.columns.indexOf("Out of")]).toBe(10);
    expect(annaAcids[s.columns.indexOf("Percent")]).toBe(90);
    // Ben answered only question 1, so he has no Particles row at all.
    expect(s.rows.some((r) => r[2] === "Ben Clark" && r[3] === "Particles")).toBe(false);
  });

  it("resolves desk labels and seatmate names", () => {
    const sheets = buildSheets(data, { sections: ["seating", "lessons"] });
    const plans = sheet(sheets, "Seating plans");
    expect(cell(plans, 0, "Desk label")).toBe("Front left");
    expect(cell(plans, 0, "Seat")).toBe(1);
    expect(cell(plans, 0, "Student")).toBe("Anna Brown");

    const lessons = sheet(sheets, "Lesson history");
    expect(cell(lessons, 0, "Seatmates")).toBe("Ben Clark");
    expect(cell(lessons, 0, "Points")).toBe(2);
  });

  it("builds desk and pair insights from the lesson history", () => {
    const sheets = buildSheets(data, { sections: ["insights"] });
    const desks = sheet(sheets, "Desk insights");
    expect(cell(desks, 0, "Desk")).toBe("Front left");
    expect(cell(desks, 0, "Lessons sat there")).toBe(1);

    const pairs = sheet(sheets, "Pair insights");
    expect(pairs.rows).toHaveLength(1);
    expect(cell(pairs, 0, "Lessons together")).toBe(1);
  });

  it("keeps a student with no records in the summaries as a zero row", () => {
    const summary = sheet(buildSheets(data, { sections: ["behaviourSummary"] }), "Behaviour summary");
    expect(summary.rows).toHaveLength(2);
    expect(cell(summary, 0, "Positive events")).toBe(1);
    expect(cell(summary, 1, "Negative events")).toBe(1);
  });
});

describe("date range", () => {
  it("limits dated data and the statistics derived from it", () => {
    const sheets = buildSheets(data, { sections: ALL, from: "2026-01-01", to: "2026-01-31" });
    expect(sheet(sheets, "Attendance").rows).toHaveLength(2);
    expect(sheet(sheets, "Behaviour log").rows).toHaveLength(1);
    expect(sheet(sheets, "Bathroom log").rows).toHaveLength(1);
    expect(sheet(sheets, "Assessments").rows).toHaveLength(1);
    // Only the January test remains, so Marks drops to one row per student.
    expect(sheet(sheets, "Marks").rows).toHaveLength(2);
    expect(sheet(sheets, "Lesson history").rows).toHaveLength(2);
    expect(cell(sheet(sheets, "Overview"), 0, "Register marks")).toBe(2);
  });

  it("treats blank bounds as unlimited", () => {
    const sheets = buildSheets(data, { sections: ["attendance"], from: "", to: "" });
    expect(sheet(sheets, "Attendance").rows).toHaveLength(4);
  });

  it("records the window on the info sheet", () => {
    const info = sheet(buildSheets(data, { sections: [], from: "2026-01-01" }), "Export info");
    expect(info.rows.find((r) => r[0] === "Date range")![1]).toContain("2026-01-01");
  });
});

describe("multi-class exports", () => {
  it("stacks classes into the same sheets with a Class column", async () => {
    await repo.saveClassInfo(DIR, { name: "8A-Science", year: "8", subject: "Science", room: "Lab 1", notes: "", archived: false, color: "" });
    await repo.saveStudents(DIR, "8A-Science", [
      { id: "t1", firstName: "Cara", lastName: "Diaz", adamNo: "", gender: "F", flags: "", notes: "" },
    ]);
    const both = await loadExportData(DIR, [CLS, "8A-Science"]);
    const students = sheet(buildSheets(both, { sections: ["students"] }), "Students");
    expect(students.rows).toHaveLength(3);
    expect(students.rows.map((r) => r[0])).toEqual([CLS, CLS, "8A-Science"]);
  });
});

describe("defaults and file naming", () => {
  it("leaves only the heaviest sheets off by default", () => {
    expect(DEFAULT_SECTIONS).toContain("marks");
    expect(DEFAULT_SECTIONS).not.toContain("questionMarks");
  });

  it("names the file after the class and date", () => {
    expect(exportFileName([CLS], new Date(2026, 6, 24))).toBe("ClassKernel-7B-Science-2026-07-24.xlsx");
    expect(exportFileName(["7B", "8A"], new Date(2026, 6, 24))).toBe("ClassKernel-2-classes-2026-07-24.xlsx");
  });
});
