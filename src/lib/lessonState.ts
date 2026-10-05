// Per-lesson state that lives in localStorage rather than the data folder:
// when the current lesson started, and whether its seats have been assigned.
// Both are per class and per machine — a lesson happens on one screen.

/** ISO timestamp of the last "End lesson" for the class — the start of this lesson. */
export const lessonStartKey = (className: string) => `classkernel.lessonStart.${className}`;

/** ISO timestamp of the last seat assignment (Randomise) for the class. */
export const seatedKey = (className: string) => `classkernel.seatedAt.${className}`;

/** The local calendar date (YYYY-MM-DD) of an ISO timestamp — matches today(). */
export function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
