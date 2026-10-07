// The analysis behind the Class and Student dashboards: everything the app
// records about a class (behaviour, cold-call answers, bathroom trips,
// attendance, marks) boiled down per student and per class, plus short
// plain-language summaries built from fixed, explainable rules. Pure functions
// over the class's data; "today" always comes in as an argument.

import { dateInZone } from "./time";
import {
  AnswerTally,
  AtRiskFlag,
  AttendanceSummary,
  EMPTY_ANSWER_TALLY,
  answerTallyByStudent,
  assessmentStats,
  atRiskStudents,
  attendanceSummary,
  formatDuration,
  overallPercent,
  percentage,
  symbolForPct,
  visitSeconds,
} from "./stats";
import {
  ANSWER_BEHAVIOURS,
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  BathroomVisit,
  BehaviourCode,
  BehaviourEvent,
  Mark,
  QuestionMark,
  Student,
} from "./types";

export interface ClassData {
  students: Student[];
  attendance: AttendanceEntry[];
  behaviourEvents: BehaviourEvent[];
  bathroomVisits: BathroomVisit[];
  assessments: Assessment[];
  marks: Mark[];
  assessmentQuestions: AssessmentQuestion[];
  questionMarks: QuestionMark[];
  behaviourCodes: BehaviourCode[];
}

// ---------- periods ----------

export type Period = "2w" | "4w" | "all";

export const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "2w", label: "Last 2 weeks" },
  { id: "4w", label: "Last 4 weeks" },
  { id: "all", label: "All" },
];

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = { "2w": 14, "4w": 28 };

/** Shift a YYYY-MM-DD date by whole days (calendar arithmetic, no time zones). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** First day (inclusive) a period covers, or null for "all". */
export function periodStart(period: Period, today: string): string | null {
  return period === "all" ? null : addDays(today, -(PERIOD_DAYS[period] - 1));
}

/** Whether a YYYY-MM-DD date falls inside the period ending today. */
export function inPeriod(date: string, period: Period, today: string): boolean {
  if (!date) return false;
  const start = periodStart(period, today);
  return date <= today && (start === null || date >= start);
}

/** Words for the period, to finish a sentence: "in the last 2 weeks". */
export function periodPhrase(period: Period): string {
  return period === "2w" ? "in the last 2 weeks" : period === "4w" ? "in the last 4 weeks" : "so far";
}

function keepBetween(data: ClassData, from: string | null, to: string): ClassData {
  const ok = (date: string) => !!date && date <= to && (from === null || date >= from);
  const assessments = data.assessments.filter((a) => ok(a.date));
  const ids = new Set(assessments.map((a) => a.id));
  return {
    ...data,
    attendance: data.attendance.filter((e) => ok(e.date)),
    behaviourEvents: data.behaviourEvents.filter((e) => ok(dateInZone(e.timestamp))),
    bathroomVisits: data.bathroomVisits.filter((v) => ok(v.date)),
    assessments,
    marks: data.marks.filter((m) => ids.has(m.assessmentId)),
    assessmentQuestions: data.assessmentQuestions.filter((q) => ids.has(q.assessmentId)),
    questionMarks: data.questionMarks.filter((m) => ids.has(m.assessmentId)),
  };
}

/** The class's data cut down to one period. */
export function filterToPeriod(data: ClassData, period: Period, today: string): ClassData {
  return keepBetween(data, periodStart(period, today), today);
}

/** The class's data between two dates (inclusive), e.g. a term for a parent report. */
export function filterToRange(data: ClassData, from: string, to: string): ClassData {
  return keepBetween(data, from || null, to);
}

/** The same length of time just before the period, for "up / down on before". Null for "all". */
export function previousPeriod(data: ClassData, period: Period, today: string): ClassData | null {
  if (period === "all") return null;
  const start = periodStart(period, today)!;
  return keepBetween(data, addDays(start, -PERIOD_DAYS[period]), addDays(start, -1));
}

// ---------- number formatting (SA: decimal comma, U+2212 minus) ----------

