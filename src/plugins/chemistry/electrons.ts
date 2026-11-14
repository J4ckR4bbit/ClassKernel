// Electron configurations, the way the school course writes them: in the
// Aufbau (filling) order — 1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶ for iron — with the
// noble-gas shorthand, the shell populations for a Bohr-style diagram, and
// the orbital boxes with their arrows (Hund's rule) for an Aufbau diagram.
// The known exceptions to the Aufbau principle (Cr, Cu, Ag, Au…) are listed,
// not derived.

import { superscript } from "../numbers";

export type Subshell = "s" | "p" | "d" | "f";

export interface Orbital {
  n: number;
  l: Subshell;
  /** Electrons in the subshell. */
  electrons: number;
}

const CAPACITY: Record<Subshell, number> = { s: 2, p: 6, d: 10, f: 14 };
export const ORBITALS_IN: Record<Subshell, number> = { s: 1, p: 3, d: 5, f: 7 };

/** The Aufbau order, 1s to 7p (enough for 118 electrons). */
export const AUFBAU_ORDER: Array<{ n: number; l: Subshell }> = [
  { n: 1, l: "s" },
  { n: 2, l: "s" },
  { n: 2, l: "p" },
  { n: 3, l: "s" },
  { n: 3, l: "p" },
  { n: 4, l: "s" },
  { n: 3, l: "d" },
  { n: 4, l: "p" },
  { n: 5, l: "s" },
  { n: 4, l: "d" },
  { n: 5, l: "p" },
  { n: 6, l: "s" },
  { n: 4, l: "f" },
  { n: 5, l: "d" },
  { n: 6, l: "p" },
  { n: 7, l: "s" },
  { n: 5, l: "f" },
  { n: 6, l: "d" },
  { n: 7, l: "p" },
];

/**
 * Ground states that break the Aufbau order (NIST Atomic Spectra Database),
 * written as the subshells that differ from the plain filling: the rest is
 * filled as usual. Keyed by atomic number.
 */
const EXCEPTIONS: Record<number, Array<[number, Subshell, number]>> = {
  24: [[3, "d", 5], [4, "s", 1]], // Cr
  29: [[3, "d", 10], [4, "s", 1]], // Cu
  41: [[4, "d", 4], [5, "s", 1]], // Nb
  42: [[4, "d", 5], [5, "s", 1]], // Mo
  44: [[4, "d", 7], [5, "s", 1]], // Ru
  45: [[4, "d", 8], [5, "s", 1]], // Rh
  46: [[4, "d", 10], [5, "s", 0]], // Pd
  47: [[4, "d", 10], [5, "s", 1]], // Ag
  57: [[4, "f", 0], [5, "d", 1]], // La
  58: [[4, "f", 1], [5, "d", 1]], // Ce
  64: [[4, "f", 7], [5, "d", 1]], // Gd
  78: [[5, "d", 9], [6, "s", 1]], // Pt
  79: [[5, "d", 10], [6, "s", 1]], // Au
  89: [[5, "f", 0], [6, "d", 1]], // Ac
  90: [[5, "f", 0], [6, "d", 2]], // Th
  91: [[5, "f", 2], [6, "d", 1]], // Pa
  92: [[5, "f", 3], [6, "d", 1]], // U
  93: [[5, "f", 4], [6, "d", 1]], // Np
  96: [[5, "f", 7], [6, "d", 1]], // Cm
  103: [[6, "d", 0], [7, "p", 1]], // Lr
};

/**
 * The ground-state configuration of a neutral atom, as a list of subshells in
 * filling order (empty subshells left out).
 */
export function configuration(atomicNumber: number): Orbital[] {
  if (!Number.isInteger(atomicNumber) || atomicNumber < 1 || atomicNumber > 118) throw new Error(`No element ${atomicNumber}`);
  let left = atomicNumber;
  const filled: Orbital[] = [];
  for (const { n, l } of AUFBAU_ORDER) {
    if (left <= 0) break;
    const electrons = Math.min(CAPACITY[l], left);
    filled.push({ n, l, electrons });
    left -= electrons;
  }
  const overrides = EXCEPTIONS[atomicNumber];
  if (overrides) {
    for (const [n, l, electrons] of overrides) {
      const existing = filled.find((o) => o.n === n && o.l === l);
      if (existing) existing.electrons = electrons;
      else {
        // Put it where the Aufbau order has it, so the notation stays in filling order.
        const index = AUFBAU_ORDER.findIndex((o) => o.n === n && o.l === l);
        const at = filled.findIndex((o) => AUFBAU_ORDER.findIndex((a) => a.n === o.n && a.l === o.l) > index);
        filled.splice(at === -1 ? filled.length : at, 0, { n, l, electrons });
      }
    }
  }
  return filled.filter((o) => o.electrons > 0);
}

