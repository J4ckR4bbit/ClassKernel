import { beforeAll, describe, expect, it } from "vitest";
import { setTimeZone } from "./time";
import {
  ClassData,
  addDays,
  classProfile,
  classSummary,
  filterToPeriod,
  filterToRange,
  fmtNum,
  fmtPct,
  fmtSigned,
  inPeriod,
  parentSummary,
  previousPeriod,
  REPORT_SECTIONS,
  ReportSection,
  scoresBy,
  studentProfile,
  studentSummary,
  weekOf,
  weeklyBehaviour,
} from "./insights";
import { DEFAULT_BEHAVIOURS, BehaviourEvent, Student } from "./types";

const TODAY = "2026-10-07"; // a Wednesday

const S = (id: string, firstName: string): Student => ({ id, firstName, lastName: id.toUpperCase(), adamNo: "", gender: "", flags: "", notes: "" });
const ev = (studentId: string, code: string, date: string, points: number): BehaviourEvent => ({
  timestamp: `${date}T09:00:00.000Z`,
  studentId,
  code,
  points,
  note: "",
});

function data(): ClassData {
  const students = [S("a", "Amy"), S("b", "Ben"), S("c", "Cal"), S("d", "Dee")];
  return {
    students,
    behaviourCodes: DEFAULT_BEHAVIOURS,
    behaviourEvents: [
      // Ben is the talker; Amy is the star.
      ev("b", "TALK", "2026-10-06", -1),
      ev("b", "TALK", "2026-10-05", -1),
      ev("b", "DISR", "2026-10-01", -2),
      ev("b", "TALK", "2026-09-01", -1), // outside 4 weeks
      ev("a", "EFF", "2026-10-06", 1),
      ev("a", "HELP", "2026-10-02", 1),
      ev("c", "TALK", "2026-10-06", -1),
      // Cold-call answers count as questions, not behaviour.
      ev("a", "Q+", "2026-10-06", 1),
      ev("a", "Q+", "2026-10-05", 1),
      ev("a", "Q+", "2026-10-02", 1),
      ev("c", "Q+", "2026-10-06", 1),
      ev("c", "Q-", "2026-10-05", -1),
      ev("c", "Q-", "2026-10-02", -1),
      ev("c", "Q-", "2026-10-01", -1),
    ],
    bathroomVisits: [
      { date: "2026-10-06", studentId: "c", start: "2026-10-06T09:00:00.000Z", end: "2026-10-06T09:05:00.000Z" },
      { date: "2026-10-05", studentId: "c", start: "2026-10-05T09:00:00.000Z", end: "2026-10-05T09:03:00.000Z" },
      { date: "2026-10-01", studentId: "c", start: "2026-10-01T09:00:00.000Z", end: "2026-10-01T09:12:00.000Z" },
    ],
    attendance: [
      { date: "2026-10-06", studentId: "a", status: "P", note: "" },
      { date: "2026-10-05", studentId: "a", status: "A", note: "" },
      { date: "2026-10-06", studentId: "b", status: "L", note: "" },
      { date: "2026-10-05", studentId: "b", status: "P", note: "" },
    ],
    assessments: [
      { id: "t1", title: "Test 1", date: "2026-09-20", totalMarks: 20, category: "Test", questionCount: 2, contentArea: "", kind: "informal", weight: 1 },
      { id: "t2", title: "Test 2", date: "2026-10-03", totalMarks: 50, category: "Test", questionCount: 1, contentArea: "", kind: "informal", weight: 1 },
    ],
    marks: [
      { assessmentId: "t1", studentId: "a", mark: 18, comment: "" },
      { assessmentId: "t1", studentId: "b", mark: 10, comment: "" },
      { assessmentId: "t2", studentId: "a", mark: 40, comment: "Well done" },
      { assessmentId: "t2", studentId: "b", mark: 20, comment: "" },
    ],
    assessmentQuestions: [
      { assessmentId: "t1", number: 1, topic: "Forces", marks: 10, cognitiveLevel: "L1" },
      { assessmentId: "t1", number: 2, topic: "Energy", marks: 10, cognitiveLevel: "L3" },
    ],
    questionMarks: [
      { assessmentId: "t1", studentId: "a", number: 1, mark: 10 },
      { assessmentId: "t1", studentId: "a", number: 2, mark: 8 },
      { assessmentId: "t1", studentId: "b", number: 1, mark: 7 },
      { assessmentId: "t1", studentId: "b", number: 2, mark: 3 },
    ],
  };
}

