// The seating plan read as a list of tables — what the teaching strip shows
// instead of the drawn room. Pure, so the ordering is unit-tested.

import { Desk, FrontEdge, SEAT_COUNTS, SeatAssignment } from "./types";
import { frontness } from "./seating";

/**
 * Each seat-bearing desk's display label: its own label, or "Desk n" counted
 * in layout order. Lesson history stores these labels, so every view must use
 * the same fallback.
 */
export function deskDisplayLabels(desks: Desk[]): Map<string, string> {
  const m = new Map<string, string>();
  let n = 0;
  for (const d of desks) {
    if (SEAT_COUNTS[d.shape] > 0) {
      n++;
      m.set(d.id, d.label.trim() || `Desk ${n}`);
    }
  }
  return m;
}

export interface TableGroup {
  deskId: string;
  label: string;
  /** Seated students, in seat order. */
  studentIds: string[];
}

/** Desks whose centres are this close front-to-back count as one row. */
const ROW_TOLERANCE = 40;

/**
 * The plan's occupied desks as tables, ordered as the teacher sees the room
 * from the front: front row first, then across each row. Empty desks are left
 * out — the strip is for the students who are actually there.
 */
export function groupSeatsByTable(desks: Desk[], planSeats: SeatAssignment[], frontEdge: FrontEdge): TableGroup[] {
  const labels = deskDisplayLabels(desks);
  const across = (d: Desk) =>
    frontEdge === "top" || frontEdge === "bottom" ? d.x + d.w / 2 : d.y + d.h / 2;
  const tables = desks
    .filter((d) => SEAT_COUNTS[d.shape] > 0)
    .map((d) => ({
      desk: d,
      front: frontness(d.x + d.w / 2, d.y + d.h / 2, frontEdge),
      studentIds: planSeats
        .filter((s) => s.deskId === d.id && s.studentId)
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((s) => s.studentId),
    }))
    .filter((t) => t.studentIds.length > 0)
    .sort((a, b) => a.front - b.front);

  // Snap each desk to the row of the front-most desk within tolerance, so a
  // slightly staggered desk still sorts across its row rather than behind it.
  let rowFront = -Infinity;
  const rowed = tables.map((t) => {
    if (t.front - rowFront > ROW_TOLERANCE) rowFront = t.front;
    return { ...t, row: rowFront };
  });
  rowed.sort((a, b) => a.row - b.row || across(a.desk) - across(b.desk));

  return rowed.map((t) => ({ deskId: t.desk.id, label: labels.get(t.desk.id) ?? t.desk.id, studentIds: t.studentIds }));
}
