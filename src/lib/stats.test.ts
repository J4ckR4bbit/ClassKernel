import { describe, expect, it } from "vitest";
import {
  answerTallyByStudent,
  assessmentStats,
  atRiskStudents,
  attendanceSummary,
  behaviourByStudent,
  formatDuration,
  gridCompletion,
  histogram,
  overallPercent,
  questionAverages,
  rankStudents,
  studentProvisional,
  symbolForPct,
  visitSeconds,
} from "./stats";
import {
  ANSWERED_BEHAVIOUR,
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  Mark,
  NO_ANSWER_BEHAVIOUR,
  QuestionMark,
  Student,
} from "./types";

const mkAssessment = (id: string, total: number, date = "2026-01-01"): Assessment => ({
  id,
  title: id,
  date,
  totalMarks: total,
  category: "Test",
  questionCount: 1,
  contentArea: "",
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

describe("answerTallyByStudent", () => {
  it("counts answered and missed questions, ignoring other behaviours", () => {
    const map = answerTallyByStudent([
      { timestamp: "t1", studentId: "s1", code: ANSWERED_BEHAVIOUR.code, points: 1, note: "" },
      { timestamp: "t2", studentId: "s1", code: NO_ANSWER_BEHAVIOUR.code, points: -1, note: "" },
      { timestamp: "t3", studentId: "s1", code: ANSWERED_BEHAVIOUR.code, points: 1, note: "" },
      { timestamp: "t4", studentId: "s1", code: "TALK", points: -1, note: "" },
      { timestamp: "t5", studentId: "s2", code: NO_ANSWER_BEHAVIOUR.code, points: -1, note: "" },
    ]);
    expect(map.get("s1")).toEqual({ answered: 2, missed: 1, asked: 3 });
    expect(map.get("s2")).toEqual({ answered: 0, missed: 1, asked: 1 });
  });

  it("leaves out students who were never asked", () => {
    const map = answerTallyByStudent([{ timestamp: "t1", studentId: "s1", code: "EFF", points: 1, note: "" }]);
    expect(map.size).toBe(0);
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
  it("averages assessment percentages equally", () => {
    const assessments = [mkAssessment("a1", 100), mkAssessment("a2", 50)];
    const marks: Mark[] = [
      { assessmentId: "a1", studentId: "s1", mark: 100, comment: "" }, // 100%
      { assessmentId: "a2", studentId: "s1", mark: 30, comment: "" }, // 60%
    ];
    expect(overallPercent("s1", assessments, marks)).toBeCloseTo(80);
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
      mkAssessment("a1", 100, "2026-01-01"),
      mkAssessment("a2", 100, "2026-02-01"),
      mkAssessment("a3", 100, "2026-03-01"),
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
      mkAssessment("a1", 100, "2026-01-01"),
      mkAssessment("a2", 100, "2026-02-01"),
      mkAssessment("a3", 100, "2026-03-01"),
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

describe("per-question grid helpers", () => {
  const questions: AssessmentQuestion[] = [
    { assessmentId: "a1", number: 1, topic: "Kinematics", marks: 10, cognitiveLevel: "L1" },
    { assessmentId: "a1", number: 2, topic: "Kinematics", marks: 20, cognitiveLevel: "L2" },
  ];
  // s1 = 8 + 10 = 18/30; s2 = 6 + 18 = 24/30; s3 = only Q1 (5/10); s4 = nothing.
  const qmarks: QuestionMark[] = [
    { assessmentId: "a1", studentId: "s1", number: 1, mark: 8 },
    { assessmentId: "a1", studentId: "s1", number: 2, mark: 10 },
    { assessmentId: "a1", studentId: "s2", number: 1, mark: 6 },
    { assessmentId: "a1", studentId: "s2", number: 2, mark: 18 },
    { assessmentId: "a1", studentId: "s3", number: 1, mark: 5 },
    { assessmentId: "a1", studentId: "s3", number: 2, mark: null },
  ];
  const ids = ["s1", "s2", "s3", "s4"];

  it("questionAverages gives mean mark and % per question", () => {
    const avg = questionAverages(questions, qmarks);
    expect(avg[0]).toMatchObject({ number: 1, entered: 3 });
    expect(avg[0].meanMark).toBeCloseTo((8 + 6 + 5) / 3);
    expect(avg[0].meanPct).toBeCloseTo(((8 + 6 + 5) / 3 / 10) * 100);
    expect(avg[1]).toMatchObject({ number: 2, entered: 2 });
    expect(avg[1].meanMark).toBeCloseTo((10 + 18) / 2);
  });

  it("studentProvisional uses only answered questions", () => {
    expect(studentProvisional("s2", questions, qmarks)).toMatchObject({ total: 24, maxSoFar: 30, answered: 2 });
    // s3 answered only Q1 → 5/10 = 50%.
    const p3 = studentProvisional("s3", questions, qmarks);
    expect(p3).toMatchObject({ total: 5, maxSoFar: 10, answered: 1 });
    expect(p3.pct).toBeCloseTo(50);
    // s4 answered nothing.
    expect(studentProvisional("s4", questions, qmarks)).toMatchObject({ total: 0, maxSoFar: 0, answered: 0, pct: null });
  });

  it("rankStudents ranks by total, excludes non-starters, averages ties", () => {
    const ranks = rankStudents(ids, questions, qmarks);
    expect(ranks.get("s2")).toBe(1); // 24, highest
    expect(ranks.get("s1")).toBe(2); // 18
    expect(ranks.get("s3")).toBe(3); // 5
    expect(ranks.has("s4")).toBe(false); // no marks → unranked
  });

  it("rankStudents averages tied totals", () => {
    const tied: QuestionMark[] = [
      { assessmentId: "a1", studentId: "s1", number: 1, mark: 10 },
      { assessmentId: "a1", studentId: "s2", number: 1, mark: 10 },
      { assessmentId: "a1", studentId: "s3", number: 1, mark: 4 },
    ];
    const ranks = rankStudents(["s1", "s2", "s3"], questions, tied);
    expect(ranks.get("s1")).toBe(1.5); // tied for 1st/2nd
    expect(ranks.get("s2")).toBe(1.5);
    expect(ranks.get("s3")).toBe(3);
  });

  it("gridCompletion is filled cells over total cells", () => {
    // 4 students × 2 questions = 8 cells; filled = 5 (s1×2, s2×2, s3×1).
    expect(gridCompletion(ids, questions, qmarks)).toBeCloseTo(5 / 8);
    expect(gridCompletion([], questions, qmarks)).toBe(1);
  });
});

describe("symbolForPct", () => {
  it("maps percentages to the SA 7-level code at each boundary", () => {
    expect(symbolForPct(100)).toBe("7");
    expect(symbolForPct(80)).toBe("7");
    expect(symbolForPct(79.9)).toBe("6");
    expect(symbolForPct(70)).toBe("6");
    expect(symbolForPct(60)).toBe("5");
    expect(symbolForPct(50)).toBe("4");
    expect(symbolForPct(40)).toBe("3");
    expect(symbolForPct(30)).toBe("2");
    expect(symbolForPct(29.9)).toBe("1");
    expect(symbolForPct(0)).toBe("1");
  });

  it("is blank when there's no percentage to grade", () => {
    expect(symbolForPct(null)).toBe("");
    expect(symbolForPct(NaN)).toBe("");
  });
});

describe("bathroom visit durations", () => {
  const visit = { date: "2026-07-01", studentId: "s1", start: "2026-07-01T09:00:00.000Z", end: "" };

  it("measures a finished visit from start to end", () => {
    expect(visitSeconds({ ...visit, end: "2026-07-01T09:04:30.000Z" })).toBe(270);
  });

  it("measures a still-open visit against the given clock", () => {
    expect(visitSeconds(visit, Date.parse("2026-07-01T09:01:15.000Z"))).toBe(75);
  });

  it("never goes negative and shrugs off unparseable timestamps", () => {
    expect(visitSeconds({ ...visit, end: "2026-07-01T08:00:00.000Z" })).toBe(0);
    expect(visitSeconds({ ...visit, start: "garbage" })).toBe(0);
  });

  it("formats seconds as m:ss and hours as h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(270)).toBe("4:30");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});