beforeAll(() => setTimeZone("UTC"));

describe("periods", () => {
  it("covers the last 14 or 28 days including today", () => {
    expect(inPeriod("2026-10-07", "2w", TODAY)).toBe(true);
    expect(inPeriod("2026-09-24", "2w", TODAY)).toBe(true);
    expect(inPeriod("2026-09-23", "2w", TODAY)).toBe(false);
    expect(inPeriod("2026-09-10", "4w", TODAY)).toBe(true);
    expect(inPeriod("2026-09-09", "4w", TODAY)).toBe(false);
    expect(inPeriod("2020-01-01", "all", TODAY)).toBe(true);
    expect(inPeriod("2026-10-08", "all", TODAY)).toBe(false);
  });

  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekOf("2026-10-07")).toBe("2026-10-05");
    expect(weekOf("2026-10-04")).toBe("2026-09-28"); // a Sunday belongs to the week before
  });

  it("filters every kind of record, and finds the period before", () => {
    const d = filterToPeriod(data(), "4w", TODAY);
    expect(d.behaviourEvents.some((e) => e.timestamp.startsWith("2026-09-01"))).toBe(false);
    expect(d.assessments.map((a) => a.id)).toEqual(["t1", "t2"]);
    const two = filterToPeriod(data(), "2w", TODAY);
    expect(two.assessments.map((a) => a.id)).toEqual(["t2"]);
    expect(two.questionMarks).toHaveLength(0);
    const prev = previousPeriod(data(), "4w", TODAY)!;
    expect(prev.behaviourEvents.map((e) => e.code)).toEqual(["TALK"]);
    expect(previousPeriod(data(), "all", TODAY)).toBeNull();
  });
});

describe("formatting", () => {
  it("uses a decimal comma and a real minus sign", () => {
    expect(fmtNum(1.25, 1)).toBe("1,3");
    expect(fmtNum(-3)).toBe("−3");
    expect(fmtNum(-0.01, 1)).toBe("0,0");
    expect(fmtPct(58.26, 1)).toBe("58,3%");
    expect(fmtPct(null)).toBe("—");
    expect(fmtSigned(2)).toBe("+2");
    expect(fmtSigned(0)).toBe("0");
    expect(fmtSigned(-0.5)).toBe("\u22120,5");
  });
});

