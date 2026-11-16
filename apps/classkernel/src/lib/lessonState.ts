// Per-lesson state that lives in localStorage rather than the data folder:
// when the last lesson ended, whether a lesson is running, and whether its
// seats have been assigned. All are per class and per machine — a lesson
// happens on one screen.

import { AttendanceEntry } from "./types";
import { dateInZone } from "./time";

/** ISO timestamp of the last "End lesson" for the class — "this lesson" counts from here. */
export const lessonStartKey = (className: string) => `classkernel.lessonStart.${className}`;

/** ISO timestamp of the last "Start lesson" (or Randomise) for the class. */
export const lessonRunningKey = (className: string) => `classkernel.lessonRunning.${className}`;

/** ISO timestamp of the last seat assignment (Randomise) for the class. */
export const seatedKey = (className: string) => `classkernel.seatedAt.${className}`;

/** The calendar date (YYYY-MM-DD) of an ISO timestamp in the teacher's zone — matches today(). */
export function localDate(iso: string): string {
  return dateInZone(iso);
}

/**
 * Seats may be assigned once per lesson. The lock holds while the last
 * assignment was made today and after the current lesson started; ending the
 * lesson, or a new day dawning without one being ended, lifts it.
 */
export function isSeatingLocked(seatedAt: string | null, lessonStart: string | null, todayStr: string): boolean {
  if (!seatedAt) return false;
  if (localDate(seatedAt) !== todayStr) return false;
  return !lessonStart || seatedAt >= lessonStart;
}

/**
 * A lesson runs from Start lesson (or a Randomise) until End lesson. One that
 * was never ended stops counting as running on the next day.
 */
export function isLessonRunning(startedAt: string | null, endedAt: string | null, todayStr: string): boolean {
  if (!startedAt) return false;
  if (localDate(startedAt) !== todayStr) return false;
  return !endedAt || startedAt > endedAt;
}

/**
 * Starting a lesson marks the class present: every student without a mark for
 * the day gets "P". Marks already made (an absence from the register, say) stay.
 */
export function markUnmarkedPresent(
  attendance: AttendanceEntry[],
  studentIds: string[],
  date: string,
): { attendance: AttendanceEntry[]; added: number } {
  const marked = new Set(attendance.filter((e) => e.date === date).map((e) => e.studentId));
  const fresh = studentIds
    .filter((id) => !marked.has(id))
    .map((studentId) => ({ date, studentId, status: "P" as const, note: "" }));
  return { attendance: fresh.length ? [...attendance, ...fresh] : attendance, added: fresh.length };
}

/** "Lesson started — 24 marked present", or "… — attendance already taken" when nobody needed a mark. */
export function lessonStartedMessage(lead: string, added: number): string {
  return `${lead} — ${added ? `${added} marked present` : "attendance already taken"}`;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readLessonStart(className: string): string | null {
  return read(lessonStartKey(className));
}

export function readSeatedAt(className: string): string | null {
  return read(seatedKey(className));
}

export function readLessonRunning(className: string): string | null {
  return read(lessonRunningKey(className));
}
