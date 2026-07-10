import { describe, expect, it } from "vitest";
import {
  assessmentStats,
  atRiskStudents,
  attendanceSummary,
  behaviourByStudent,
  histogram,
  overallPercent,
} from "./stats";
import { Assessment, AttendanceEntry, Mark, Student } from "./types";

const mkAssessment = (id: string, total: number, weight = 1, date = "2026-01-01"): Assessment => ({
  id,
  title: id,
  date,
  totalMarks: total,
  weight,
  category: "Test",
});

describe("attendanceSummary", () => {
  it("computes the rate as (present+late)/unexcused", () => {
    const entries: AttendanceEntry[] = [
      { date: "d1", studentId: "s", status: "P", note: "" },
      { date: "d2", studentId: "s", status: "L", note: "" },
      { date: "d3", studentId: "s", status: "A", note: "" },
      { date: "d4", studentId: "s", status: "E", note: "" },
    ];
    const s = attendanceSummary(entries);
    expect(s.present).toBe(1);
    expect(s.late).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.excused).toBe(1);
    expect(s.rate).toBeCloseTo(2 / 3);
  });

  it("has a null rate with no data", () => {
    expect(attendanceSummary([]).rate).toBeNull();
  });
});

describe("behaviourByStudent", () => {
  it("sums points and counts by sign", () => {
    const map = behaviourByStudent([
      { timestamp: "t1", studentId: "s1", code: "EFF", points: 2, note: "" },
      { timestamp: "t2", studentId: "s1", code: "TALK", points: -1, note: "" },
      { timestamp: "t3", studentId: "s2", code: "EFF", points: 1, note: "" },
    ]);
    expect(map.get("s1")).toEqual({ positive: 1, negative: 1, points: 1 });
    expect(map.get("s2")).toEqual({ positive: 1, negative: 0, points: 1 });
  });
});

describe("assessmentStats", () => {
  it("computes mean/median as percentages of the total", () => {
    const a = mkAssessment("a1", 50);
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 25, comment: "" }, // 50%
      { assessmentId: "a1", studentId: "s2", mark: 40, comment: "" }, // 80%
      { assessmentId: "a1", studentId: "s3", mark: null, comment: "" }, // skipped
    ];
    const s = assessmentStats(a, marks);
    expect(s.entered).toBe(2);
    expect(s.mean).toBeCloseTo(65);
    expect(s.median).toBeCloseTo(65);
    expect(s.min).toBeCloseTo(50);
    expect(s.max).toBeCloseTo(80);
  });
});

describe("histogram", () => {
  it("bins 0-100 into ten bins with 100 in the top bin", () => {
    const h = histogram([0, 5, 95, 100, 55]);
    expect(h).toHaveLength(10);
    expect(h[0].count).toBe(2);
    expect(h[5].count).toBe(1);
    expect(h[9].count).toBe(2);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(5);
  });
});

describe("overallPercent", () => {
  it("weights assessments by their weight", () => {
    const assessments = [mkAssessment("a1", 100, 1), mkAssessment("a2", 100, 3)];
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 100, comment: "" }, // 100% * w1
      { assessmentId: "a2", studentId: "s1", mark: 60, comment: "" }, // 60% * w3
    ];
    expect(overallPercent("s1", assessments, marks)).toBeCloseTo((100 + 180) / 4);
  });

  it("returns null with no marks", () => {
    expect(overallPercent("s1", [mkAssessment("a1", 100)], [])).toBeNull();
  });
});

describe("atRiskStudents", () => {
  const students: Student[] = [
    { id: "s1", firstName: "A", lastName: "A", gender: "", flags: "", notes: "" },
    { id: "s2", firstName: "B", lastName: "B", gender: "", flags: "", notes: "" },
  ];

  it("flags a sudden drop against the student's own average", () => {
    const assessments = [
      mkAssessment("a1", 100, 1, "2026-01-01"),
      mkAssessment("a2", 100, 1, "2026-02-01"),
      mkAssessment("a3", 100, 1, "2026-03-01"),
    ];
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 80, comment: "" },
      { assessmentId: "a2", studentId: "s1", mark: 85, comment: "" },
      { assessmentId: "a3", studentId: "s1", mark: 40, comment: "" },
      { assessmentId: "a1", studentId: "s2", mark: 70, comment: "" },
      { assessmentId: "a2", studentId: "s2", mark: 70, comment: "" },
      { assessmentId: "a3", studentId: "s2", mark: 70, comment: "" },
    ];
    const flags = atRiskStudents(students, assessments, marks);
    expect(flags.some((f) => f.studentId === "s1")).toBe(true);
    expect(flags.some((f) => f.studentId === "s2")).toBe(false);
  });

  it("flags three declining results in a row", () => {
    const assessments = [
      mkAssessment("a1", 100, 1, "2026-01-01"),
      mkAssessment("a2", 100, 1, "2026-02-01"),
      mkAssessment("a3", 100, 1, "2026-03-01"),
    ];
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 80, comment: "" },
      { assessmentId: "a2", studentId: "s1", mark: 75, comment: "" },
      { assessmentId: "a3", studentId: "s1", mark: 71, comment: "" },
      { assessmentId: "a1", studentId: "s2", mark: 80, comment: "" },
      { assessmentId: "a2", studentId: "s2", mark: 82, comment: "" },
      { assessmentId: "a3", studentId: "s2", mark: 84, comment: "" },
    ];
    const flags = atRiskStudents(students, assessments, marks);
    expect(flags.some((f) => f.studentId === "s1")).toBe(true);
    expect(flags.some((f) => f.studentId === "s2")).toBe(false);
  });
});
