// Aggregation math for the attendance, behaviour and assessment views.

import { dateInZone } from "./time";
import {
  ANSWERED_BEHAVIOUR,
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  BathroomVisit,
  BehaviourEvent,
  GradeScale,
  Mark,
  NO_ANSWER_BEHAVIOUR,
  QuestionMark,
  Student,
} from "./types";

// ---------- attendance ----------

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Present + Late as a fraction of unexcused sessions, 0..1. Null if no data. */
  rate: number | null;
}

export function attendanceSummary(entries: AttendanceEntry[]): AttendanceSummary {
  const s: AttendanceSummary = { total: entries.length, present: 0, absent: 0, late: 0, excused: 0, rate: null };
  for (const e of entries) {
    if (e.status === "P") s.present++;
    else if (e.status === "A") s.absent++;
    else if (e.status === "L") s.late++;
    else s.excused++;
  }
  const counted = s.total - s.excused;
  if (counted > 0) s.rate = (s.present + s.late) / counted;
  return s;
}

export function attendanceByStudent(entries: AttendanceEntry[]): Map<string, AttendanceSummary> {
  const grouped = new Map<string, AttendanceEntry[]>();
  for (const e of entries) {
    const list = grouped.get(e.studentId) ?? [];
    list.push(e);
    grouped.set(e.studentId, list);
  }
  return new Map([...grouped.entries()].map(([id, list]) => [id, attendanceSummary(list)]));
}

// ---------- behaviour ----------

export interface BehaviourSummary {
  positive: number;
  negative: number;
  points: number;
}

export function behaviourByStudent(events: BehaviourEvent[]): Map<string, BehaviourSummary> {
  const out = new Map<string, BehaviourSummary>();
  for (const e of events) {
    const s = out.get(e.studentId) ?? { positive: 0, negative: 0, points: 0 };
    if (e.points >= 0) s.positive++;
    else s.negative++;
    s.points += e.points;
    out.set(e.studentId, s);
  }
  return out;
}

export function eventsOnDate(events: BehaviourEvent[], date: string): BehaviourEvent[] {
  return events.filter((e) => dateInZone(e.timestamp) === date);
}

export interface AnswerTally {
  /** Times the student was asked and answered. */
  answered: number;
  /** Times the student was asked and could not answer. */
  missed: number;
  /** answered + missed. */
  asked: number;
}

export const EMPTY_ANSWER_TALLY: AnswerTally = { answered: 0, missed: 0, asked: 0 };

/**
 * How each student has fared when picked to answer, counted from the two
 * answer codes the random-student picker logs. Every other behaviour event is
 * ignored, so a student's tally is only about questions they were asked.
 */
export function answerTallyByStudent(events: BehaviourEvent[]): Map<string, AnswerTally> {
  const out = new Map<string, AnswerTally>();
  for (const e of events) {
    const answered = e.code === ANSWERED_BEHAVIOUR.code;
    if (!answered && e.code !== NO_ANSWER_BEHAVIOUR.code) continue;
    const t = out.get(e.studentId) ?? { ...EMPTY_ANSWER_TALLY };
    if (answered) t.answered++;
    else t.missed++;
    t.asked++;
    out.set(e.studentId, t);
  }
  return out;
}

// ---------- bathroom visits ----------

/** Whole seconds a visit has lasted; a still-open visit runs against `now`. */
export function visitSeconds(visit: BathroomVisit, now: number = Date.now()): number {
  const start = Date.parse(visit.start);
  const end = visit.end ? Date.parse(visit.end) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** m:ss (or h:mm:ss past an hour) for live timers and logged durations. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// ---------- assessments ----------

export interface AssessmentStats {
  assessmentId: string;
  entered: number;
  mean: number | null; // percentages 0..100
  median: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
}

export function percentage(mark: Mark, assessment: Assessment): number | null {
  if (mark.mark === null || assessment.totalMarks <= 0) return null;
  return (mark.mark / assessment.totalMarks) * 100;
}

/**
 * The South African 7-level achievement code for a percentage, matching the
 * "Sym" column of the reference mark-entry app. 7 = 80–100% down to 1 = 0–29%.
 * Returns "" when there's no percentage to grade (e.g. nothing entered).
 */
export function symbolForPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  if (pct >= 80) return "7";
  if (pct >= 70) return "6";
  if (pct >= 60) return "5";
  if (pct >= 50) return "4";
  if (pct >= 40) return "3";
  if (pct >= 30) return "2";
  return "1";
}

