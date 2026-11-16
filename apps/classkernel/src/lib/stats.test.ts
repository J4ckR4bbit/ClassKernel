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
  taskShares,
  weightedMark,
  questionAverages,
  rankByScore,
  rankStudents,
  studentProvisional,
  symbolForPct,
  gradeForPct,
  letterForPct,
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
  defaultKind,
} from "./types";

const mkAssessment = (id: string, total: number, date = "2026-01-01"): Assessment => ({
  id,
  title: id,
  date,
  totalMarks: total,
  category: "Test",
  questionCount: 1,
  contentArea: "",
  kind: "informal",
  weight: 1,
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

describe("overallPercent / weightedMark", () => {
  const task = (id: string, total: number, kind: "informal" | "exam", weight = 1) => ({ ...mkAssessment(id, total), kind, weight });
  const mark = (assessmentId: string, m: number): Mark => ({ assessmentId, studentId: "s1", mark: m, comment: "" });

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

  it("counts each task by its weight within its side", () => {
    const tests = [task("t1", 100, "informal", 1), task("t2", 100, "informal", 3)];
    // (40×1 + 80×3) / 4 = 70
    expect(overallPercent("s1", tests, [mark("t1", 40), mark("t2", 80)])).toBeCloseTo(70);
  });

  it("blends informal and exam by the grade's split", () => {
    const tasks = [task("t1", 50, "informal"), task("t2", 100, "informal"), task("x1", 200, "exam")];
    const marks = [mark("t1", 40), mark("t2", 60), mark("x1", 100)]; // informal 80 and 60 → 70; exam 50
    expect(weightedMark("s1", tasks, marks, 75)).toEqual({ informal: 70, exam: 50, overall: 70 * 0.25 + 50 * 0.75 });
    expect(overallPercent("s1", tasks, marks, 40)).toBeCloseTo(70 * 0.6 + 50 * 0.4);
  });

  it("uses the side that has marks alone until the other has some", () => {
    const tasks = [task("t1", 100, "informal"), task("x1", 100, "exam")];
    expect(overallPercent("s1", tasks, [mark("t1", 64)], 75)).toBeCloseTo(64); // exam not written yet
    expect(overallPercent("s1", tasks, [mark("x1", 52)], 75)).toBeCloseTo(52);
  });

  it("leaves out weight 0 tasks and unmarked (absent) entries", () => {
    const tasks = [task("t1", 100, "informal", 0), task("t2", 100, "informal")];
    const marks = [mark("t1", 10), mark("t2", 90), { assessmentId: "t3", studentId: "s1", mark: null, comment: "" }];
    expect(overallPercent("s1", tasks, marks)).toBeCloseTo(90);
  });

  it("gives no mark when the only side a student has counts 0%", () => {
    const tasks = [task("t1", 100, "informal"), task("x1", 100, "exam")];
    expect(overallPercent("s1", tasks, [mark("t1", 70)], 100)).toBeNull();
  });
});

describe("taskShares", () => {
  const task = (id: string, kind: "informal" | "exam", weight = 1) => ({ ...mkAssessment(id, 50), kind, weight });

  it("splits each side's share by weight, so the shares add up to 100", () => {
    const shares = taskShares([task("t1", "informal"), task("t2", "informal", 3), task("x1", "exam")], 60);
    expect(shares.get("t1")).toBeCloseTo(10); // 40% informal × 1/4
    expect(shares.get("t2")).toBeCloseTo(30); // 40% × 3/4
    expect(shares.get("x1")).toBeCloseTo(60);
  });

  it("gives a side with no tasks' share to the other, and weight 0 nothing", () => {
    const shares = taskShares([task("t1", "informal"), task("t2", "informal", 0)], 75);
    expect(shares.get("t1")).toBeCloseTo(100);
    expect(shares.get("t2")).toBe(0);
  });
});

describe("atRiskStudents", () => {
  const students: Student[] = [
    { id: "s1", firstName: "A", lastName: "A", adamNo: "", gender: "", flags: "", notes: "" },
    { id: "s2", firstName: "B", lastName: "B", adamNo: "", gender: "", flags: "", notes: "" },
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

  it("rankStudents ranks by total, excludes non-starters", () => {
    const ranks = rankStudents(ids, questions, qmarks);
    expect(ranks.get("s2")).toBe(1); // 24, highest
    expect(ranks.get("s1")).toBe(2); // 18
    expect(ranks.get("s3")).toBe(3); // 5
    expect(ranks.has("s4")).toBe(false); // no marks → unranked
  });

  it("rankStudents gives tied totals the better place", () => {
    const tied: QuestionMark[] = [
      { assessmentId: "a1", studentId: "s1", number: 1, mark: 10 },
      { assessmentId: "a1", studentId: "s2", number: 1, mark: 10 },
      { assessmentId: "a1", studentId: "s3", number: 1, mark: 4 },
    ];
    const ranks = rankStudents(["s1", "s2", "s3"], questions, tied);
    expect(ranks.get("s1")).toBe(1); // tied for first: both 1
    expect(ranks.get("s2")).toBe(1);
    expect(ranks.get("s3")).toBe(3);
  });

  it("rankByScore ranks highest first; ties share the better place and the next skips", () => {
    const ranks = rankByScore(new Map([["a", 61.5], ["b", 80], ["c", 61.5], ["d", 40], ["e", 80]]));
    expect(ranks.get("b")).toBe(1); // b and e tied for first
    expect(ranks.get("e")).toBe(1);
    expect(ranks.get("a")).toBe(3); // a and c tied for third
    expect(ranks.get("c")).toBe(3);
    expect(ranks.get("d")).toBe(5);
    expect(rankByScore(new Map()).size).toBe(0);
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
    expect(symbolForPct(79.4)).toBe("6");
    expect(symbolForPct(70)).toBe("6");
    expect(symbolForPct(60)).toBe("5");
    expect(symbolForPct(50)).toBe("4");
    expect(symbolForPct(40)).toBe("3");
    expect(symbolForPct(30)).toBe("2");
    expect(symbolForPct(29.4)).toBe("1");
    expect(symbolForPct(0)).toBe("1");
  });

  it("grades the rounded %, the figure the screens show", () => {
    expect(symbolForPct(79.5)).toBe("7"); // shown as 80%
    expect(symbolForPct(79.6)).toBe("7");
    expect(symbolForPct(69.49)).toBe("5"); // shown as 69%
    expect(symbolForPct(29.5)).toBe("2");
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

describe("letterForPct / gradeForPct", () => {
  it("gives A–F at each band edge", () => {
    const cases: Array<[number, string]> = [[100, "A"], [80, "A"], [79.4, "B"], [70, "B"], [69.4, "C"], [60, "C"], [50, "D"], [49.4, "E"], [40, "E"], [39.4, "F"], [0, "F"]];
    for (const [pct, letter] of cases) expect(letterForPct(pct)).toBe(letter);
    expect(letterForPct(null)).toBe("");
    expect(letterForPct(NaN)).toBe("");
  });

  it("grades the rounded % too", () => {
    expect(letterForPct(79.5)).toBe("A");
    expect(letterForPct(39.6)).toBe("E");
    expect(gradeForPct(59.5, "symbol")).toBe("C");
    expect(gradeForPct(59.5, "level")).toBe("5");
  });

  it("follows the chosen scale", () => {
    expect(gradeForPct(72, "level")).toBe("6");
    expect(gradeForPct(72, "symbol")).toBe("B");
    expect(gradeForPct(null, "symbol")).toBe("");
  });
});

describe("defaultKind", () => {
  it("counts a category naming an exam as an examination, anything else as informal", () => {
    for (const c of ["Exam", "Examination", "June exam", "Prelim Exams", "Mid-year examinations"]) expect(defaultKind(c)).toBe("exam");
    for (const c of ["Test", "Quiz", "Example task", "Practical", ""]) expect(defaultKind(c)).toBe("informal");
  });
});
