// Balancing chemical equations, and saying what kind of reaction they are.
// The equation is read from text ("C3H8 + O2 -> CO2 + H2O", with or without
// subscripts, charges and state symbols), balanced by solving the atom and
// charge balance exactly in fractions, and classified from the species and
// their oxidation numbers.

import { composition } from "./bonds";
import { elementBySymbol } from "./elements";

export interface Species {
  /** As typed, tidied: "C3H8" → "C₃H₈". */
  formula: string;
  atoms: Map<string, number>;
  charge: number;
  state?: string;
}

export interface Equation {
  reactants: Species[];
  products: Species[];
}

const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
const FROM_SUB: Record<string, string> = Object.fromEntries(Object.entries(SUB).map(([k, v]) => [v, k]));

/** "Cu^2+", "Cu2+", "Cu²⁺", "SO4^2-", "e-" → the formula body and its charge. */
export function parseSpecies(text: string): Species {
  let s = text.trim();
  // State symbol.
  let state: string | undefined;
  const stateMatch = /\((s|l|g|aq)\)$/.exec(s);
  if (stateMatch) {
    state = stateMatch[1];
    s = s.slice(0, stateMatch.index).trim();
  }
  // Normalise subscripts to digits for parsing, keep superscripts as charge.
  s = s.replace(/[₀-₉]/g, (d) => FROM_SUB[d]);
  let charge = 0;
  const unicodeCharge = /([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])$/.exec(s);
  const caretCharge = /\^(\d*)([+-])$/.exec(s);
  const asciiCharge = /(\d*)([+-])$/.exec(s);
  if (unicodeCharge) {
    const digits = unicodeCharge[1].split("").map((c) => Object.entries(SUP).find(([, v]) => v === c)?.[0] ?? "").join("");
    charge = (digits ? parseInt(digits, 10) : 1) * (unicodeCharge[2] === "⁺" ? 1 : -1);
    s = s.slice(0, unicodeCharge.index);
  } else if (caretCharge) {
    // "SO4^2-": the caret makes the digits a charge.
    charge = (caretCharge[1] ? parseInt(caretCharge[1], 10) : 1) * (caretCharge[2] === "+" ? 1 : -1);
    s = s.slice(0, caretCharge.index);
  } else if (asciiCharge && s.length > asciiCharge[0].length) {
    // "Cu2+" is copper(II); "NH4+" is ammonium, the 4 a subscript: digits
    // count as the charge only on a bare element symbol.
    const body = s.slice(0, asciiCharge.index);
    const bare = /^[A-Z][a-z]?$/.test(body);
    const sign = asciiCharge[2] === "+" ? 1 : -1;
    if (bare && asciiCharge[1]) {
      charge = parseInt(asciiCharge[1], 10) * sign;
      s = body;
    } else {
      charge = sign;
      s = body + asciiCharge[1];
    }
  }
  if (s === "e") return { formula: "e⁻", atoms: new Map(), charge: -1, state };
  if (!/^[A-Z(]/.test(s)) throw new Error(`"${text}" is not a formula`);
  const atoms = composition(s);
  for (const sym of atoms.keys()) if (!elementBySymbol(sym)) throw new Error(`"${sym}" in "${text}" is not an element`);
  const pretty = s.replace(/\d/g, (d) => SUB[d]) + (charge === 0 ? "" : `${Math.abs(charge) === 1 ? "" : SUP[String(Math.abs(charge))]}${charge > 0 ? "⁺" : "⁻"}`);
  return { formula: pretty, atoms, charge, state };
}

/** "Al + O2 -> Al2O3" (also →, =, ⇌) with any leading coefficients dropped. */
export function parseEquation(text: string): Equation {
  const sides = text.split(/->|→|⇌|=>|=/);
  if (sides.length !== 2) throw new Error("Write the equation as reactants → products, with one arrow.");
  // A "+" followed by the next substance separates; a "+" at the end of a
  // formula (or before a space and another "+") is a charge.
  const side = (t: string) =>
    t
      .split(/\+(?=\s*[A-Z(\de])/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => parseSpecies(p.replace(/^\d+\s*/, "")));
  const reactants = side(sides[0]);
  const products = side(sides[1]);
  if (reactants.length === 0 || products.length === 0) throw new Error("Each side needs at least one substance.");
  return { reactants, products };
}

// ---- Exact arithmetic --------------------------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);

/** A fraction kept in lowest terms. */
class Frac {
  n: number;
  d: number;
  constructor(n: number, d = 1) {
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const g = gcd(Math.abs(n), d) || 1;
    this.n = n / g;
    this.d = d / g;
  }
  static of(n: number) {
    return new Frac(n, 1);
  }
  add(o: Frac) {
    return new Frac(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Frac) {
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Frac) {
    return new Frac(this.n * o.n, this.d * o.d);
  }
  div(o: Frac) {
    return new Frac(this.n * o.d, this.d * o.n);
  }
  isZero() {
    return this.n === 0;
  }
}

export interface Balanced {
  coefficients: number[];
  equation: Equation;
}

/**
 * Balance by finding the nullspace of the atom-and-charge matrix. Each
 * species is a column; each element (and the charge) a row. A single
 * balanced equation means a one-dimensional nullspace with all-positive
 * entries; anything else is reported as such.
 */
export function balance(equation: Equation): Balanced {
  const species = [...equation.reactants, ...equation.products];
  const signs = [...equation.reactants.map(() => 1), ...equation.products.map(() => -1)];
  const elements = [...new Set(species.flatMap((s) => [...s.atoms.keys()]))];
  const rows: Frac[][] = elements.map((el) => species.map((s, j) => Frac.of((s.atoms.get(el) ?? 0) * signs[j])));
  if (species.some((s) => s.charge !== 0)) rows.push(species.map((s, j) => Frac.of(s.charge * signs[j])));
  const cols = species.length;

  // Reduced row echelon form.
  let r = 0;
  const pivots: number[] = [];
  for (let c = 0; c < cols && r < rows.length; c++) {
    let p = -1;
    for (let i = r; i < rows.length; i++) if (!rows[i][c].isZero()) p = i;
    if (p === -1) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    const pivot = rows[r][c];
    rows[r] = rows[r].map((x) => x.div(pivot));
    for (let i = 0; i < rows.length; i++) {
      if (i === r || rows[i][c].isZero()) continue;
      const f = rows[i][c];
      rows[i] = rows[i].map((x, k) => x.sub(f.mul(rows[r][k])));
    }
    pivots.push(c);
    r++;
  }
  const free = [...Array(cols).keys()].filter((c) => !pivots.includes(c));
  if (free.length === 0) throw new Error("These substances can't be balanced: nothing is conserved between the two sides as written.");
  if (free.length > 1) throw new Error("More than one independent equation fits these substances; split the reaction or check the formulas.");
  // Set the free variable to 1 and read the rest.
  const solution: Frac[] = Array(cols).fill(Frac.of(0));
  solution[free[0]] = Frac.of(1);
  pivots.forEach((c, i) => {
    solution[c] = Frac.of(0).sub(rows[i][free[0]]);
  });
  const denominator = solution.reduce((l, f) => lcm(l, f.d), 1);
  let ints = solution.map((f) => (f.n * denominator) / f.d);
  const divisor = ints.reduce((g, v) => gcd(g, Math.abs(v)), 0) || 1;
  ints = ints.map((v) => v / divisor);
  if (ints.some((v) => v <= 0)) {
    if (ints.every((v) => v < 0)) ints = ints.map((v) => -v);
    else throw new Error("No balanced equation with every substance on the side it is written: a substance may belong on the other side.");
  }
  return { coefficients: ints, equation };
}

/** "2Al + 3O₂ → 2Al₂O₃" (coefficient 1 left out), optionally with the states. */
export function equationText(b: Balanced, withStates = true): string {
  const term = (s: Species, c: number) => `${c === 1 ? "" : c}${s.formula}${withStates && s.state ? `(${s.state})` : ""}`;
  const left = b.equation.reactants.map((s, i) => term(s, b.coefficients[i])).join(" + ");
  const right = b.equation.products.map((s, i) => term(s, b.coefficients[b.equation.reactants.length + i])).join(" + ");
  return `${left} → ${right}`;
}

/** Atom (and charge) totals on each side, for the inventory students write. */
export function inventory(b: Balanced): Array<{ element: string; left: number; right: number }> {
  const count = (list: Species[], offset: number, el: string) => list.reduce((sum, s, i) => sum + (s.atoms.get(el) ?? 0) * b.coefficients[offset + i], 0);
  const elements = [...new Set([...b.equation.reactants, ...b.equation.products].flatMap((s) => [...s.atoms.keys()]))];
  const rows = elements.map((el) => ({ element: el, left: count(b.equation.reactants, 0, el), right: count(b.equation.products, b.equation.reactants.length, el) }));
  const charge = (list: Species[], offset: number) => list.reduce((sum, s, i) => sum + s.charge * b.coefficients[offset + i], 0);
  if ([...b.equation.reactants, ...b.equation.products].some((s) => s.charge !== 0)) rows.push({ element: "charge", left: charge(b.equation.reactants, 0), right: charge(b.equation.products, b.equation.reactants.length) });
  return rows;
}

// ---- Oxidation numbers -------------------------------------------------------

const FIXED: Record<string, number> = { F: -1, Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, Al: 3, Zn: 2, Ag: 1 };

/**
 * Oxidation numbers in a species by the school rules: an element on its own
 * is 0; F −1; group 1 +1, group 2 +2, Al +3; H +1 (−1 with a metal); O −2
 * (−1 in a peroxide, +2 with F); Cl, Br, I −1 unless with O or F; the
 * remaining element takes what is left so the charge adds up. Null when the
 * rules leave more than one element undecided.
 */
export function oxidationNumbers(s: Species): Map<string, number> | null {
  const out = new Map<string, number>();
  const elements = [...s.atoms.keys()];
  if (elements.length === 1) {
    out.set(elements[0], s.charge / s.atoms.get(elements[0])!);
    return out;
  }
  const has = (el: string) => s.atoms.has(el);
  const metals = elements.filter((el) => {
    const e = elementBySymbol(el)!;
    return !(e.category === "nonmetal" || e.category === "halogen" || e.category === "noble" || e.category === "metalloid");
  });
  for (const el of elements) {
    if (el in FIXED) out.set(el, FIXED[el]);
    else if (el === "H") out.set(el, metals.length > 0 && elements.length === 2 ? -1 : 1);
    else if (el === "O") {
      if (has("F")) out.set(el, 2);
      else if (isPeroxide(s)) out.set(el, -1);
      else out.set(el, -2);
    } else if (["Cl", "Br", "I"].includes(el) && !has("O") && !has("F")) out.set(el, -1);
  }
  const unknown = elements.filter((el) => !out.has(el));
  if (unknown.length === 0) return out;
  if (unknown.length > 1) return null;
  const known = elements.filter((el) => out.has(el)).reduce((sum, el) => sum + out.get(el)! * s.atoms.get(el)!, 0);
  out.set(unknown[0], (s.charge - known) / s.atoms.get(unknown[0])!);
  return out;
}

/** H₂O₂, Na₂O₂, BaO₂, O₂²⁻: two oxygens with only +1 or +2 partners. */
function isPeroxide(s: Species): boolean {
  if ((s.atoms.get("O") ?? 0) !== 2) return false;
  const others = [...s.atoms.keys()].filter((el) => el !== "O");
  if (others.length === 0) return s.charge === -2;
  if (others.length !== 1) return false;
  const [el] = others;
  const n = s.atoms.get(el)!;
  const fixed = el === "H" ? 1 : FIXED[el];
  return fixed !== undefined && fixed * n - 2 === s.charge;
}

export type ReactionType = "synthesis" | "decomposition" | "combustion" | "single displacement" | "double displacement" | "neutralisation" | "precipitation" | "redox" | "other";

export interface Classification {
  types: ReactionType[];
  /** Elements oxidised and reduced, where oxidation numbers could be assigned. */
  oxidised: Array<{ element: string; from: number; to: number }>;
  reduced: Array<{ element: string; from: number; to: number }>;
}

const isAcidFormula = (f: string) => /^H[₀-₉]?[A-Z]/.test(f) && f !== "H₂O" && f !== "H₂O₂" && f !== "H₂";
const isHydroxide = (f: string) => /OH/.test(f) && f !== "H₂O";
const isCarbonate = (f: string) => /CO₃/.test(f);
const isHydrocarbon = (s: Species) => [...s.atoms.keys()].every((e) => e === "C" || e === "H" || e === "O") && s.atoms.has("C") && s.atoms.has("H") && (s.atoms.get("O") ?? 0) <= 2;

/** What kind of reaction it is: more than one label can apply (a combustion is also redox). */
export function classify(b: Balanced): Classification {
  const { reactants, products } = b.equation;
  const types: ReactionType[] = [];
  const formulas = (list: Species[]) => list.map((s) => s.formula);
  const R = formulas(reactants);
  const P = formulas(products);
  const elementOnly = (s: Species) => s.atoms.size === 1 && s.charge === 0;

  if (reactants.length >= 2 && products.length === 1) types.push("synthesis");
  if (reactants.length === 1 && products.length >= 2) types.push("decomposition");
  if (R.includes("O₂") && reactants.some(isHydrocarbon) && P.includes("CO₂") && P.includes("H₂O")) types.push("combustion");
  else if (R.includes("O₂") && reactants.length === 2 && products.every((p) => p.atoms.has("O"))) types.push("combustion");
  const acid = reactants.find((s) => isAcidFormula(s.formula));
  const base = reactants.find((s) => isHydroxide(s.formula) || isCarbonate(s.formula) || s.formula === "NH₃" || /O$/.test(s.formula));
  if (acid && base && (P.includes("H₂O") || products.some((s) => s.formula === "NH₄⁺" || /NH₄/.test(s.formula)))) types.push("neutralisation");
  if (reactants.length === 2 && products.length === 2 && reactants.some(elementOnly) && products.some(elementOnly) && !reactants.every(elementOnly)) types.push("single displacement");
  if (reactants.length === 2 && products.length === 2 && !reactants.some(elementOnly) && !products.some(elementOnly) && !types.includes("neutralisation")) {
    types.push("double displacement");
    if (products.some((s) => s.state === "s")) types.push("precipitation");
  }

  // Oxidation numbers before and after, per element.
  const before = new Map<string, Set<number>>();
  const after = new Map<string, Set<number>>();
  let allAssigned = true;
  const collect = (list: Species[], into: Map<string, Set<number>>) => {
    for (const s of list) {
      const ox = oxidationNumbers(s);
      if (!ox) {
        allAssigned = false;
        continue;
      }
      for (const [el, v] of ox) {
        if (!into.has(el)) into.set(el, new Set());
        into.get(el)!.add(v);
      }
    }
  };
  collect(reactants, before);
  collect(products, after);
  const oxidised: Classification["oxidised"] = [];
  const reduced: Classification["reduced"] = [];
  for (const [el, b0] of before) {
    const a0 = after.get(el);
    if (!a0) continue;
    const from = Math.min(...b0);
    const to = Math.max(...a0);
    const fromMax = Math.max(...b0);
    const toMin = Math.min(...a0);
    if (to > from && !(a0.has(from) && b0.has(to))) oxidised.push({ element: el, from, to });
    if (toMin < fromMax && !(a0.has(fromMax) && b0.has(toMin))) reduced.push({ element: el, from: fromMax, to: toMin });
  }
  if (allAssigned && (oxidised.length > 0 || reduced.length > 0)) types.push("redox");
  if (types.length === 0) types.push("other");
  return { types, oxidised, reduced };
}

/** "+7", "−2", "0", "+8/3" for an average. */
export function oxidationText(v: number): string {
  if (v === 0) return "0";
  const sign = v > 0 ? "+" : "−";
  const a = Math.abs(v);
  if (Number.isInteger(a)) return `${sign}${a}`;
  for (let d = 2; d <= 6; d++) if (Number.isInteger(a * d)) return `${sign}${a * d}/${d}`;
  return `${sign}${a.toFixed(2)}`;
}

export const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: "Burning propane", text: "C3H8 + O2 -> CO2 + H2O" },
  { label: "Photosynthesis", text: "CO2 + H2O -> C6H12O6 + O2" },
  { label: "Haber process", text: "N2 + H2 -> NH3" },
  { label: "Thermite", text: "Fe2O3 + Al -> Al2O3 + Fe" },
  { label: "Zinc in acid", text: "Zn(s) + HCl(aq) -> ZnCl2(aq) + H2(g)" },
  { label: "Neutralisation", text: "H2SO4 + NaOH -> Na2SO4 + H2O" },
  { label: "Limestone and acid", text: "CaCO3 + HCl -> CaCl2 + H2O + CO2" },
  { label: "Precipitation", text: "AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq)" },
  { label: "Silver and copper (ionic)", text: "Ag+ + Cu -> Ag + Cu2+" },
  { label: "Permanganate and iron(II)", text: "MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O" },
  { label: "Permanganate and HCl", text: "KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2" },
  { label: "Decomposing peroxide", text: "H2O2 -> H2O + O2" },
];
