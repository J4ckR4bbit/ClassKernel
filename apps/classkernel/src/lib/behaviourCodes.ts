import type { BehaviourCode } from "./types";

// A behaviour's Code is its short ID: at most three characters (e.g. +HW),
// shown on the grid and round pop-ups' tiles and stored in the class logs.

export const CODE_MAX = 3;

/** A typed code as stored: upper case, no spaces, at most three characters. */
export function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().slice(0, CODE_MAX);
}

/**
 * New codes for every code longer than three characters, keeping all codes
 * unique: its sign (+ positive, − negative) and two of its letters (TALK →
 * -TA, HELP → +HE), then its first letter and a digit. Codes that already fit
 * are left alone. Returns old → new; empty when nothing needs to change.
 */
export function shortenCodes(codes: BehaviourCode[]): Map<string, string> {
  const renames = new Map<string, string>();
  const taken = new Set(codes.filter((c) => c.code.length <= CODE_MAX).map((c) => c.code));
  for (const c of codes) {
    if (c.code.length <= CODE_MAX) continue;
    const sign = c.kind === "negative" ? "-" : "+";
    const letters = c.code.toUpperCase().replace(/[^A-Z0-9]/g, "") || "X";
    const candidates: string[] = [];
    for (let i = 1; i < letters.length; i++) candidates.push(sign + letters[0] + letters[i]);
    for (let d = 1; d <= 9; d++) candidates.push(sign + letters[0] + d);
    for (let n = 10; n <= 99; n++) candidates.push(sign + n);
    const next = candidates.find((k) => !taken.has(k));
    if (!next) continue; // 100 codes with this sign and letter: leave it as it is.
    taken.add(next);
    renames.set(c.code, next);
  }
  return renames;
}

/** The buttons with their codes renamed. */
export function applyRenames(codes: BehaviourCode[], renames: Map<string, string>): BehaviourCode[] {
  return codes.map((c) => (renames.has(c.code) ? { ...c, code: renames.get(c.code)! } : c));
}

/** "TALK → -TA, HELP → +HE": the renames, said once when they happen. */
export function describeRenames(renames: Map<string, string>): string {
  return [...renames].map(([from, to]) => `${from} → ${to}`).join(", ");
}
