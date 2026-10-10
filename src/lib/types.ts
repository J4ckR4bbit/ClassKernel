// Core domain types. Every entity maps 1:1 onto a row of a plain CSV file
// (see repo.ts for the file layout) so data stays portable and Excel-friendly.

import { BC } from "./behaviourColours";

export interface ClassInfo {
  /** Folder name under classes/ — also the display identifier. */
  name: string;
  /** The class's grade (shown as "Grade"; saved as `year:` in class.md). */
  year: string;
  subject: string;
  room: string;
  /** Free-form markdown body of class.md (below the front matter). */
  notes: string;
  archived: boolean;
  /** Colour-coding for the class (a BEHAVIOUR_COLOURS shade); "" = none. */
  color: string;
}

export interface Student {
  /** ClassKernel's own id (s-xxxxxxxx), made when the student is added; never changes. */
  id: string;
  firstName: string;
  lastName: string;
  /**
   * The school's number for the student in Adam, its administration system,
   * which links to the school database; "" until filled in. Imports match on it.
   */
  adamNo: string;
  gender: string; // free text: "M", "F", other, or empty
  flags: string; // semicolon-separated tags e.g. "SEN;Medical"
  notes: string;
}

/**
 * An Adam number as compared on import: spaces dropped, case ignored, and an
 * all-digit number without its leading zeros ("00123" and "123" match, as
 * Excel may have turned one into the other). "" when there is none.
 */
export function adamKey(adamNo: string): string {
  const s = adamNo.replace(/\s+/g, "").toLowerCase();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s;
}

export type AttendanceStatus = "P" | "A" | "L" | "E";

export interface AttendanceEntry {
  date: string; // YYYY-MM-DD
  studentId: string;
  status: AttendanceStatus;
  note: string;
}

export interface BehaviourCode {
  code: string;
  label: string;
  kind: "positive" | "negative";
  points: number;
  color: string;
}

export interface BehaviourEvent {
  timestamp: string; // ISO 8601
  studentId: string;
  code: string;
  points: number;
  note: string;
}

/**
 * One bathroom trip, started from the live-lesson seat popover. A row with an
 * empty `end` is a trip still running (the student is out right now), which
 * also means an unfinished timer survives view switches and app restarts.
 */
export interface BathroomVisit {
  date: string; // YYYY-MM-DD
  studentId: string;
  start: string; // ISO 8601
  end: string; // ISO 8601; "" while the student is still out
}

export type DeskShape =
  | "single" // 1 seat
  | "double" // 2 seats
  | "group4" // 4 seats
  | "group6" // 6 seats
  | "teacher" // 0 seats
  | "door" // 0 seats, room marker
  | "window" // 0 seats, room marker
  | "label"; // 0 seats, free text box for labelling anything in the room

export interface Desk {
  id: string;
  label: string;
  shape: DeskShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number; // degrees, multiples of 90
  /** Optional custom fill colour (hex); empty string = default for the shape. */
  color: string;
  /** Optional colour (hex) for the desk's own label text; "" = default. */
  textColor: string;
  /**
   * The table's colour in the teaching strip (hex), set there and kept apart
   * from the room-plan fill; "" = the next pastel in turn.
   */
  stripColor: string;
}

export type FrontEdge = "top" | "right" | "bottom" | "left";

export interface RoomConfig {
  /** Which edge of the canvas is the front of the room (whiteboard). */
  frontEdge: FrontEdge;
  /** Optional view crop: seating/lesson/print views show only this region, scaled up. */
  crop: { x: number; y: number; w: number; h: number } | null;
  /** Multiplier applied to the name text on seats (1 = default). */
  seatFontScale: number;
  /** Multiplier applied to desk labels (1 = default). */
  deskFontScale: number;
  /** Multiplier applied to label-box text (1 = default). */
  labelFontScale: number;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  frontEdge: "top",
  crop: null,
  seatFontScale: 1,
  deskFontScale: 1,
  labelFontScale: 1,
};

