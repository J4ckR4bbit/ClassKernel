// Seat geometry + the constrained random seat assigner.

import { Desk, FrontEdge, SEAT_COUNTS, SeatAssignment, Student } from "./types";
import { ROOM_H, ROOM_W } from "./room";

export interface SeatSlot {
  deskId: string;
  seatIndex: number;
  /** Center of the seat in room coordinates (rotation applied). */
  x: number;
  y: number;
  /** Size of this seat's cell within the desk (unrotated), so it can be drawn
   *  as a rounded square that fills the whole seat. */
  w: number;
  h: number;
}

/** Compute the seat slot positions for a desk, honoring its rotation. */
export function seatSlots(desk: Desk): SeatSlot[] {
  const count = SEAT_COUNTS[desk.shape];
  if (count === 0) return [];
  // Lay seats out on an unrotated desk: 1 row for <=2 or 3-wide rows for groups.
  const cols = desk.shape === "group4" ? 2 : desk.shape === "group6" ? 3 : count;
  const rows = Math.ceil(count / cols);
  const cellW = desk.w / cols;
  const cellH = desk.h / rows;
  const slots: SeatSlot[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // Local offset from desk center.
    const lx = ((c + 0.5) / cols - 0.5) * desk.w;
    const ly = ((r + 0.5) / rows - 0.5) * desk.h;
    const rad = ((desk.rotation % 360) * Math.PI) / 180;
    const cx = desk.x + desk.w / 2;
    const cy = desk.y + desk.h / 2;
    slots.push({
      deskId: desk.id,
      seatIndex: i,
      x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
      w: cellW,
      h: cellH,
    });
  }
  return slots;
}

export function allSeatSlots(desks: Desk[]): SeatSlot[] {
  return desks.flatMap(seatSlots);
}

/**
 * How close a seat is to the front of the room: 0 at the front edge, growing
 * toward the back. Which canvas edge is "front" is configurable per room.
 */
export function frontness(x: number, y: number, edge: FrontEdge): number {
  switch (edge) {
    case "top":
      return y;
    case "bottom":
      return ROOM_H - y;
    case "left":
      return x;
    case "right":
      return ROOM_W - x;
  }
}

export interface RandomSeatingOptions {
  /** Pairs of student ids that must NOT sit next to each other. */
  apartPairs: Array<[string, string]>;
  /** Pairs of student ids that must share a desk. */
  togetherPairs: Array<[string, string]>;
  /** Students that must sit in the front band of the room. */
  frontIds: string[];
  /** Try to avoid same-gender desk mates where genders are known. */
  alternateGender: boolean;
  /** Which canvas edge is the front of the room. Default "top". */
  frontEdge?: FrontEdge;
  /** Two seats closer than this (room units) count as "next to each other". */
  adjacencyDistance?: number;
}

export interface RandomSeatingResult {
  assignments: SeatAssignment[];
  /** Human-readable descriptions of constraints the best attempt still violates. */
  violations: string[];
  attempts: number;
}

interface Placement {
  slot: SeatSlot;
  studentId: string;
}

function violationsOf(
  placements: Placement[],
  students: Student[],
  slots: SeatSlot[],
  opts: RandomSeatingOptions,
): string[] {
  const out: string[] = [];
  const nameOf = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? `${s.firstName} ${s.lastName}`.trim() : id;
  };
  const posOf = new Map(placements.map((p) => [p.studentId, p.slot]));
  const adjacency = opts.adjacencyDistance ?? 95;
  const edge = opts.frontEdge ?? "top";

  for (const [a, b] of opts.apartPairs) {
    const pa = posOf.get(a);
    const pb = posOf.get(b);
    if (!pa || !pb) continue;
    const sameDesk = pa.deskId === pb.deskId;
    const close = Math.hypot(pa.x - pb.x, pa.y - pb.y) < adjacency;
    if (sameDesk || close) out.push(`${nameOf(a)} and ${nameOf(b)} are next to each other`);
  }
  for (const [a, b] of opts.togetherPairs) {
    const pa = posOf.get(a);
    const pb = posOf.get(b);
    if (!pa || !pb) continue;
    if (pa.deskId !== pb.deskId) out.push(`${nameOf(a)} and ${nameOf(b)} are not sharing a desk`);
  }
  if (opts.frontIds.length && slots.length) {
    const fronts = slots.map((s) => frontness(s.x, s.y, edge));
    const minF = Math.min(...fronts);
    const maxF = Math.max(...fronts);
    const frontLimit = minF + (maxF - minF) / 3 + 1;
    for (const id of opts.frontIds) {
      const pos = posOf.get(id);
      if (pos && frontness(pos.x, pos.y, edge) > frontLimit) out.push(`${nameOf(id)} is not in the front of the room`);
    }
  }
  if (opts.alternateGender) {
    const byId = new Map(students.map((s) => [s.id, s]));
    const byDesk = new Map<string, Placement[]>();
    for (const p of placements) {
      const list = byDesk.get(p.slot.deskId) ?? [];
      list.push(p);
      byDesk.set(p.slot.deskId, list);
    }
    for (const [, mates] of byDesk) {
      const genders = mates
        .map((m) => byId.get(m.studentId)?.gender.trim().toUpperCase())
        .filter((g): g is string => !!g);
      if (genders.length >= 2 && new Set(genders).size === 1) {
        out.push(`Desk with ${mates.map((m) => nameOf(m.studentId)).join(", ")} is single-gender`);
      }
    }
  }
  return out;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Decide how many students each desk takes: as even a spread as possible,
 * with any remainder going to the desks closest to the front. E.g. six
 * 4-seaters and 17 students → 3,3,3,3,3,2 with the 2 at the back desk.
 * Returns the chosen seat slots, front-most desks first.
 */
