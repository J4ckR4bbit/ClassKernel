// Turns everything the app has collected into spreadsheet sheets.
//
// Loading is split from building on purpose: the Export screen loads each
// selected class once, then rebuilds the sheet list on every checkbox/date
// change to show live row counts, and finally hands the same sheets to the
// .xlsx writer. Every sheet carries a Class column so several classes can be
// exported into one workbook and pivoted afterwards.

import * as repo from "./repo";
import { deskSitCounts, pairInsights, studentDeskStats } from "./lessons";
import { GRADE_SCALES, assessmentStats, attendanceByStudent, behaviourByStudent, formatDuration, gradeForPct, percentage, visitSeconds } from "./stats";
import { SheetSpec } from "./xlsx";
import { dateInZone, timeInZone } from "./time";
import {
  Assessment,
  AssessmentQuestion,
  AttendanceEntry,
  AttendanceStatus,
  BathroomVisit,
  BehaviourCode,
  BehaviourEvent,
  ClassInfo,
  Desk,
  GradeScale,
  LessonRecord,
  Mark,
  QuestionMark,
  SeatAssignment,
  Student,
  studentName,
} from "./types";

export type ExportSection =
  | "overview"
  | "students"
  | "attendance"
  | "attendanceSummary"
  | "behaviour"
  | "behaviourSummary"
  | "bathroom"
  | "assessments"
  | "marks"
  | "questionMarks"
  | "topicPerformance"
  | "seating"
  | "lessons"
  | "insights";

export interface SectionInfo {
  id: ExportSection;
  label: string;
  description: string;
  /** Names of the sheets this section produces (checked by the unit tests). */
  sheetNames: string[];
  /** Whether the section is ticked when the Export screen first opens. */
  defaultOn: boolean;
}

/** The menu of exportable datasets, in the order they appear as sheets. */
export const EXPORT_SECTIONS: SectionInfo[] = [
  { id: "overview", label: "Class overview", description: "One row per class: roll, attendance rate, behaviour points, mean mark", sheetNames: ["Overview"], defaultOn: true },
  { id: "students", label: "Students", description: "Roster with gender, flags and notes", sheetNames: ["Students"], defaultOn: true },
  { id: "attendance", label: "Attendance log", description: "Every register mark, one row per student per date", sheetNames: ["Attendance"], defaultOn: true },
  { id: "attendanceSummary", label: "Attendance summary", description: "Per student: present / absent / late / excused and rate", sheetNames: ["Attendance summary"], defaultOn: true },
  { id: "behaviour", label: "Behaviour log", description: "Every logged behaviour event with its points", sheetNames: ["Behaviour log"], defaultOn: true },
  { id: "behaviourSummary", label: "Behaviour summary", description: "Per student: positives, negatives and net points", sheetNames: ["Behaviour summary"], defaultOn: true },
  { id: "bathroom", label: "Bathroom log", description: "Every timed bathroom trip: when they left, came back and for how long", sheetNames: ["Bathroom log"], defaultOn: true },
  { id: "assessments", label: "Assessments", description: "Each test with mean, median, range and spread", sheetNames: ["Assessments"], defaultOn: true },
  { id: "marks", label: "Marks", description: "Per student per assessment: mark, percentage and level or symbol", sheetNames: ["Marks"], defaultOn: true },
  { id: "questionMarks", label: "Question marks", description: "Per question marks with topic and cognitive level (large)", sheetNames: ["Question marks"], defaultOn: false },
  { id: "topicPerformance", label: "Topic performance", description: "Per student per topic: marks gained out of marks available", sheetNames: ["Topic performance"], defaultOn: true },
  { id: "seating", label: "Seating plans", description: "Saved plans: which student sits at which desk seat", sheetNames: ["Seating plans"], defaultOn: false },
  { id: "lessons", label: "Lesson history", description: "Per lesson: where each student sat and how they behaved", sheetNames: ["Lesson history"], defaultOn: false },
  { id: "insights", label: "Seating insights", description: "Desk-by-desk behaviour per student, and pairings that turn disruptive", sheetNames: ["Desk insights", "Pair insights"], defaultOn: false },
];