/** The letter symbol for a percentage: A 80%+, B 70–79, C 60–69, D 50–59, E 40–49, F below 40. */
export function letterForPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  if (pct >= 40) return "E";
  return "F";
}

/** A percentage as a grade on the teacher's chosen scale (Settings → Assessments). */
export function gradeForPct(pct: number | null, scale: GradeScale): string {
  return scale === "symbol" ? letterForPct(pct) : symbolForPct(pct);
}

/** Labels and the key for each scale, for column headers and help text. */
export const GRADE_SCALES: Record<GradeScale, { label: string; short: string; key: string }> = {
  level: {
    label: "Level",
    short: "Lvl",
    key: "7 = 80%+, 6 = 70–79, 5 = 60–69, 4 = 50–59, 3 = 40–49, 2 = 30–39, 1 = below 30%",
  },
  symbol: {
    label: "Symbol",
    short: "Sym",
    key: "A = 80%+, B = 70–79, C = 60–69, D = 50–59, E = 40–49, F = below 40%",
  },
};

export function assessmentStats(assessment: Assessment, marks: Mark[]): AssessmentStats {
  const pcts = marks
    .filter((m) => m.assessmentId === assessment.id)
    .map((m) => percentage(m, assessment))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const n = pcts.length;
  if (n === 0) {
    return { assessmentId: assessment.id, entered: 0, mean: null, median: null, min: null, max: null, stdev: null };
  }
  const mean = pcts.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? pcts[(n - 1) / 2] : (pcts[n / 2 - 1] + pcts[n / 2]) / 2;
  const stdev = n > 1 ? Math.sqrt(pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { assessmentId: assessment.id, entered: n, mean, median, min: pcts[0], max: pcts[n - 1], stdev };
}

/** Histogram of percentages in fixed 10%-wide bins: [0-10), ... [90-100]. */
export function histogram(pcts: number[]): { bin: string; count: number }[] {
  const bins = new Array(10).fill(0);
  for (const v of pcts) {
    const idx = Math.min(9, Math.max(0, Math.floor(v / 10)));
    bins[idx]++;
  }
  return bins.map((count, i) => ({ bin: i === 9 ? "90-100" : `${i * 10}-${i * 10 + 10}`, count }));
}

/** Mean overall percentage per student across all assessments they have marks for. */
export function overallPercent(studentId: string, assessments: Assessment[], marks: Mark[]): number | null {
  let count = 0;
  let acc = 0;
  for (const a of assessments) {
    const m = marks.find((m) => m.assessmentId === a.id && m.studentId === studentId);
    if (!m) continue;
    const pct = percentage(m, a);
    if (pct === null) continue;
    acc += pct;
    count += 1;
  }
  return count > 0 ? acc / count : null;
}

/** Per-student series of percentages in assessment date order (nulls skipped). */
export function studentSeries(
  studentId: string,
  assessments: Assessment[],
  marks: Mark[],
): { assessment: Assessment; pct: number }[] {
  const ordered = [...assessments].sort((a, b) => a.date.localeCompare(b.date));
  const out: { assessment: Assessment; pct: number }[] = [];
  for (const a of ordered) {
    const m = marks.find((m) => m.assessmentId === a.id && m.studentId === studentId);
    if (!m) continue;
    const pct = percentage(m, a);
    if (pct !== null) out.push({ assessment: a, pct });
  }
  return out;
}

export interface AtRiskFlag {
  studentId: string;
  reason: string;
}

/**
 * Simple, explainable at-risk heuristics:
 *  - latest result more than 15 points below the student's own average, or
 *  - overall average more than 12 points below the class average, or
 *  - three declining results in a row.
 */
export function atRiskStudents(students: Student[], assessments: Assessment[], marks: Mark[]): AtRiskFlag[] {
  const flags: AtRiskFlag[] = [];
  const overall = students
    .map((s) => overallPercent(s.id, assessments, marks))
    .filter((v): v is number => v !== null);
  const classAvg = overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : null;

  for (const s of students) {
    const series = studentSeries(s.id, assessments, marks);
    const own = overallPercent(s.id, assessments, marks);
    if (series.length >= 2 && own !== null) {
      const latest = series[series.length - 1].pct;
      if (own - latest > 15) {
        flags.push({ studentId: s.id, reason: `Latest result ${Math.round(latest)}% is well below their average ${Math.round(own)}%` });
        continue;
      }
    }
    if (own !== null && classAvg !== null && classAvg - own > 12) {
      flags.push({ studentId: s.id, reason: `Average ${Math.round(own)}% is well below the class average ${Math.round(classAvg)}%` });
      continue;
    }
    if (series.length >= 3) {
      const last3 = series.slice(-3).map((p) => p.pct);
      if (last3[0] > last3[1] && last3[1] > last3[2]) {
        flags.push({ studentId: s.id, reason: "Three declining results in a row" });
      }
    }
  }
  return flags;
}

// ---------- per-question marking grid ----------
// These helpers power the live stats on the multi-question marking grid. They
// expect the questions and question-marks for a single assessment (the grid
// filters them by assessment id before calling in).

/** Build a `studentId|questionNumber -> mark` index for O(1) cell lookups. */
function markIndex(qmarks: QuestionMark[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const m of qmarks) {
    if (m.mark != null) idx.set(`${m.studentId}|${m.number}`, m.mark);
  }
  return idx;
}

export interface QuestionAverage {
  number: number;
  /** Students with a mark entered for this question. */
  entered: number;
  meanMark: number | null;
  meanPct: number | null;
}

/** Per question: mean mark and mean % across students who have a mark for it. */
export function questionAverages(questions: AssessmentQuestion[], qmarks: QuestionMark[]): QuestionAverage[] {
  const idx = markIndex(qmarks);
  const studentIds = [...new Set(qmarks.map((m) => m.studentId))];
  return questions.map((q) => {
    const vals = studentIds
      .map((id) => idx.get(`${id}|${q.number}`))
      .filter((v): v is number => v !== undefined);
    if (vals.length === 0) return { number: q.number, entered: 0, meanMark: null, meanPct: null };
    const meanMark = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      number: q.number,
      entered: vals.length,
      meanMark,
      meanPct: q.marks > 0 ? (meanMark / q.marks) * 100 : null,
    };
  });
}