export function spreadSlots(students: number, desks: Desk[], edge: FrontEdge): SeatSlot[] {
  const seatDesks = desks
    .filter((d) => SEAT_COUNTS[d.shape] > 0)
    .map((d) => {
      const slots = seatSlots(d);
      const f = Math.min(...slots.map((s) => frontness(s.x, s.y, edge)));
      return { desk: d, slots, front: f, take: 0 };
    })
    .sort((a, b) => a.front - b.front);

  let remaining = Math.min(
    students,
    seatDesks.reduce((acc, d) => acc + d.slots.length, 0),
  );
  // Deal students one at a time to the emptiest desk with space; ties go to
  // the desk nearest the front (the list is already in front-first order).
  while (remaining > 0) {
    let target = null;
    for (const d of seatDesks) {
      if (d.take >= d.slots.length) continue;
      if (target === null || d.take < target.take) target = d;
    }
    if (!target) break;
    target.take++;
    remaining--;
  }

  return seatDesks.flatMap((d) => d.slots.slice(0, d.take));
}

/**
 * Random seat assignment: students are spread evenly over the desks (front
 * desks filled first), then shuffled over those seats with retries, keeping
 * the attempt with the fewest constraint violations. Deterministic when
 * `rand` is provided.
 */
export function assignRandomSeats(
  students: Student[],
  desks: Desk[],
  planName: string,
  opts: RandomSeatingOptions,
  maxAttempts = 400,
  rand: () => number = Math.random,
): RandomSeatingResult {
  const edge = opts.frontEdge ?? "top";
  const slots = spreadSlots(students.length, desks, edge);
  const seatable = students.slice(0, slots.length);

  // Front-pinned students get the front-most of the chosen slots first.
  const slotsByFront = [...slots].sort(
    (a, b) => frontness(a.x, a.y, edge) - frontness(b.x, b.y, edge),
  );

  let best: Placement[] = [];
  let bestViolations: string[] | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++;
    const front = shuffle(seatable.filter((s) => opts.frontIds.includes(s.id)), rand);
    const rest = shuffle(seatable.filter((s) => !opts.frontIds.includes(s.id)), rand);

    const placements: Placement[] = [];
    // Give the front students the front-most seats (randomised within the band),
    // then scatter everyone else over the remaining seats.
    const frontSlots = shuffle(slotsByFront.slice(0, Math.max(front.length, 0)), rand);
    const restSlots = shuffle(slotsByFront.slice(front.length), rand);
    front.forEach((s, i) => placements.push({ slot: frontSlots[i], studentId: s.id }));
    rest.forEach((s, i) => {
      if (restSlots[i]) placements.push({ slot: restSlots[i], studentId: s.id });
    });

    const v = violationsOf(placements, students, slots, opts);
    if (bestViolations === null || v.length < bestViolations.length) {
      best = placements;
      bestViolations = v;
    }
    if (v.length === 0) break;
  }

  return {
    assignments: best.map((p) => ({
      planName,
      deskId: p.slot.deskId,
      seatIndex: p.slot.seatIndex,
      studentId: p.studentId,
    })),
    violations: bestViolations ?? [],
    attempts,
  };
}