export const DEFAULT_SECTIONS: ExportSection[] = EXPORT_SECTIONS.filter((s) => s.defaultOn).map((s) => s.id);

export interface ExportOptions {
  sections: ExportSection[];
  /** Inclusive YYYY-MM-DD bounds on dated data. Empty = unbounded. */
  from?: string;
  to?: string;
  /** Marks as SA levels (7–1, the default) or symbols (A–F). */
  gradeScale?: GradeScale;
  /** Shown on the "Export info" sheet. */
  dataDir?: string;
  generatedAt?: Date;
}

/** Everything collected for one class, loaded once and reused for every sheet. */
export interface ClassBundle {
  info: ClassInfo;
  students: Student[];
  attendance: AttendanceEntry[];
  behaviour: BehaviourEvent[];
  bathroom: BathroomVisit[];
  assessments: Assessment[];
  marks: Mark[];
  questions: AssessmentQuestion[];
  questionMarks: QuestionMark[];
  seating: SeatAssignment[];
  desks: Desk[];
  lessons: LessonRecord[];
}

export interface ExportData {
  bundles: ClassBundle[];
  behaviourCodes: BehaviourCode[];
}

/** Load every class the user ticked, plus the app-wide behaviour catalog. */
export async function loadExportData(dataDir: string, classNames: string[]): Promise<ExportData> {
  const known = await repo.listClasses(dataDir);
  const behaviourCodes = await repo.loadBehaviourCodes(dataDir);
  const bundles: ClassBundle[] = [];
  for (const name of classNames) {
    const info = known.find((c) => c.name === name) ?? {
      name,
      year: "",
      subject: "",
      room: "",
      notes: "",
      archived: false,
      color: "",
    };
    const [students, attendance, behaviour, bathroom, assessments, marks, questions, questionMarks, seating, desks, lessons] =
      await Promise.all([
        repo.loadStudents(dataDir, name),
        repo.loadAttendance(dataDir, name),
        repo.loadBehaviourEvents(dataDir, name),
        repo.loadBathroomVisits(dataDir, name),
        repo.loadAssessments(dataDir, name),
        repo.loadMarks(dataDir, name),
        repo.loadAssessmentQuestions(dataDir, name),
        repo.loadQuestionMarks(dataDir, name),
        repo.loadSeating(dataDir, name),
        repo.loadDesks(dataDir, name),
        repo.loadLessons(dataDir, name),
      ]);
    bundles.push({ info, students, attendance, behaviour, bathroom, assessments, marks, questions, questionMarks, seating, desks, lessons });
  }
  return { bundles, behaviourCodes };
}

// ---------- small helpers ----------

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  P: "Present",
  A: "Absent",
  L: "Late",
  E: "Excused",
};

const round1 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;

const round2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;

/** Inclusive YYYY-MM-DD range test; blank bounds mean "no limit". A full
 * timestamp is dated in the teacher's zone, like everywhere else. */