describe("class profile", () => {
  const d = filterToPeriod(data(), "4w", TODAY);
  const p = classProfile(d, "4w", TODAY);
  const names = new Map(d.students.map((s) => [s.id, s.firstName]));

  it("counts conduct without the cold-call answers", () => {
    expect(p.behaviour).toMatchObject({ positive: 2, negative: 4, net: -3 });
    expect(p.behaviour.byCode[0]).toMatchObject({ code: "TALK", count: 3 });
    expect(p.answers).toMatchObject({ asked: 7, answered: 4 });
  });

  it("finds the students to watch, the stars and the answerers", () => {
    expect(p.watch.map((w) => w.studentId)).toEqual(["b"]);
    expect(p.watch[0].detail).toBe("3 negatives, mostly Talking / off task (2)");
    expect(p.stars.map((s) => s.studentId)).toEqual(["a"]);
    expect(p.answerers.map((a) => a.studentId)).toEqual(["a"]);
    expect(p.rarelyAsked.map((r) => r.studentId)).toEqual(["b", "d"]);
    expect(p.bathroomUsers[0]).toMatchObject({ studentId: "c", value: 3 });
    expect(p.lowAttendance.map((l) => l.studentId)).toEqual(["a"]);
  });

  it("doesn't list a mostly-positive student as one to watch", () => {
    const d = data();
    d.behaviourEvents.push(...["01", "02", "05"].map((day) => ev("a", "TALK", `2026-10-${day}`, -1)));
    d.behaviourEvents.push(...["01", "02", "05", "06"].map((day) => ev("a", "HW+", `2026-10-${day}`, 2)));
    const p = classProfile(filterToPeriod(d, "4w", TODAY), "4w", TODAY);
    expect(p.watch.map((w) => w.studentId)).toEqual(["b"]);
  });

  it("ranks marks and scores topics across the class", () => {
    expect(p.overalls.get("a")).toBeCloseTo(85, 6);
    expect(p.ranks.get("a")).toBe(1);
    expect(p.ranks.get("b")).toBe(2);
    expect(p.latest).toMatchObject({ assessment: { id: "t2" }, mean: 60 });
    expect(p.topics).toEqual([
      { name: "Energy", earned: 11, possible: 20, pct: 55, classPct: null },
      { name: "Forces", earned: 17, possible: 20, pct: 85, classPct: null },
    ]);
  });

  it("writes a summary", () => {
    const lines = classSummary(p, classProfile(previousPeriod(data(), "4w", TODAY)!, "4w", TODAY), "4w", (id) => names.get(id) ?? id);
    expect(lines[0]).toBe("2 positive and 4 negative behaviour entries in the last 4 weeks (net −3).");
    expect(lines).toContain("Most common issue: Talking / off task (3).");
    expect(lines).toContain("Questions: 7 asked, 4 answered (57%).");
    expect(lines).toContain("2 students haven't been picked to answer in the last 4 weeks.");
    expect(lines.some((l) => l.startsWith("3 bathroom trips, 20 min out in total; most by Cal (3)"))).toBe(true);
    expect(lines).toContain("Strongest topic: Forces (85%); weakest: Energy (55%).");
  });

  it("says so when nothing has been recorded", () => {
    const empty = filterToPeriod({ ...data(), behaviourEvents: [], bathroomVisits: [], attendance: [], marks: [] }, "2w", TODAY);
    expect(classSummary(classProfile(empty, "2w", TODAY), null, "2w", String)).toEqual(["No behaviour recorded in the last 2 weeks."]);
  });
});

describe("student profile", () => {
  const d = filterToPeriod(data(), "4w", TODAY);
  const cls = classProfile(d, "4w", TODAY);

  it("collects one student's records", () => {
    const amy = studentProfile(d.students[0], d, cls, "4w", TODAY);
    expect(amy.answers).toMatchObject({ asked: 3, answered: 3 });
    expect(amy.attendance).toMatchObject({ present: 1, absent: 1 });
    expect(amy.absentDates).toEqual(["2026-10-05"]);
    expect(amy.assessments.map((r) => [r.assessment.title, r.mark, r.pct, r.classMean, r.diff])).toEqual([
      ["Test 1", 18, 90, 70, 20],
      ["Test 2", 40, 80, 60, 20],
    ]);
    expect(amy.assessments[1].comment).toBe("Well done");
    expect(amy.topics.map((t) => [t.name, t.pct, t.classPct])).toEqual([
      ["Energy", 80, 55],
      ["Forces", 100, 85],
    ]);
    expect(amy.levels.map((t) => t.name)).toEqual(["L1", "L3"]);
    const cal = studentProfile(d.students[2], d, cls, "4w", TODAY);
    expect(cal.bathroom).toMatchObject({ trips: 3, totalSeconds: 1200, longestSeconds: 720 });
    expect(cal.behaviour.recent).toHaveLength(5);
  });

  it("writes a summary", () => {
    const ben = studentProfile(d.students[1], d, cls, "4w", TODAY);
    const lines = studentSummary(ben, cls, "4w");
    expect(lines[0]).toBe(
      "Behaviour in the last 4 weeks: 0 positive, 3 negative (net −4; class median \u22120,5). Most common: Talking / off task (2).",
    );
    expect(lines).toContain("One to watch: 3 negatives, mostly Talking / off task (2).");
    expect(lines).toContain("Not picked to answer a question in the last 4 weeks.");
    expect(lines).toContain("No bathroom trips in the last 4 weeks.");
    expect(lines).toContain("Average 45% across 2 assessments, 20 points below the class average (65%); ranked 2 of 2.");
    expect(lines).toContain("Latest: Test 2 40% (class 60%), down from 50%.");
    expect(lines).toContain("Strongest topic: Forces (70%); weakest: Energy (30%).");

    const cal = studentSummary(studentProfile(d.students[2], d, cls, "4w", TODAY), cls, "4w");
    expect(cal).toContain("Asked 4 times; answered 1 (25%), below the class median of 63%.");
    expect(cal.some((l) => l.startsWith("3 bathroom trips (class average 0,8), 20 min out in total; longest 12:00."))).toBe(true);
    expect(cal).toContain("No marks entered for Cal in the last 4 weeks.");
  });
});