/** A number to `dp` decimals with a decimal comma: 1.25 → "1,3". */
export function fmtNum(n: number, dp = 0): string {
  const s = Math.abs(n).toFixed(dp).replace(".", ",");
  return n < 0 && Number(s.replace(",", ".")) !== 0 ? `−${s}` : s;
}

export function fmtPct(pct: number | null, dp = 0): string {
  return pct === null ? "—" : `${fmtNum(pct, dp)}%`;
}

/** Points with a sign: +3, −2, 0, and one decimal when it isn't whole (a median): −0,5. */
export function fmtSigned(n: number): string {
  const s = fmtNum(n, Number.isInteger(n) ? 0 : 1);
  return n > 0 ? `+${s}` : s;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

const minutes = (seconds: number) => `${fmtNum(seconds / 60)} min`;

// ---------- behaviour ----------

/**
 * Cold-call answers are logged as behaviour events but are about knowledge,
 * not conduct: the dashboards count them under Questions, never as behaviour,
 * so a student who can't answer isn't flagged as misbehaving.
 */
const ANSWER_CODES = new Set(ANSWER_BEHAVIOURS.map((b) => b.code));
export const isConductEvent = (e: BehaviourEvent) => !ANSWER_CODES.has(e.code);

export interface BehaviourTotals {
  positive: number;
  negative: number;
  /** Sum of points. */
  net: number;
}

export interface CodeCount {
  code: string;
  label: string;
  color: string;
  kind: "positive" | "negative";
  count: number;
}

export interface WeekPoint {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  positive: number;
  negative: number;
  net: number;
}

function totals(events: BehaviourEvent[]): BehaviourTotals {
  const t = { positive: 0, negative: 0, net: 0 };
  for (const e of events) {
    if (e.points >= 0) t.positive++;
    else t.negative++;
    t.net += e.points;
  }
  return t;
}

/** Counts per behaviour, most frequent first (negatives before positives on a tie). */
export function countByCode(events: BehaviourEvent[], codes: BehaviourCode[]): CodeCount[] {
  const byCode = new Map(codes.map((c) => [c.code, c]));
  const counts = new Map<string, CodeCount>();
  for (const e of events) {
    const c = byCode.get(e.code);
    const row = counts.get(e.code) ?? {
      code: e.code,
      label: c?.label ?? e.code,
      color: c?.color ?? "#4a5868",
      kind: c?.kind ?? (e.points < 0 ? "negative" : "positive"),
      count: 0,
    };
    row.count++;
    counts.set(e.code, row);
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "negative" ? -1 : 1),
  );
}

/** Monday of the week a date falls in. */
export function weekOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/**
 * Behaviour per week from the period's first week (or the first event, for
 * "all") to this week, with empty weeks kept so the trend line is honest.
 */
export function weeklyBehaviour(events: BehaviourEvent[], period: Period, today: string): WeekPoint[] {
  const dates = events.map((e) => dateInZone(e.timestamp));
  const known = dates.filter(Boolean);
  if (period === "all" && known.length === 0) return [];
  const start = periodStart(period, today) ?? known.reduce((a, b) => (b < a ? b : a));
  const weeks = new Map<string, WeekPoint>();
  for (let w = weekOf(start); w <= today; w = addDays(w, 7)) weeks.set(w, { week: w, positive: 0, negative: 0, net: 0 });
  events.forEach((e, i) => {
    const p = dates[i] ? weeks.get(weekOf(dates[i])) : undefined;
    if (!p) return;
    if (e.points >= 0) p.positive++;
    else p.negative++;
    p.net += e.points;
  });
  return [...weeks.values()];
}

// ---------- marks ----------

export interface AssessmentRow {
  assessment: Assessment;
  mark: number | null;
  pct: number | null;
  symbol: string;
  classMean: number | null;
  /** pct − classMean, in percentage points. */
  diff: number | null;
  comment: string;
}

export interface TopicScore {
  name: string;
  earned: number;
  possible: number;
  pct: number;
  /** The class's percentage on the same questions. */
  classPct: number | null;
}

/**
 * Percentage per topic (or per cognitive level) from per-question marks: the
 * marks earned over the marks available on the questions the student has a
 * mark for. Questions with no topic are left out of the topic view.
 */