function inRange(date: string, from?: string, to?: string): boolean {
  if (!date) return true;
  const d = date.length > 10 ? dateInZone(date) || date.slice(0, 10) : date;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function nameLookup(students: Student[]): (id: string) => string {
  const byId = new Map(students.map((s) => [s.id, studentName(s)]));
  return (id) => byId.get(id) ?? id;
}

/** Apply the date filter to a bundle so every sheet sees the same window. */
function windowed(bundle: ClassBundle, from?: string, to?: string): ClassBundle {
  const assessments = bundle.assessments.filter((a) => inRange(a.date, from, to));
  const ids = new Set(assessments.map((a) => a.id));
  return {
    ...bundle,
    attendance: bundle.attendance.filter((e) => inRange(e.date, from, to)),
    behaviour: bundle.behaviour.filter((e) => inRange(e.timestamp, from, to)),
    bathroom: bundle.bathroom.filter((v) => inRange(v.date, from, to)),
    lessons: bundle.lessons.filter((l) => inRange(l.date, from, to)),
    assessments,
    marks: bundle.marks.filter((m) => ids.has(m.assessmentId)),
    questions: bundle.questions.filter((q) => ids.has(q.assessmentId)),
    questionMarks: bundle.questionMarks.filter((m) => ids.has(m.assessmentId)),
  };
}

/** Mean percentage across every entered mark in the class. */
function classMeanPercent(bundle: ClassBundle): number | null {
  const byId = new Map(bundle.assessments.map((a) => [a.id, a]));
  const pcts: number[] = [];
  for (const m of bundle.marks) {
    const a = byId.get(m.assessmentId);
    if (!a) continue;
    const pct = percentage(m, a);
    if (pct !== null) pcts.push(pct);
  }
  return pcts.length ? pcts.reduce((x, y) => x + y, 0) / pcts.length : null;
}

// ---------- sheet builders ----------

type Builder = (bundles: ClassBundle[], data: ExportData, options: ExportOptions) => SheetSpec[];

const overviewSheet: Builder = (bundles) => [
  {
    name: "Overview",
    columns: [
      "Class",
      "Grade",
      "Subject",
      "Room",
      "Archived",
      "Students",
      "Register marks",
      "Attendance %",
      "Behaviour events",
      "Net behaviour points",
      "Assessments",
      "Mean mark %",
      "Lessons recorded",
    ],
    rows: bundles.map((b) => {
      const att = attendanceByStudent(b.attendance);
      const rates = [...att.values()].map((s) => s.rate).filter((r): r is number => r !== null);
      const points = b.behaviour.reduce((n, e) => n + e.points, 0);
      return [
        b.info.name,
        b.info.year,
        b.info.subject,
        b.info.room,
        b.info.archived ? "Yes" : "No",
        b.students.length,
        b.attendance.length,
        rates.length ? round1((rates.reduce((x, y) => x + y, 0) / rates.length) * 100) : null,
        b.behaviour.length,
        points,
        b.assessments.length,
        round1(classMeanPercent(b)),
        new Set(b.lessons.map((l) => l.sessionId)).size,
      ];
    }),
  },
];

const studentsSheet: Builder = (bundles) => [
  {
    name: "Students",
    columns: ["Class", "Student ID", "Adam number", "First name", "Surname", "Full name", "Gender", "Flags", "Notes"],
    rows: bundles.flatMap((b) =>
      b.students.map((s) => [b.info.name, s.id, s.adamNo, s.firstName, s.lastName, studentName(s), s.gender, s.flags, s.notes]),
    ),
  },
];

const attendanceSheet: Builder = (bundles) => [
  {
    name: "Attendance",
    columns: ["Class", "Date", "Student ID", "Student", "Status", "Status label", "Note"],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      return [...b.attendance]
        .sort((x, y) => x.date.localeCompare(y.date) || nameOf(x.studentId).localeCompare(nameOf(y.studentId)))
        .map((e) => [b.info.name, e.date, e.studentId, nameOf(e.studentId), e.status, STATUS_LABELS[e.status], e.note]);
    }),
  },
];

const attendanceSummarySheet: Builder = (bundles) => [
  {
    name: "Attendance summary",
    columns: ["Class", "Student ID", "Student", "Sessions", "Present", "Absent", "Late", "Excused", "Attendance %"],
    rows: bundles.flatMap((b) => {
      const byStudent = attendanceByStudent(b.attendance);
      return b.students.map((s) => {
        const sum = byStudent.get(s.id);
        return [
          b.info.name,
          s.id,
          studentName(s),
          sum?.total ?? 0,
          sum?.present ?? 0,
          sum?.absent ?? 0,
          sum?.late ?? 0,
          sum?.excused ?? 0,
          sum?.rate != null ? round1(sum.rate * 100) : null,
        ];
      });
    }),
  },
];

