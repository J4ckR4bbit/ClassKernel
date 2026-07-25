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

/**
 * Black or white, whichever reads better on the given background colour.
 * Used for behaviour buttons whose colour the teacher picks freely, so a pale
 * yellow can never end up with invisible white text.
 */
export function textColorFor(bgHex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bgHex.trim());
  if (!m) return "#fff";
  const v = parseInt(m[1], 16);
  const lum = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lum(v >> 16) + 0.7152 * lum((v >> 8) & 0xff) + 0.0722 * lum(v & 0xff);
  // Contrast vs white = (1.05)/(L+0.05); vs black = (L+0.05)/0.05.
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#fff" : "#1d2733";
}