export function scoresBy(
  key: "topic" | "cognitiveLevel",
  studentId: string | null,
  questions: AssessmentQuestion[],
  qmarks: QuestionMark[],
): TopicScore[] {
  const qByKey = new Map(questions.map((q) => [`${q.assessmentId}|${q.number}`, q]));
  const acc = new Map<string, { earned: number; possible: number }>();
  for (const m of qmarks) {
    if (m.mark == null || (studentId !== null && m.studentId !== studentId)) continue;
    const q = qByKey.get(`${m.assessmentId}|${m.number}`);
    const name = q?.[key]?.trim();
    if (!q || !name || q.marks <= 0) continue;
    const a = acc.get(name) ?? { earned: 0, possible: 0 };
    a.earned += m.mark;
    a.possible += q.marks;
    acc.set(name, a);
  }
  return [...acc.entries()]
    .map(([name, a]) => ({ name, earned: a.earned, possible: a.possible, pct: (a.earned * 100) / a.possible, classPct: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function withClass(mine: TopicScore[], cls: TopicScore[]): TopicScore[] {
  const byName = new Map(cls.map((c) => [c.name, c.pct]));
  return mine.map((t) => ({ ...t, classPct: byName.get(t.name) ?? null }));
}

/** Rank by overall percentage, 1 = top; ties share the better position. */
function overallRanks(overalls: Map<string, number>): Map<string, number> {
  const sorted = [...overalls.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number>();
  sorted.forEach(([id, pct], i) => {
    const prev = sorted[i - 1];
    ranks.set(id, prev && prev[1] === pct ? ranks.get(prev[0])! : i + 1);
  });
  return ranks;
}

/** Topics this close together aren't worth calling a strength or weakness. */
export const TOPIC_GAP = 10;

/** "Strongest topic: …; weakest: …" when the topics differ by a meaningful margin. */
function topicLine(topics: TopicScore[], weakest = "weakest"): string | null {
  const sorted = topics.filter((t) => t.possible > 0).sort((a, b) => b.pct - a.pct);
  if (sorted.length < 2) return null;
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.pct - worst.pct < TOPIC_GAP) return null;
  return `Strongest topic: ${best.name} (${fmtPct(best.pct)}); ${weakest}: ${worst.name} (${fmtPct(worst.pct)}).`;
}

// ---------- the class ----------

export interface StudentCount {
  studentId: string;
  value: number;
  /** A few words on why they're listed. */
  detail: string;
}

export interface ClassProfile {
  studentCount: number;
  behaviour: BehaviourTotals & { byCode: CodeCount[]; weekly: WeekPoint[] };
  perStudent: Map<string, BehaviourTotals>;
  /** Students whose conduct stands out for the wrong reasons. */
  watch: StudentCount[];
  /** Most positive entries. */
  stars: StudentCount[];
  answers: AnswerTally & { rate: number | null; medianRate: number | null };
  answerTallies: Map<string, AnswerTally>;
  /** Best answer rate, among students asked at least three times. */
  answerers: StudentCount[];
  /** Not picked to answer yet, or picked far less than most. */
  rarelyAsked: StudentCount[];
  bathroom: { trips: number; totalSeconds: number; avgTrips: number };
  bathroomUsers: StudentCount[];
  attendanceRate: number | null;
  lowAttendance: StudentCount[];
  classAverage: number | null;
  overalls: Map<string, number>;
  ranks: Map<string, number>;
  topPerformers: StudentCount[];
  atRisk: AtRiskFlag[];
  medianNet: number;
  /** Class percentage per topic / cognitive level (per-question marks only). */
  topics: TopicScore[];
  levels: TopicScore[];
  /** Latest assessment in the period with marks, and its class mean. */
  latest: { assessment: Assessment; mean: number } | null;
}

export const MIN_ASKED_FOR_RATE = 3;

export function classProfile(data: ClassData, period: Period, today: string): ClassProfile {
  const { students } = data;
  const conduct = data.behaviourEvents.filter(isConductEvent);
  const byStudent = new Map<string, BehaviourEvent[]>(students.map((s) => [s.id, []]));
  for (const e of conduct) byStudent.get(e.studentId)?.push(e);
  const perStudent = new Map([...byStudent.entries()].map(([id, evs]) => [id, totals(evs)]));
  const codes = data.behaviourCodes;

  // Students to watch: three or more negative entries with a net score below
  // the class median (so a star with a couple of slips isn't listed), or a
  // net score far below the rest of the class.
  const nets = [...perStudent.values()].map((t) => t.net);
  const medianNet = median(nets) ?? 0;
  const spread = stdev(nets);
  const watch = students
    .map((s) => {
      const t = perStudent.get(s.id)!;
      const outlier = t.net < 0 && spread > 0 && t.net <= medianNet - 2 * spread;
      if (!(t.negative >= 3 && t.net < medianNet) && !outlier) return null;
      const top = countByCode(byStudent.get(s.id)!.filter((e) => e.points < 0), codes)[0];
      const detail = `${t.negative} negative${t.negative === 1 ? "" : "s"}${top && top.count >= 2 ? `, mostly ${top.label} (${top.count})` : ""}`;
      return { studentId: s.id, value: t.negative, net: t.net, detail };
    })
    .filter((x): x is StudentCount & { net: number } => x !== null)
    .sort((a, b) => b.value - a.value || a.net - b.net)
    .map(({ studentId, value, detail }) => ({ studentId, value, detail }));

  const stars = students
    .map((s) => ({ s, t: perStudent.get(s.id)! }))
    .filter(({ t }) => t.positive > 0 && t.net > 0)
    .sort((a, b) => b.t.positive - a.t.positive || b.t.net - a.t.net)
    .slice(0, 5)
    .map(({ s, t }) => ({ studentId: s.id, value: t.positive, detail: `${t.positive} positive, net ${fmtSigned(t.net)}` }));

  // Cold-call answers.
  const tallies = answerTallyByStudent(data.behaviourEvents);
  const tallyOf = (id: string) => tallies.get(id) ?? EMPTY_ANSWER_TALLY;
  const answered = students.reduce((n, s) => n + tallyOf(s.id).answered, 0);
  const asked = students.reduce((n, s) => n + tallyOf(s.id).asked, 0);
  const rates = students.map((s) => tallyOf(s.id)).filter((t) => t.asked >= MIN_ASKED_FOR_RATE).map((t) => t.answered / t.asked);
  const answerers = students
    .map((s) => ({ s, t: tallyOf(s.id) }))
    .filter(({ t }) => t.asked >= MIN_ASKED_FOR_RATE && t.answered / t.asked >= 0.5)
    .sort((a, b) => b.t.answered / b.t.asked - a.t.answered / a.t.asked || b.t.answered - a.t.answered)
    .slice(0, 5)
    .map(({ s, t }) => ({
      studentId: s.id,
      value: t.answered / t.asked,
      detail: `${t.answered} of ${t.asked} (${fmtPct((t.answered / t.asked) * 100)})`,
    }));
  const medianAsked = median(students.map((s) => tallyOf(s.id).asked)) ?? 0;
  const rarelyAsked =
    asked === 0
      ? []
      : students
          .map((s) => ({ s, n: tallyOf(s.id).asked }))
          .filter(({ n }) => n === 0 || n <= Math.floor(medianAsked / 3))
          .sort((a, b) => a.n - b.n || a.s.lastName.localeCompare(b.s.lastName))
          .map(({ s, n }) => ({ studentId: s.id, value: n, detail: n === 0 ? "not asked yet" : `asked ${n}×` }));

  // Bathroom trips.
  const trips = new Map<string, { n: number; secs: number }>();
  for (const v of data.bathroomVisits) {
    const t = trips.get(v.studentId) ?? { n: 0, secs: 0 };
    t.n++;
    t.secs += visitSeconds(v);
    trips.set(v.studentId, t);
  }
  const tripTotal = data.bathroomVisits.length;
  const bathroomUsers = [...trips.entries()]
    .filter(([id]) => byStudent.has(id))
    .sort((a, b) => b[1].n - a[1].n || b[1].secs - a[1].secs)
    .slice(0, 5)
    .map(([id, t]) => ({ studentId: id, value: t.n, detail: `${t.n} trip${t.n === 1 ? "" : "s"}, ${minutes(t.secs)}` }));

  // Attendance.
  const attBy = new Map<string, AttendanceEntry[]>();
  for (const e of data.attendance) attBy.set(e.studentId, [...(attBy.get(e.studentId) ?? []), e]);
  const att = students.map((s) => ({ s, sum: attendanceSummary(attBy.get(s.id) ?? []) }));
  const attRates = att.map(({ sum }) => sum.rate).filter((r): r is number => r !== null);
  const lowAttendance = att
    .filter(({ sum }) => sum.rate !== null && sum.rate < 0.9)
    .sort((a, b) => (a.sum.rate as number) - (b.sum.rate as number))
    .map(({ s, sum }) => ({
      studentId: s.id,
      value: sum.rate as number,
      detail: `${fmtPct((sum.rate as number) * 100)} (${sum.absent} absent, ${sum.late} late)`,
    }));

  // Marks.
  const overalls = new Map<string, number>();
  for (const s of students) {
    const pct = overallPercent(s.id, data.assessments, data.marks);
    if (pct !== null) overalls.set(s.id, pct);
  }
  const classAverage = overalls.size ? [...overalls.values()].reduce((a, b) => a + b, 0) / overalls.size : null;
  const topPerformers = [...overalls.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, pct]) => ({ studentId: id, value: pct, detail: `${fmtPct(pct)} average` }));
  const withMarks = [...data.assessments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => ({ assessment: a, mean: assessmentStats(a, data.marks).mean }))
    .find((x) => x.mean !== null);

  return {
    studentCount: students.length,
    behaviour: { ...totals(conduct), byCode: countByCode(conduct, codes), weekly: weeklyBehaviour(conduct, period, today) },
    perStudent,
    watch,
    stars,
    answers: { answered, missed: asked - answered, asked, rate: asked ? answered / asked : null, medianRate: median(rates) },
    answerTallies: tallies,
    answerers,
    rarelyAsked,
    bathroom: { trips: tripTotal, totalSeconds: [...trips.values()].reduce((a, t) => a + t.secs, 0), avgTrips: students.length ? tripTotal / students.length : 0 },
    bathroomUsers,
    attendanceRate: attRates.length ? attRates.reduce((a, b) => a + b, 0) / attRates.length : null,
    lowAttendance,
    classAverage,
    overalls,
    ranks: overallRanks(overalls),
    topPerformers,
    atRisk: atRiskStudents(students, data.assessments, data.marks),
    medianNet,
    topics: scoresBy("topic", null, data.assessmentQuestions, data.questionMarks),
    levels: scoresBy("cognitiveLevel", null, data.assessmentQuestions, data.questionMarks),
    latest: withMarks ? { assessment: withMarks.assessment, mean: withMarks.mean as number } : null,
  };
}

/** A few lines on how the class is doing, built from fixed rules. */
export function classSummary(
  p: ClassProfile,
  previous: ClassProfile | null,
  period: Period,
  nameOf: (id: string) => string,
): string[] {
  const when = periodPhrase(period);
  const lines: string[] = [];
  const b = p.behaviour;

  if (b.positive + b.negative === 0) {
    lines.push(`No behaviour recorded ${when}.`);
  } else {
    lines.push(`${b.positive} positive and ${b.negative} negative behaviour entries ${when} (net ${fmtSigned(b.net)}).`);
    if (previous && previous.behaviour.negative >= 3) {
      const change = ((b.negative - previous.behaviour.negative) / previous.behaviour.negative) * 100;
      if (Math.abs(change) >= 20) {
        lines.push(
          `Negative behaviour is ${change < 0 ? "down" : "up"} ${fmtPct(Math.abs(change))} on the ${period === "2w" ? "2" : "4"} weeks before.`,
        );
      }
    }
    const issue = b.byCode.find((c) => c.kind === "negative");
    if (issue && issue.count >= 2) lines.push(`Most common issue: ${issue.label} (${issue.count}).`);
    if (b.negative >= 6 && p.watch.length > 0) {
      const top = p.watch.slice(0, 3);
      const share = top.reduce((n, w) => n + w.value, 0) / b.negative;
      if (share >= 0.5) {
        lines.push(
          `${top.length === 1 ? "One student accounts" : `${top.length} students account`} for ${fmtPct(share * 100)} of the negative entries: ${top.map((w) => nameOf(w.studentId)).join(", ")}.`,
        );
      }
    }
  }

  if (p.answers.asked > 0) {
    lines.push(`Questions: ${p.answers.asked} asked, ${p.answers.answered} answered (${fmtPct((p.answers.rate ?? 0) * 100)}).`);
    const never = p.rarelyAsked.filter((r) => r.value === 0).length;
    if (never > 0) lines.push(`${never} student${never === 1 ? " hasn't" : "s haven't"} been picked to answer ${when}.`);
  }

  if (p.bathroom.trips > 0) {
    const most = p.bathroomUsers[0];
    lines.push(
      `${p.bathroom.trips} bathroom trip${p.bathroom.trips === 1 ? "" : "s"}, ${minutes(p.bathroom.totalSeconds)} out in total` +
        (most && most.value >= 3 ? `; most by ${nameOf(most.studentId)} (${most.value}).` : "."),
    );
  }

  if (p.attendanceRate !== null) {
    lines.push(
      `Attendance ${fmtPct(p.attendanceRate * 100)}` +
        (p.lowAttendance.length ? `; ${p.lowAttendance.length} below 90%.` : "."),
    );
  }

  if (p.classAverage !== null) {
    lines.push(
      `Class average ${fmtPct(p.classAverage)}` +
        (p.latest ? `; latest: ${p.latest.assessment.title} ${fmtPct(p.latest.mean)}.` : ".") +
        (p.atRisk.length ? ` ${p.atRisk.length} of ${p.overalls.size} flagged on marks.` : ""),
    );
  }
  const topics = topicLine(p.topics);
  if (topics) lines.push(topics);
  return lines;
}

// ---------- one student ----------

export interface StudentProfile {
  student: Student;
  attendance: AttendanceSummary;
  absentDates: string[];
  lateDates: string[];
  behaviour: BehaviourTotals & { byCode: CodeCount[]; weekly: WeekPoint[]; recent: BehaviourEvent[] };
  answers: AnswerTally;
  bathroom: { trips: number; totalSeconds: number; longestSeconds: number; visits: BathroomVisit[] };
  assessments: AssessmentRow[];
  overall: number | null;
  rank: number | null;
  rankedOf: number;
  topics: TopicScore[];
  levels: TopicScore[];
  flags: string[];
}

export function studentProfile(student: Student, data: ClassData, cls: ClassProfile, period: Period, today: string): StudentProfile {
  const id = student.id;
  const att = data.attendance.filter((e) => e.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const events = data.behaviourEvents.filter((e) => e.studentId === id);
  const conduct = events.filter(isConductEvent);
  const visits = data.bathroomVisits.filter((v) => v.studentId === id).sort((a, b) => b.start.localeCompare(a.start));
  const secs = visits.map((v) => visitSeconds(v));

  const assessments = [...data.assessments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => {
      const m = data.marks.find((x) => x.assessmentId === a.id && x.studentId === id);
      const pct = m ? percentage(m, a) : null;
      const classMean = assessmentStats(a, data.marks).mean;
      return {
        assessment: a,
        mark: m?.mark ?? null,
        pct,
        symbol: symbolForPct(pct),
        classMean,
        diff: pct !== null && classMean !== null ? pct - classMean : null,
        comment: m?.comment ?? "",
      };
    });

  return {
    student,
    attendance: attendanceSummary(att),
    absentDates: att.filter((e) => e.status === "A").map((e) => e.date),
    lateDates: att.filter((e) => e.status === "L").map((e) => e.date),
    behaviour: {
      ...totals(conduct),
      byCode: countByCode(conduct, data.behaviourCodes),
      weekly: weeklyBehaviour(conduct, period, today),
      recent: [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15),
    },
    answers: cls.answerTallies.get(id) ?? EMPTY_ANSWER_TALLY,
    bathroom: { trips: visits.length, totalSeconds: secs.reduce((a, b) => a + b, 0), longestSeconds: Math.max(0, ...secs), visits },
    assessments,
    overall: cls.overalls.get(id) ?? null,
    rank: cls.ranks.get(id) ?? null,
    rankedOf: cls.overalls.size,
    topics: withClass(scoresBy("topic", id, data.assessmentQuestions, data.questionMarks), cls.topics),
    levels: withClass(scoresBy("cognitiveLevel", id, data.assessmentQuestions, data.questionMarks), cls.levels),
    flags: cls.atRisk.filter((f) => f.studentId === id).map((f) => f.reason),
  };
}

/** A few lines on how one student is doing, built from fixed rules. */
export function studentSummary(p: StudentProfile, cls: ClassProfile, period: Period): string[] {
  const when = periodPhrase(period);
  const lines: string[] = [];
  const name = p.student.firstName || "This student";

  // Behaviour.
  const b = p.behaviour;
  if (b.positive + b.negative === 0) {
    lines.push(`No behaviour entries ${when}.`);
  } else {
    const top = b.byCode[0];
    lines.push(
      `Behaviour ${when}: ${b.positive} positive, ${b.negative} negative (net ${fmtSigned(b.net)}; class median ${fmtSigned(cls.medianNet)}).` +
        (top && top.count >= 2 ? ` Most common: ${top.label} (${top.count}).` : ""),
    );
    const watched = cls.watch.find((w) => w.studentId === p.student.id);
    if (watched) lines.push(`One to watch: ${watched.detail}.`);
    else if (cls.stars.some((s) => s.studentId === p.student.id)) lines.push(`Among the most positive in the class ${when}.`);
  }

  // Questions.
  const a = p.answers;
  if (a.asked === 0) {
    lines.push(`Not picked to answer a question ${when}.`);
  } else {
    const rate = (a.answered / a.asked) * 100;
    const med = cls.answers.medianRate;
    let line = `Asked ${a.asked} time${a.asked === 1 ? "" : "s"}; answered ${a.answered} (${fmtPct(rate)})`;
    if (a.asked >= MIN_ASKED_FOR_RATE && med !== null) {
      const diff = rate - med * 100;
      line += Math.abs(diff) < 10 ? `, in line with the class (${fmtPct(med * 100)})` : `, ${diff > 0 ? "above" : "below"} the class median of ${fmtPct(med * 100)}`;
    }
    lines.push(`${line}.`);
  }

  // Bathroom.
  if (p.bathroom.trips > 0) {
    const often = p.bathroom.trips >= 3 && p.bathroom.trips >= 2 * cls.bathroom.avgTrips;
    lines.push(
      `${p.bathroom.trips} bathroom trip${p.bathroom.trips === 1 ? "" : "s"} (class average ${fmtNum(cls.bathroom.avgTrips, 1)}), ` +
        `${minutes(p.bathroom.totalSeconds)} out in total; longest ${formatDuration(p.bathroom.longestSeconds)}.` +
        (often ? ` That's well above the class.` : ""),
    );
  } else {
    lines.push(`No bathroom trips ${when}.`);
  }

  // Attendance.
  const att = p.attendance;
  if (att.total > 0 && att.rate !== null) {
    lines.push(
      `Attendance ${fmtPct(att.rate * 100)}` +
        (att.absent || att.late ? ` (${att.absent} absent, ${att.late} late).` : "."),
    );
  }

  // Marks.
  const marked = p.assessments.filter((r) => r.pct !== null);
  if (marked.length === 0) {
    lines.push(p.assessments.length ? `No marks entered for ${name} ${when}.` : `No assessments ${when}.`);
  } else {
    let line = `Average ${fmtPct(p.overall)} across ${marked.length} assessment${marked.length === 1 ? "" : "s"}`;
    if (p.overall !== null && cls.classAverage !== null) {
      const diff = p.overall - cls.classAverage;
      line +=
        Math.abs(diff) < 3
          ? `, in line with the class average (${fmtPct(cls.classAverage)})`
          : `, ${fmtNum(Math.abs(diff))} points ${diff > 0 ? "above" : "below"} the class average (${fmtPct(cls.classAverage)})`;
    }
    if (p.rank !== null) line += `; ranked ${p.rank} of ${p.rankedOf}`;
    lines.push(`${line}.`);
    const last = marked[marked.length - 1];
    const before = marked[marked.length - 2];
    lines.push(
      `Latest: ${last.assessment.title} ${fmtPct(last.pct)}` +
        (last.classMean !== null ? ` (class ${fmtPct(last.classMean)})` : "") +
        (before && before.pct !== null && Math.abs((last.pct as number) - before.pct) >= 5
          ? `, ${(last.pct as number) > before.pct ? "up" : "down"} from ${fmtPct(before.pct)}.`
          : "."),
    );
  }
  const topics = topicLine(p.topics);
  if (topics) lines.push(topics);
  for (const f of p.flags) lines.push(`⚠ ${f}.`);
  return lines;
}

// ---------- the parent report ----------

/** The parts of a parent report that can be switched on and off. */
export type ReportSection = "marks" | "topics" | "behaviour" | "attendance";

export const REPORT_SECTIONS: Array<{ id: ReportSection; label: string }> = [
  { id: "marks", label: "Marks" },
  { id: "topics", label: "Topic strengths" },
  { id: "behaviour", label: "Behaviour & class questions" },
  { id: "attendance", label: "Attendance & bathroom" },
];

const tally = (counts: CodeCount[]) => counts.map((c) => `${c.label} (${c.count})`).join(", ");

/**
 * The summary for parents: the same facts as the dashboard, worded for home.
 * No class rank, no medians and no "one to watch"; behaviour is put as what's
 * going well and what to work on. Class averages stay, for context.
 */
export function parentSummary(p: StudentProfile, cls: ClassProfile, sections: Set<ReportSection>): string[] {
  const lines: string[] = [];
  const name = p.student.firstName || "Your child";

  if (sections.has("marks")) {
    const marked = p.assessments.filter((r) => r.pct !== null);
    if (marked.length === 0) {
      lines.push(p.assessments.length ? `No marks have been entered for ${name} in this period yet.` : "No assessments were written in this period.");
    } else {
      lines.push(
        `Average ${fmtPct(p.overall)} across ${marked.length} assessment${marked.length === 1 ? "" : "s"}` +
          (cls.classAverage !== null ? ` (class average ${fmtPct(cls.classAverage)}).` : "."),
      );
      const last = marked[marked.length - 1];
      const before = marked[marked.length - 2];
      const moved = before && before.pct !== null && Math.abs((last.pct as number) - before.pct) >= 5;
      lines.push(
        `Latest: ${last.assessment.title} ${fmtPct(last.pct)}` +
          (moved ? `, ${(last.pct as number) > (before.pct as number) ? "up" : "down"} from ${fmtPct(before.pct)}.` : "."),
      );
    }
  }

  if (sections.has("topics")) {
    const topics = topicLine(p.topics, "a topic to focus on");
    if (topics) lines.push(topics);
  }

  if (sections.has("behaviour")) {
    const good = p.behaviour.byCode.filter((c) => c.kind === "positive");
    const work = p.behaviour.byCode.filter((c) => c.kind === "negative");
    if (good.length) lines.push(`Going well: ${tally(good)}.`);
    lines.push(work.length ? `${work.length === 1 ? "Area" : "Areas"} to work on: ${tally(work)}.` : "No concerns about behaviour in this period.");
    const a = p.answers;
    if (a.asked > 0) lines.push(`Answered ${a.answered} of ${a.asked} question${a.asked === 1 ? "" : "s"} when asked in class.`);
  }

  if (sections.has("attendance")) {
    const att = p.attendance;
    if (att.total > 0 && att.rate !== null) {
      const parts = [
        att.absent ? `${att.absent} absence${att.absent === 1 ? "" : "s"}` : "",
        att.late ? `${att.late} late arrival${att.late === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      lines.push(`Attendance ${fmtPct(att.rate * 100)}${parts.length ? ` (${parts.join(", ")})` : ""}.`);
    }
    if (p.bathroom.trips > 0) {
      lines.push(
        `${p.bathroom.trips} bathroom trip${p.bathroom.trips === 1 ? "" : "s"} during lessons (${minutes(p.bathroom.totalSeconds)} in total).`,
      );
    }
  }
  return lines;
}