const behaviourSheet: Builder = (bundles, data) => {
  const codeById = new Map(data.behaviourCodes.map((c) => [c.code, c]));
  return [
    {
      name: "Behaviour log",
      columns: ["Class", "Date", "Time", "Student ID", "Student", "Code", "Behaviour", "Type", "Points", "Note"],
      rows: bundles.flatMap((b) => {
        const nameOf = nameLookup(b.students);
        return [...b.behaviour]
          .sort((x, y) => x.timestamp.localeCompare(y.timestamp))
          .map((e) => {
            const code = codeById.get(e.code);
            return [
              b.info.name,
              dateInZone(e.timestamp),
              timeInZone(e.timestamp),
              e.studentId,
              nameOf(e.studentId),
              e.code,
              code?.label ?? e.code,
              code?.kind ?? (e.points < 0 ? "negative" : "positive"),
              e.points,
              e.note,
            ];
          });
      }),
    },
  ];
};

const behaviourSummarySheet: Builder = (bundles) => [
  {
    name: "Behaviour summary",
    columns: ["Class", "Student ID", "Student", "Positive events", "Negative events", "Net points"],
    rows: bundles.flatMap((b) => {
      const byStudent = behaviourByStudent(b.behaviour);
      return b.students.map((s) => {
        const sum = byStudent.get(s.id);
        return [b.info.name, s.id, studentName(s), sum?.positive ?? 0, sum?.negative ?? 0, sum?.points ?? 0];
      });
    }),
  },
];

const bathroomSheet: Builder = (bundles) => [
  {
    name: "Bathroom log",
    columns: ["Class", "Date", "Student ID", "Student", "Out", "Back", "Duration", "Seconds"],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      return [...b.bathroom]
        .sort((x, y) => x.start.localeCompare(y.start))
        .map((v) => [
          b.info.name,
          v.date,
          v.studentId,
          nameOf(v.studentId),
          timeInZone(v.start),
          v.end ? timeInZone(v.end) : "",
          v.end ? formatDuration(visitSeconds(v)) : "still out",
          v.end ? visitSeconds(v) : null,
        ]);
    }),
  },
];

const assessmentsSheet: Builder = (bundles) => [
  {
    name: "Assessments",
    columns: [
      "Class",
      "Assessment ID",
      "Title",
      "Date",
      "Category",
      "Counts as",
      "Weight",
      "Content area",
      "Out of",
      "Questions",
      "Marks entered",
      "Mean %",
      "Median %",
      "Lowest %",
      "Highest %",
      "Std dev",
    ],
    rows: bundles.flatMap((b) =>
      [...b.assessments]
        .sort((x, y) => x.date.localeCompare(y.date))
        .map((a) => {
          const st = assessmentStats(a, b.marks);
          return [
            b.info.name,
            a.id,
            a.title,
            a.date,
            a.category,
            a.kind === "exam" ? "Examination" : "Informal",
            a.weight,
            a.contentArea,
            a.totalMarks,
            a.questionCount,
            st.entered,
            round1(st.mean),
            round1(st.median),
            round1(st.min),
            round1(st.max),
            round1(st.stdev),
          ];
        }),
    ),
  },
];

const marksSheet: Builder = (bundles, _data, options) => [
  {
    name: "Marks",
    columns: ["Class", "Assessment", "Date", "Category", "Student ID", "Adam number", "Student", "Mark", "Out of", "Percent", GRADE_SCALES[options.gradeScale ?? "level"].label, "Comment"],
    rows: bundles.flatMap((b) => {
      const rows: (string | number | null)[][] = [];
      for (const a of [...b.assessments].sort((x, y) => x.date.localeCompare(y.date))) {
        for (const s of b.students) {
          const mark = b.marks.find((m) => m.assessmentId === a.id && m.studentId === s.id);
          const pct = mark ? percentage(mark, a) : null;
          rows.push([
            b.info.name,
            a.title,
            a.date,
            a.category,
            s.id,
            s.adamNo,
            studentName(s),
            mark?.mark ?? null,
            a.totalMarks,
            round1(pct),
            gradeForPct(pct, options.gradeScale ?? "level"),
            mark?.comment ?? "",
          ]);
        }
      }
      return rows;
    }),
  },
];