export interface Provisional {
  /** Sum of the student's entered marks. */
  total: number;
  /** Sum of the max marks of the questions they have answered. */
  maxSoFar: number;
  /** total / maxSoFar as a percentage — a mark based only on questions entered. */
  pct: number | null;
  /** How many questions the student has a mark for. */
  answered: number;
}

/** A student's running total and an entered-only provisional percentage. */
export function studentProvisional(
  studentId: string,
  questions: AssessmentQuestion[],
  qmarks: QuestionMark[],
): Provisional {
  const idx = markIndex(qmarks);
  let total = 0;
  let maxSoFar = 0;
  let answered = 0;
  for (const q of questions) {
    const v = idx.get(`${studentId}|${q.number}`);
    if (v === undefined) continue;
    total += v;
    maxSoFar += q.marks;
    answered += 1;
  }
  return { total, maxSoFar, pct: maxSoFar > 0 ? (total / maxSoFar) * 100 : null, answered };
}

/**
 * Rank students by their current total (highest = rank 1). Students who have no
 * marks entered (didn't sit / not started) are left out. Ties share the average
 * of the positions they span, matching the reference marksheet (e.g. two tied
 * for 3rd/4th both get 3.5).
 */
export function rankStudents(
  studentIds: string[],
  questions: AssessmentQuestion[],
  qmarks: QuestionMark[],
): Map<string, number> {
  const idx = markIndex(qmarks);
  const totals = new Map<string, number>();
  for (const id of studentIds) {
    let total = 0;
    let answered = 0;
    for (const q of questions) {
      const v = idx.get(`${id}|${q.number}`);
      if (v === undefined) continue;
      total += v;
      answered += 1;
    }
    if (answered > 0) totals.set(id, total);
  }
  return rankByScore(totals);
}

/**
 * Rank by score, highest = rank 1. Ties share the average of the positions they
 * span (two tied for 3rd/4th both get 3.5). Used for a test's total and for a
 * student's average across tests.
 */
export function rankByScore(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][1] === sorted[i][1]) j++;
    const avgRank = (i + 1 + (j + 1)) / 2; // positions are 0-based, ranks 1-based
    for (let k = i; k <= j; k++) ranks.set(sorted[k][0], avgRank);
    i = j + 1;
  }
  return ranks;
}

/** Fraction of grid cells that have a mark entered (0..1). 1 = fully entered. */
export function gridCompletion(
  studentIds: string[],
  questions: AssessmentQuestion[],
  qmarks: QuestionMark[],
): number {
  const cells = studentIds.length * questions.length;
  if (cells === 0) return 1;
  const idx = markIndex(qmarks);
  let filled = 0;
  for (const id of studentIds) {
    for (const q of questions) {
      if (idx.has(`${id}|${q.number}`)) filled++;
    }
  }
  return filled / cells;
}
