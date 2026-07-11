// Core domain types. Every entity maps 1:1 onto a row of a plain CSV file
// (see repo.ts for the file layout) so data stays portable and Excel-friendly.

export interface ClassInfo {
  /** Folder name under classes/ — also the display identifier. */
  name: string;
  year: string;
  subject: string;
  room: string;
  /** Free-form markdown body of class.md (below the front matter). */
  notes: string;
  archived: boolean;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gender: string; // free text: "M", "F", other, or empty
  flags: string; // semicolon-separated tags e.g. "SEN;Medical"
  notes: string;
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
}

export type FrontEdge = "top" | "right" | "bottom" | "left";

export interface RoomConfig {
  /** Which edge of the canvas is the front of the room (whiteboard). */
  frontEdge: FrontEdge;
  /** Optional view crop: seating/lesson/print views show only this region, scaled up. */
  crop: { x: number; y: number; w: number; h: number } | null;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = { frontEdge: "top", crop: null };

export interface SeatAssignment {
  planName: string;
  deskId: string;
  seatIndex: number;
  studentId: string;
}

export interface Assessment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  totalMarks: number;
  weight: number;
  category: string;
}

export interface Mark {
  assessmentId: string;
  studentId: string;
  mark: number | null; // null = not entered / absent
  comment: string;
}

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

export const DEFAULT_BEHAVIOURS: BehaviourCode[] = [
  { code: "EFF", label: "Great effort", kind: "positive", points: 1, color: "#2e9e5b" },
  { code: "HELP", label: "Helping others", kind: "positive", points: 1, color: "#2e9e8a" },
  { code: "ANS", label: "Great answer", kind: "positive", points: 1, color: "#3b82d6" },
  { code: "HW+", label: "Homework done well", kind: "positive", points: 2, color: "#7c5cd6" },
  { code: "TALK", label: "Talking / off task", kind: "negative", points: -1, color: "#e0a63a" },
  { code: "DISR", label: "Disruptive", kind: "negative", points: -2, color: "#e06c3a" },
  { code: "HW-", label: "Missing homework", kind: "negative", points: -1, color: "#d65c5c" },
  { code: "LATE", label: "Late to lesson", kind: "negative", points: -1, color: "#b85c8a" },
];