const questionMarksSheet: Builder = (bundles) => [
  {
    name: "Question marks",
    columns: [
      "Class",
      "Assessment",
      "Date",
      "Question",
      "Topic",
      "Cognitive level",
      "Out of",
      "Student ID",
      "Student",
      "Mark",
      "Percent",
    ],
    rows: bundles.flatMap((b) => {
      const byId = new Map(b.assessments.map((a) => [a.id, a]));
      const rows: (string | number | null)[][] = [];
      for (const q of [...b.questions].sort(
        (x, y) => x.assessmentId.localeCompare(y.assessmentId) || x.number - y.number,
      )) {
        const a = byId.get(q.assessmentId);
        if (!a) continue;
        for (const s of b.students) {
          const qm = b.questionMarks.find(
            (m) => m.assessmentId === q.assessmentId && m.studentId === s.id && m.number === q.number,
          );
          if (!qm || qm.mark === null) continue;
          rows.push([
            b.info.name,
            a.title,
            a.date,
            q.number,
            q.topic,
            q.cognitiveLevel,
            q.marks,
            s.id,
            studentName(s),
            qm.mark,
            q.marks > 0 ? round1((qm.mark / q.marks) * 100) : null,
          ]);
        }
      }
      return rows;
    }),
  },
];

const topicPerformanceSheet: Builder = (bundles) => [
  {
    name: "Topic performance",
    columns: ["Class", "Student ID", "Student", "Topic", "Questions answered", "Marks", "Out of", "Percent"],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      // studentId -> topic -> running totals over every marked question.
      const agg = new Map<string, Map<string, { got: number; outOf: number; answered: number }>>();
      const questionKey = new Map(b.questions.map((q) => [`${q.assessmentId}|${q.number}`, q]));
      for (const qm of b.questionMarks) {
        if (qm.mark === null) continue;
        const q = questionKey.get(`${qm.assessmentId}|${qm.number}`);
        if (!q || !q.topic) continue;
        const byTopic = agg.get(qm.studentId) ?? new Map();
        const cur = byTopic.get(q.topic) ?? { got: 0, outOf: 0, answered: 0 };
        cur.got += qm.mark;
        cur.outOf += q.marks;
        cur.answered += 1;
        byTopic.set(q.topic, cur);
        agg.set(qm.studentId, byTopic);
      }
      const rows: (string | number | null)[][] = [];
      for (const [studentId, byTopic] of agg) {
        for (const [topic, t] of [...byTopic].sort((x, y) => x[0].localeCompare(y[0]))) {
          rows.push([
            b.info.name,
            studentId,
            nameOf(studentId),
            topic,
            t.answered,
            t.got,
            t.outOf,
            t.outOf > 0 ? round1((t.got / t.outOf) * 100) : null,
          ]);
        }
      }
      return rows.sort((x, y) => String(x[2]).localeCompare(String(y[2])));
    }),
  },
];

const seatingSheet: Builder = (bundles) => [
  {
    name: "Seating plans",
    columns: ["Class", "Plan", "Desk", "Desk label", "Seat", "Student ID", "Student"],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      const deskLabel = new Map(b.desks.map((d) => [d.id, d.label]));
      return b.seating
        .filter((s) => s.studentId)
        .map((s) => [
          b.info.name,
          s.planName,
          s.deskId,
          deskLabel.get(s.deskId) ?? "",
          s.seatIndex + 1,
          s.studentId,
          nameOf(s.studentId),
        ]);
    }),
  },
];

const lessonsSheet: Builder = (bundles) => [
  {
    name: "Lesson history",
    columns: [
      "Class",
      "Session",
      "Date",
      "Student ID",
      "Student",
      "Desk",
      "Seatmates",
      "Points",
      "Positives",
      "Negatives",
    ],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      return [...b.lessons]
        .sort((x, y) => x.date.localeCompare(y.date) || x.sessionId.localeCompare(y.sessionId))
        .map((l) => [
          b.info.name,
          l.sessionId,
          l.date,
          l.studentId,
          nameOf(l.studentId),
          l.deskLabel || l.deskId,
          l.seatmates
            .split(";")
            .filter(Boolean)
            .map(nameOf)
            .join(", "),
          l.points,
          l.positives,
          l.negatives,
        ]);
    }),
  },
];