/** "1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶". */
export function spdfNotation(orbitals: Orbital[]): string {
  return orbitals.map((o) => `${o.n}${o.l}${superscript(o.electrons)}`).join(" ");
}

/** The noble gases, for the shorthand. */
export const NOBLE_GASES: Array<{ z: number; symbol: string }> = [
  { z: 2, symbol: "He" },
  { z: 10, symbol: "Ne" },
  { z: 18, symbol: "Ar" },
  { z: 36, symbol: "Kr" },
  { z: 54, symbol: "Xe" },
  { z: 86, symbol: "Rn" },
];

/** "[Ar] 4s² 3d⁶" — the core noble gas and what comes after it. Hydrogen and helium have no shorthand. */
export function shorthandNotation(atomicNumber: number): string {
  const core = [...NOBLE_GASES].reverse().find((g) => g.z < atomicNumber);
  if (!core) return spdfNotation(configuration(atomicNumber));
  const coreOrbitals = configuration(core.z);
  const all = configuration(atomicNumber);
  // Everything in the core is filled identically in the element (the core is
  // closed-shell), so drop those subshells and keep the rest in filling order.
  const rest = all.filter((o) => !coreOrbitals.some((c) => c.n === o.n && c.l === o.l && c.electrons === o.electrons));
  return `[${core.symbol}] ${spdfNotation(rest)}`.trim();
}

/** Electrons per shell, n = 1 outwards: iron → [2, 8, 14, 2]. */
export function shells(orbitals: Orbital[]): number[] {
  const out: number[] = [];
  for (const o of orbitals) out[o.n - 1] = (out[o.n - 1] ?? 0) + o.electrons;
  for (let i = 0; i < out.length; i++) out[i] = out[i] ?? 0;
  return out;
}

/** Electrons in the outermost shell: the valence electrons of a main-group element. */
export function valenceElectrons(orbitals: Orbital[]): number {
  const s = shells(orbitals);
  return s[s.length - 1];
}

export interface OrbitalBox {
  /** 1 for one up arrow, 2 for a pair, 0 for empty. */
  electrons: number;
}

export interface SubshellBoxes {
  n: number;
  l: Subshell;
  label: string;
  boxes: OrbitalBox[];
}

/**
 * The orbital boxes for an Aufbau diagram, lowest energy first: each subshell
 * as its orbitals, electrons placed one per orbital before any pair (Hund's
 * rule). Every subshell up to the last occupied one is shown, so an empty
 * 3d on potassium appears as empty boxes only if asked for.
 */
export function orbitalBoxes(orbitals: Orbital[], includeEmpty = false): SubshellBoxes[] {
  const lastIndex = Math.max(...orbitals.map((o) => AUFBAU_ORDER.findIndex((a) => a.n === o.n && a.l === o.l)));
  const result: SubshellBoxes[] = [];
  AUFBAU_ORDER.slice(0, lastIndex + 1).forEach(({ n, l }) => {
    const found = orbitals.find((o) => o.n === n && o.l === l);
    const electrons = found?.electrons ?? 0;
    if (electrons === 0 && !includeEmpty) return;
    const count = ORBITALS_IN[l];
    const boxes: OrbitalBox[] = Array.from({ length: count }, () => ({ electrons: 0 }));
    for (let i = 0; i < electrons; i++) boxes[i % count].electrons += 1;
    result.push({ n, l, label: `${n}${l}`, boxes });
  });
  return result;
}

/** Unpaired electrons — the reason iron, cobalt and nickel are magnetic, and oxygen paramagnetic. */
export function unpairedElectrons(orbitals: Orbital[]): number {
  return orbitalBoxes(orbitals).reduce((sum, s) => sum + s.boxes.filter((b) => b.electrons === 1).length, 0);
}
