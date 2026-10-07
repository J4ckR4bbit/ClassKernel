// Helpers for keeping student information off the class-facing screen.
// The app runs on large touch panels at the front of the room, so every view
// is potentially public; these are the small pure pieces the privacy-aware
// components share.

import { SeatNameStyle, Student } from "./types";

/** A student's display name in the chosen style, e.g. "Amelia Adams",
 * "Amelia A." or "Amelia". Falls back to the surname if the first name is empty. */
export function displayStudentName(s: Student, style: SeatNameStyle): string {
  const first = s.firstName.trim();
  const last = s.lastName.trim();
  if (!first) return last;
  if (style === "first") return first;
  if (style === "firstInitial") return last ? `${first} ${last[0]}.` : first;
  return `${first} ${last}`.trim();
}

/** The surname part to render on a seat tile's second line for the style
 * ("" collapses the line). Keeps RoomCanvas free of privacy knowledge. */
export function seatSurname(s: Student, style: SeatNameStyle): string {
  const last = s.lastName.trim();
  if (!last || style === "first") return "";
  if (style === "firstInitial") return `${last[0]}.`;
  return last;
}