const insightsSheets: Builder = (bundles) => [
  {
    name: "Desk insights",
    columns: ["Class", "Student ID", "Student", "Desk", "Lessons sat there", "Total points", "Average points"],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      const sat = deskSitCounts(b.lessons);
      const rows: (string | number | null)[][] = [];
      for (const studentId of sat.keys()) {
        for (const stat of studentDeskStats(b.lessons, studentId)) {
          rows.push([
            b.info.name,
            studentId,
            nameOf(studentId),
            stat.deskLabel,
            stat.sessions,
            stat.totalPoints,
            round2(stat.avgPoints),
          ]);
        }
      }
      return rows.sort((x, y) => String(x[2]).localeCompare(String(y[2])));
    }),
  },
  {
    name: "Pair insights",
    columns: [
      "Class",
      "Student A",
      "Student B",
      "Lessons together",
      "Average together",
      "Average overall",
      "Difference",
      "Worse together",
    ],
    rows: bundles.flatMap((b) => {
      const nameOf = nameLookup(b.students);
      return pairInsights(b.lessons).map((p) => [
        b.info.name,
        nameOf(p.a),
        nameOf(p.b),
        p.sessions,
        round2(p.avgTogether),
        round2(p.avgOverall),
        round2(p.delta),
        p.sessions >= 2 && p.delta <= -0.75 ? "Yes" : "No",
      ]);
    }),
  },
];

const BUILDERS: Record<ExportSection, Builder> = {
  overview: overviewSheet,
  students: studentsSheet,
  attendance: attendanceSheet,
  attendanceSummary: attendanceSummarySheet,
  behaviour: behaviourSheet,
  behaviourSummary: behaviourSummarySheet,
  bathroom: bathroomSheet,
  assessments: assessmentsSheet,
  marks: marksSheet,
  questionMarks: questionMarksSheet,
  topicPerformance: topicPerformanceSheet,
  seating: seatingSheet,
  lessons: lessonsSheet,
  insights: insightsSheets,
};

/** A short key/value sheet recording what this workbook is and where it came from. */
function infoSheet(bundles: ClassBundle[], options: ExportOptions, at: Date): SheetSpec {
  const chosen = EXPORT_SECTIONS.filter((s) => options.sections.includes(s.id)).map((s) => s.label);
  return {
    name: "Export info",
    columns: ["Item", "Value"],
    rows: [
      ["Exported by", "ClassKernel"],
      ["Generated", at.toISOString().slice(0, 16).replace("T", " ")],
      ["Data folder", options.dataDir ?? ""],
      ["Classes", bundles.map((b) => b.info.name).join(", ")],
      ["Date range", options.from || options.to ? `${options.from || "start"} to ${options.to || "today"}` : "All dates"],
      ["Sheets included", chosen.join(", ")],
    ],
  };
}

/**
 * Build the sheets for the current selection. Pure and synchronous so the
 * Export screen can call it on every keystroke to preview row counts.
 */
export function buildSheets(data: ExportData, options: ExportOptions): SheetSpec[] {
  const at = options.generatedAt ?? new Date();
  const bundles = data.bundles.map((b) => windowed(b, options.from, options.to));
  const sheets: SheetSpec[] = [infoSheet(bundles, options, at)];
  for (const section of EXPORT_SECTIONS) {
    if (!options.sections.includes(section.id)) continue;
    sheets.push(...BUILDERS[section.id](bundles, data, options));
  }
  return sheets;
}

/** File name for a workbook, e.g. ClassKernel-7B-Science-2026-07-24.xlsx */
export function exportFileName(classNames: string[], at: Date = new Date()): string {
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  const scope =
    classNames.length === 1 ? classNames[0].replace(/[^\w-]+/g, "-") : `${classNames.length || 0}-classes`;
  return `ClassKernel-${scope}-${stamp}.xlsx`;
}