export interface SeatAssignment {
  planName: string;
  deskId: string;
  seatIndex: number;
  studentId: string;
}

/**
 * Per-class random-seating configuration. Lives in Settings (out of sight of
 * the class) so the "Randomise" button on the seating plan can reroll without
 * ever exposing the constraints to students.
 */
export interface SeatingPrefs {
  /** Pairs of student ids that must NOT sit next to each other. */
  apartPairs: Array<[string, string]>;
  /** Pairs of student ids that must share a desk. */
  togetherPairs: Array<[string, string]>;
  /** Students that must sit in the front band of the room. */
  frontIds: string[];
}

export const DEFAULT_SEATING_PREFS: SeatingPrefs = {
  apartPairs: [],
  togetherPairs: [],
  frontIds: [],
};

/**
 * One row per student per ended lesson: where they sat and how they behaved.
 * Accumulated by "End lesson" so seating can be analysed over time (which desk
 * a student behaves best at, which pairings turn disruptive, and so on).
 */
export interface LessonRecord {
  /** Groups every row saved by a single "End lesson" action. */
  sessionId: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO 8601 of when the lesson was ended
  studentId: string;
  deskId: string;
  /** The desk's label (or a fallback) — the human identifier used for tracking. */
  deskLabel: string;
  /** Semicolon-separated ids of the other students sharing that desk. */
  seatmates: string;
  points: number;
  positives: number;
  negatives: number;
}

export interface Assessment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  totalMarks: number;
  category: string;
  /** How many questions the test breaks into. 1 = a single overall mark. */
  questionCount: number;
  /** Content area the whole test sits in (e.g. "Chemistry"). "" = mixed/none. */
  contentArea: string;
  /** Which side of the weighted mark it counts towards (see stats.weightedMark). */
  kind: AssessmentKind;
  /** Its weight within its side: 1 = normal, 2 = counts double, 0 = doesn't count. */
  weight: number;
}

/** Informal tasks (tests, practicals, projects…) or examinations. */
export type AssessmentKind = "informal" | "exam";

/** Examination when the category says so (Exam, Examination, June exam…), else informal: the default for a new or older assessment. */
export function defaultKind(category: string): AssessmentKind {
  return /\bexam(s|inations?)?\b/i.test(category) ? "exam" : "informal";
}

export interface Mark {
  assessmentId: string;
  studentId: string;
  mark: number | null; // null = not entered / absent
  comment: string;
}

/**
 * One question within a multi-question assessment. Questions are numbered from
 * 1; a student's total for the assessment is the sum of their per-question
 * marks (mirrored into marks.csv so the dashboard keeps working unchanged).
 */
export interface AssessmentQuestion {
  assessmentId: string;
  number: number; // 1-based
  /** Subtopic name from the topic bank (or free text). */
  topic: string;
  marks: number; // out of
  /** Cognitive-level code, e.g. "L1" (see CognitiveLevel). */
  cognitiveLevel: string;
}

/** A single student's mark on a single question. null = not entered / absent. */
export interface QuestionMark {
  assessmentId: string;
  studentId: string;
  number: number; // question number
  mark: number | null;
}

/**
 * One assessable subtopic in the app-wide topic bank, keyed by grade. Content
 * areas (e.g. Chemistry) group subtopics (e.g. Acids & Bases). An area with no
 * subtopics yet is represented by a row with an empty `subtopic`.
 */
export interface TopicEntry {
  grade: string; // matches ClassInfo.year
  area: string; // content area, e.g. "Chemistry"
  subtopic: string; // "" = area placeholder (no subtopics yet)
  /** Optional short label shown in the marking grid, e.g. "pJWEP". */
  short: string;
}

/** Default content areas used to scaffold a grade the first time it's edited. */
export const DEFAULT_TOPIC_AREAS = ["Chemistry", "Physics", "Science Skills"];

