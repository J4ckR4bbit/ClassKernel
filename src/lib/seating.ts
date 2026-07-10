// Seat geometry + the constrained random seat assigner.

import { Desk, SEAT_COUNTS, SeatAssignment, Student } from "./types";

export interface SeatSlot {
  deskId: string;
  seatIndex: number;
  /** Center of the seat in room coordinates (rotation applied). */
  x: number;
  y: number;
}

/** Compute the seat slot positions for a desk, honoring its rotation. */
export function seatSlots(desk: Desk): SeatSlot[] {
  const count = SEAT_COUNTS[desk.shape];
  if (count === 0) return [];
  // Lay seats out on an unrotated desk: 1 row for <=2 or 3-wide rows for groups.
  const cols = desk.shape === "group4" ? 2 : desk.shape === "group6" ? 3 : count;
  const rows = Math.ceil(count / cols);
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
    });
  }
  return slots;
}

export function allSeatSlots(desks: Desk[]): SeatSlot[] {
  return desks.flatMap(seatSlots);
}

export interface RandomSeatingOptions {
  /** Pairs of student ids that must NOT sit next to each other. */
  apartPairs: Array<[string, string]>;
  /** Pairs of student ids that must share a desk. */
  togetherPairs: Array<[string, string]>;
  /** Students that must sit in the front band of the room (small y = front). */
  frontIds: string[];
  /** Try to avoid same-gender desk mates where genders are known. */
  alternateGender: boolean;
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
    const ys = slots.map((s) => s.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const frontLimit = minY + (maxY - minY) / 3 + 1;
    for (const id of opts.frontIds) {
      const pos = posOf.get(id);
      if (pos && pos.y > frontLimit) out.push(`${nameOf(id)} is not in the front of the room`);
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
 * Random seat assignment: shuffle-and-check with retries, keeping the attempt
 * with the fewest constraint violations. Deterministic when `rand` is provided.
 */
export function assignRandomSeats(
  students: Student[],
  desks: Desk[],
  planName: string,
  opts: RandomSeatingOptions,
  maxAttempts = 400,
  rand: () => number = Math.random,
): RandomSeatingResult {
  const slots = allSeatSlots(desks);
  const seatable = students.slice(0, slots.length);

  // Front-pinned students get the front-most slots offered first.
  const slotsByY = [...slots].sort((a, b) => a.y - b.y);

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
    const frontSlots = shuffle(slotsByY.slice(0, Math.max(front.length, 0)), rand);
    const restSlots = shuffle(slotsByY.slice(front.length), rand);
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