describe("helpers", () => {
  it("builds a weekly trend with empty weeks kept", () => {
    const weeks = weeklyBehaviour([ev("a", "TALK", "2026-10-06", -1), ev("a", "EFF", "2026-09-24", 1)], "2w", TODAY);
    expect(weeks.map((w) => [w.week, w.net])).toEqual([
      ["2026-09-21", 1],
      ["2026-09-28", 0],
      ["2026-10-05", -1],
    ]);
    expect(weeklyBehaviour([], "all", TODAY)).toEqual([]);
  });

  it("skips questions without a topic", () => {
    const d = data();
    d.assessmentQuestions[1].topic = "";
    expect(scoresBy("topic", "a", d.assessmentQuestions, d.questionMarks).map((t) => t.name)).toEqual(["Forces"]);
  });

  it("only names a strongest and weakest topic when they're clearly apart", () => {
    const d = data();
    d.questionMarks = d.questionMarks.map((m) => ({ ...m, mark: m.number === 1 ? 7 : 6.5 })); // 70% vs 65%
    const p = classProfile(d, "all", TODAY);
    expect(classSummary(p, null, "all", String).some((l) => l.startsWith("Strongest topic"))).toBe(false);
  });
});

describe("parent report", () => {
  const ALL = new Set<ReportSection>(REPORT_SECTIONS.map((s) => s.id));
  const d = filterToPeriod(data(), "4w", TODAY);
  const cls = classProfile(d, "4w", TODAY);
  const profileOf = (i: number) => studentProfile(d.students[i], d, cls, "4w", TODAY);

  it("words things for parents: no rank, no medians, no 'to watch'", () => {
    const lines = parentSummary(profileOf(1), cls, ALL);
    expect(lines).toEqual([
      "Average 45% across 2 assessments (class average 65%).",
      "Latest: Test 2 40%, down from 50%.",
      "Strongest topic: Forces (70%); a topic to focus on: Energy (30%).",
      "Areas to work on: Talking / off task (2), Disruptive (1).",
      "Attendance 100% (1 late arrival).",
    ]);
    const all = lines.join(" ");
    for (const word of ["rank", "median", "watch", "⚠"]) expect(all).not.toContain(word);
  });

  it("says what's going well, and when there's nothing to worry about", () => {
    const lines = parentSummary(profileOf(0), cls, ALL);
    expect(lines).toContain("Going well: Great effort (1), Helping others (1).");
    expect(lines).toContain("No concerns about behaviour in this period.");
    expect(lines).toContain("Answered 3 of 3 questions when asked in class.");
    expect(lines).toContain("Attendance 50% (1 absence).");
    const cal = parentSummary(profileOf(2), cls, ALL);
    expect(cal).toContain("3 bathroom trips during lessons (20 min in total).");
    expect(cal).toContain("No marks have been entered for Cal in this period yet.");
  });

  it("leaves out the sections that are switched off", () => {
    const lines = parentSummary(profileOf(2), cls, new Set<ReportSection>(["behaviour"]));
    expect(lines).toEqual(["Area to work on: Talking / off task (1).", "Answered 1 of 4 questions when asked in class."]);
    expect(parentSummary(profileOf(2), cls, new Set())).toEqual([]);
  });

  it("covers a chosen date range", () => {
    const term = filterToRange(data(), "2026-09-01", "2026-09-30");
    expect(term.assessments.map((a) => a.id)).toEqual(["t1"]);
    expect(term.behaviourEvents).toHaveLength(1);
    const p = classProfile(term, "all", TODAY);
    expect(parentSummary(studentProfile(term.students[0], term, p, "all", TODAY), p, ALL)[0]).toBe(
      "Average 90% across 1 assessment (class average 70%).",
    );
  });
});