/** A cognitive level a question can be tagged with (app-wide, editable). */
export interface CognitiveLevel {
  code: string;
  label: string;
}

export const DEFAULT_COGNITIVE_LEVELS: CognitiveLevel[] = [
  { code: "L1", label: "Recall" },
  { code: "L2", label: "Comprehension" },
  { code: "L3", label: "Analysis / Application" },
  { code: "L4", label: "Evaluation / Synthesis" },
];

/** How the running countdown is drawn. */
export type TimerDisplay = "circle" | "hourglass" | "flip";

/**
 * A reusable timer configuration (timer_presets.csv, app-wide). A test is run
 * as an optional reading phase followed by a writing phase; either can be 0.
 */
export interface TimerPreset {
  name: string;
  readingMinutes: number;
  writingMinutes: number;
  display: TimerDisplay;
  /** Play a chime at phase changes and when time is up. */
  chime: boolean;
}

export const DEFAULT_TIMER_PRESETS: TimerPreset[] = [
  { name: "Essay (10 read · 40 write)", readingMinutes: 10, writingMinutes: 40, display: "circle", chime: true },
  { name: "Comprehension (5 read · 25 write)", readingMinutes: 5, writingMinutes: 25, display: "hourglass", chime: true },
];

/** How student names are shown on seat tiles on class-facing screens. */
export type SeatNameStyle = "full" | "firstInitial" | "first";

/** Which edge of the teaching-mode screen the lesson buttons sit on. */
export type LessonBarSide = "top" | "right" | "bottom" | "left";

export const LESSON_BAR_SIDES: LessonBarSide[] = ["top", "right", "bottom", "left"];

/**
 * Which teaching mode opens by default: the drawn room plan, full screen, or
 * the narrow strip of tables docked to the edge of the screen beside slides.
 */
export type TeachingStyle = "room" | "strip";

/** Which screen edge the teaching strip docks to. */
export type DockSide = "left" | "right";

/** App-wide user preferences (settings.csv). */
/** "level" = the SA achievement level 7–1; "symbol" = a letter A–F. */
export type GradeScale = "level" | "symbol";

export interface UserPrefs {
  /** In the marking grid, which direction Enter moves. Tab does the opposite. */
  markGridEnter: "across" | "down";
  /**
   * Treat the screen as visible to the whole class: cover marks/analysis views
   * until explicitly revealed, keep flags/notes out of the lesson popover and
   * student names out of toasts. On by default; the granular prefs below let a
   * teacher selectively re-show individual pieces without turning this off.
   */
  privacyMode: boolean;
  seatNameStyle: SeatNameStyle;
  /** Show each student's running behaviour points on their seat tile. */
  showSeatPoints: boolean;
  /** Show the student's flags (e.g. SEN/Medical) in the lesson seat popover. */
  popoverShowFlags: boolean;
  /** Show the student's notes in the lesson seat popover. */
  popoverShowNotes: boolean;
  /** Whole-app display scale for large touch panels (1–2). */
  uiScale: number;
  /** Where the lesson buttons sit around the seating plan in teaching mode. */
  lessonBarSide: LessonBarSide;
  /**
   * Ids of the bundled plugins the teacher has switched on (see
   * src/plugins/registry.ts). Everything ships off, so the app stays as it was
   * until a tool is deliberately turned on in Settings.
   */
  enabledPlugins: string[];
  /** Which teaching mode the Teaching mode button opens. */
  teachingStyle: TeachingStyle;
  /** Which screen edge the teaching strip docks to. */
  dockSide: DockSide;
  /**
   * SHA-256 of the PIN that unlocks a second seat assignment in one lesson
   * (see src/lib/pin.ts). "" = no PIN set yet.
   */
  reseatPinHash: string;
  /**
   * IANA time zone (e.g. "Africa/Johannesburg") that dates and times are shown
   * and exported in. "" = the device's own zone. Storage is always UTC.
   */
  timeZone: string;
  /** How a percentage is shown as a grade: SA level 7–1, or symbol A–F. */
  gradeScale: GradeScale;
  /** School name printed at the top of parent reports; "" = left off. */
  reportSchool: string;
  /** The teacher's name as printed on parent reports; "" = left off. */
  reportTeacher: string;
  /**
   * Per grade (ClassInfo.year), the examinations' share of the weighted mark in
   * percent; informal tasks get the rest. A grade not listed uses
   * DEFAULT_EXAM_WEIGHT.
   */
  examWeights: Record<string, number>;
}

