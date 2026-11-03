import { useAppPick } from "../../store/appStore";
import { sortByName, studentName } from "../../lib/types";
import { displayStudentName } from "../../lib/privacy";
import { dateInZone } from "../../lib/time";
import Icon from "../Icon";

export const NOTE_TEXT_MIN = 12;
export const NOTE_TEXT_MAX = 32;

/** A student's name for a note: in privacy mode, the way the seats show it. "" is the whole lesson. */
export function useNoteName(): (studentId: string) => string {
  const { students, userPrefs } = useAppPick("students", "userPrefs");
  return (studentId: string) => {
    if (!studentId) return "Lesson";
    const s = students.find((x) => x.id === studentId);
    if (!s) return "A former student";
    return userPrefs.privacyMode ? displayStudentName(s, userPrefs.seatNameStyle) : studentName(s);
  };
}

/** A − / + pair that sets the note boxes' text size, remembered with the settings. */
export function TextSizeButtons() {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");
  const size = userPrefs.noteTextSize;
  const set = (next: number) =>
    void setUserPrefs({ ...userPrefs, noteTextSize: Math.min(NOTE_TEXT_MAX, Math.max(NOTE_TEXT_MIN, next)) });
  return (
    <span className="note-size" role="group" aria-label="Text size">
      <button className="small icon-only" onClick={() => set(size - 2)} disabled={size <= NOTE_TEXT_MIN} aria-label="Smaller text" title="Smaller text">
        <Icon name="text_decrease" size={18} />
      </button>
      <button className="small icon-only" onClick={() => set(size + 2)} disabled={size >= NOTE_TEXT_MAX} aria-label="Larger text" title="Larger text">
        <Icon name="text_increase" size={18} />
      </button>
    </span>
  );
}

/** Choose who a note is about, in register order. */
export function StudentSelect({
  value,
  onChange,
  allowLesson = false,
  label = "Student",
}: {
  value: string;
  onChange: (studentId: string) => void;
  /** Offer "Whole lesson" (quick notes). */
  allowLesson?: boolean;
  label?: string;
}) {
  const { students } = useAppPick("students");
  const name = useNoteName();
  return (
    <label className="note-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowLesson ? <option value="">Whole lesson</option> : <option value="">Choose a student…</option>}
        {sortByName(students).map((s) => (
          <option key={s.id} value={s.id}>
            {name(s.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A timestamp for a note dated `date` (YYYY-MM-DD): the original one if the
 * date didn't change, otherwise midday in South Africa that day, which is the
 * same calendar date in any time zone the app is likely to show.
 */
export function timestampFor(date: string, original?: string): string {
  if (original && dateInZone(original) === date) return original;
  return `${date}T10:00:00.000Z`;
}