/** The examinations' share (%) of the weighted mark for a grade nobody has set. */
export const DEFAULT_EXAM_WEIGHT = 50;

/** The examinations' share (%) of the weighted mark for a grade. */
export function examWeightFor(prefs: Pick<UserPrefs, "examWeights">, grade: string): number {
  return prefs.examWeights[grade] ?? DEFAULT_EXAM_WEIGHT;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  markGridEnter: "across",
  privacyMode: true,
  seatNameStyle: "full",
  showSeatPoints: false,
  popoverShowFlags: false,
  popoverShowNotes: false,
  uiScale: 1,
  lessonBarSide: "left",
  enabledPlugins: [],
  teachingStyle: "room",
  dockSide: "left",
  reseatPinHash: "",
  timeZone: "",
  gradeScale: "level",
  reportSchool: "",
  reportTeacher: "",
  examWeights: {},
};

export const SEAT_COUNTS: Record<DeskShape, number> = {
  single: 1,
  double: 2,
  group4: 4,
  group6: 6,
  teacher: 0,
  door: 0,
  window: 0,
  label: 0,
};

export const DEFAULT_DESK_SIZES: Record<DeskShape, { w: number; h: number }> = {
  single: { w: 80, h: 60 },
  double: { w: 160, h: 60 },
  group4: { w: 160, h: 120 },
  group6: { w: 240, h: 120 },
  teacher: { w: 140, h: 60 },
  door: { w: 80, h: 16 },
  window: { w: 160, h: 12 },
  label: { w: 140, h: 40 },
};

export function studentName(s: Student): string {
  return `${s.firstName} ${s.lastName}`.trim();
}

/**
 * The two behaviours the random-student picker records: whether a student who
 * was cold-called could answer or not. They are ordinary catalogue entries, so
 * the label, points and colour stay editable in Settings — only the codes are
 * fixed, because that is how the picker (and the answer tally) find them.
 */
export const ANSWERED_BEHAVIOUR: BehaviourCode = {
  code: "Q+",
  label: "Asked and answered",
  kind: "positive",
  points: 1,
  color: BC.indigo,
};
export const NO_ANSWER_BEHAVIOUR: BehaviourCode = {
  code: "Q-",
  label: "Unable to answer",
  kind: "negative",
  points: -1,
  color: BC.slate,
};
export const ANSWER_BEHAVIOURS: BehaviourCode[] = [ANSWERED_BEHAVIOUR, NO_ANSWER_BEHAVIOUR];

export const DEFAULT_BEHAVIOURS: BehaviourCode[] = [
  { code: "EFF", label: "Great effort", kind: "positive", points: 1, color: BC.green },
  { code: "HELP", label: "Helping others", kind: "positive", points: 1, color: BC.teal },
  { code: "ANS", label: "Great answer", kind: "positive", points: 1, color: BC.blue },
  { code: "HW+", label: "Homework done well", kind: "positive", points: 2, color: BC.purple },
  { code: "TALK", label: "Talking / off task", kind: "negative", points: -1, color: BC.amber },
  { code: "DISR", label: "Disruptive", kind: "negative", points: -2, color: BC.orange },
  { code: "HW-", label: "Missing homework", kind: "negative", points: -1, color: BC.red },
  { code: "LATE", label: "Late to lesson", kind: "negative", points: -1, color: BC.pink },
  ...ANSWER_BEHAVIOURS,
];
