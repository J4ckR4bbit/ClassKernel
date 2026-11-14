// The chemistry of a galvanic cell, as the IEB / CAPS Physical Sciences
// curriculum asks it: two half-cells from the standard electrode potentials
// table, which one is the cathode, the half-reactions and the net equation,
// E°cell, the cell notation, and the EMF at other concentrations and
// temperatures from the Nernst equation. The view only draws what this works
// out, so the maths is tested here without a browser.
//
// Conventions follow the South African data sheet: E° values are standard
// reduction potentials at 298 K and 1 mol·dm⁻³ (gases at 101,3 kPa), with
// R = 8,31 J·K⁻¹·mol⁻¹ and F = 96 500 C·mol⁻¹.

import { formatFixed, formatSigFigs, superscript } from "../numbers";

export const R = 8.31;
export const F = 96500;
/** Standard conditions on the data sheet. */
export const STANDARD_T = 298;
export const STANDARD_P = 101.3;
export const STANDARD_C = 1;

export type Phase = "s" | "aq" | "g";

export interface Term {
  formula: string;
  coef: number;
  phase: Phase;
}

export interface HalfCell {
  /** Stable id, written into nothing but kept short for the URL-like state. */
  id: string;
  /** How it reads in the picker: "Cu²⁺ / Cu". */
  label: string;
  /** The reduction half-reaction as on the data sheet: ox + n e⁻ → red. */
  ox: Term[];
  red: Term[];
  n: number;
  /** Standard reduction potential, V. */
  E0: number;
  /** What the strip in the beaker is made of. */
  electrode: string;
  /** A platinum electrode takes no part in the reaction. */
  inert: boolean;
}

const s = (formula: string, coef = 1): Term => ({ formula, coef, phase: "s" });
const aq = (formula: string, coef = 1): Term => ({ formula, coef, phase: "aq" });
const g = (formula: string, coef = 1): Term => ({ formula, coef, phase: "g" });

/**
 * The half-cells a teacher can put in a beaker, from Table 4A of the data
 * sheet. Metal / metal-ion couples, the standard hydrogen electrode and one
 * ion / ion couple on platinum, so the usual exam cells can all be built.
 */
export const HALF_CELLS: HalfCell[] = [
  { id: "mg", label: "Mg²⁺ / Mg", ox: [aq("Mg²⁺")], red: [s("Mg")], n: 2, E0: -2.36, electrode: "Mg", inert: false },
  { id: "al", label: "Al³⁺ / Al", ox: [aq("Al³⁺")], red: [s("Al")], n: 3, E0: -1.66, electrode: "Al", inert: false },
  { id: "zn", label: "Zn²⁺ / Zn", ox: [aq("Zn²⁺")], red: [s("Zn")], n: 2, E0: -0.76, electrode: "Zn", inert: false },
  { id: "fe", label: "Fe²⁺ / Fe", ox: [aq("Fe²⁺")], red: [s("Fe")], n: 2, E0: -0.44, electrode: "Fe", inert: false },
  { id: "ni", label: "Ni²⁺ / Ni", ox: [aq("Ni²⁺")], red: [s("Ni")], n: 2, E0: -0.27, electrode: "Ni", inert: false },
  { id: "sn", label: "Sn²⁺ / Sn", ox: [aq("Sn²⁺")], red: [s("Sn")], n: 2, E0: -0.14, electrode: "Sn", inert: false },
  { id: "pb", label: "Pb²⁺ / Pb", ox: [aq("Pb²⁺")], red: [s("Pb")], n: 2, E0: -0.13, electrode: "Pb", inert: false },
  { id: "h", label: "H⁺ / H₂ (Pt)", ox: [aq("H⁺", 2)], red: [g("H₂")], n: 2, E0: 0, electrode: "Pt", inert: true },
  { id: "cu", label: "Cu²⁺ / Cu", ox: [aq("Cu²⁺")], red: [s("Cu")], n: 2, E0: 0.34, electrode: "Cu", inert: false },
  { id: "fe3", label: "Fe³⁺ / Fe²⁺ (Pt)", ox: [aq("Fe³⁺")], red: [aq("Fe²⁺")], n: 1, E0: 0.77, electrode: "Pt", inert: true },
  { id: "ag", label: "Ag⁺ / Ag", ox: [aq("Ag⁺")], red: [s("Ag")], n: 1, E0: 0.8, electrode: "Ag", inert: false },
];

export function halfCellById(id: string): HalfCell {
  const cell = HALF_CELLS.find((c) => c.id === id);
  if (!cell) throw new Error(`No half-cell "${id}"`);
  return cell;
}

/** The salt bridge's electrolyte: its ions are drawn moving through the bridge. */
export interface Electrolyte {
  id: string;
  formula: string;
  cation: string;
  anion: string;
}

export const ELECTROLYTES: Electrolyte[] = [
  { id: "kno3", formula: "KNO₃", cation: "K⁺", anion: "NO₃⁻" },
  { id: "nano3", formula: "NaNO₃", cation: "Na⁺", anion: "NO₃⁻" },
  { id: "nh4no3", formula: "NH₄NO₃", cation: "NH₄⁺", anion: "NO₃⁻" },
  { id: "kcl", formula: "KCl", cation: "K⁺", anion: "Cl⁻" },
];

export function electrolyteById(id: string): Electrolyte {
  return ELECTROLYTES.find((e) => e.id === id) ?? ELECTROLYTES[0];
}

export type Side = "left" | "right";
export type Role = "anode" | "cathode";

/** Concentrations (mol·dm⁻³) of the aqueous species and pressures (kPa) of the gases, by formula. */
export type Amounts = Record<string, number>;

export interface SideState {
  cell: string;
  amounts: Amounts;
}

export interface CellState {
  left: SideState;
  right: SideState;
  /** Kelvin. */
  temperature: number;
  saltBridge: boolean;
  electrolyte: string;
  /** Big electrodes change nothing about the EMF — the point of offering them. */
  largeElectrodes: boolean;
}

/** The non-solid species of a half-cell: the ones with a concentration or a pressure. */
export function variableTerms(cell: HalfCell): Term[] {
  return [...cell.ox, ...cell.red].filter((t) => t.phase !== "s");
}

/** Standard conditions for a half-cell: 1 mol·dm⁻³, gases at 101,3 kPa. */
export function standardAmounts(cell: HalfCell): Amounts {
  const amounts: Amounts = {};
  for (const t of variableTerms(cell)) amounts[t.formula] = t.phase === "g" ? STANDARD_P : STANDARD_C;
  return amounts;
}

export function sideFor(cellId: string): SideState {
  return { cell: cellId, amounts: standardAmounts(halfCellById(cellId)) };
}

/** The textbook cell: zinc and copper, standard conditions, a KNO₃ salt bridge. */
export const DEFAULT_STATE: CellState = {
  left: sideFor("zn"),
  right: sideFor("cu"),
  temperature: STANDARD_T,
  saltBridge: true,
  electrolyte: "kno3",
  largeElectrodes: false,
};

/**
 * Below this a concentration is treated as zero. It is far below anything a
 * cell reaches: the Nernst equation brings the EMF to zero (equilibrium) long
 * before, even for Mg / Ag.
 */
export const FLOOR = 1e-150;

/** Activity of a species: concentration, pressure over 101,3 kPa, or 1 for a solid. */
export function activity(term: Term, amounts: Amounts): number {
  if (term.phase === "s") return 1;
  const value = amounts[term.formula];
  const safe = Math.max(FLOOR, Number.isFinite(value) ? value : 0);
  return term.phase === "g" ? safe / STANDARD_P : safe;
}

/**
 * The reduction potential of one half-cell at its own concentrations and
 * temperature: E = E° − (RT/nF) ln([red]/[ox]), the Nernst equation applied
 * to the half-reaction. E° is taken as independent of temperature.
 */
export function halfPotential(cell: HalfCell, amounts: Amounts, temperature: number): number {
  let lnQ = 0;
  for (const t of cell.red) lnQ += t.coef * Math.log(activity(t, amounts));
  for (const t of cell.ox) lnQ -= t.coef * Math.log(activity(t, amounts));
  return cell.E0 - ((R * temperature) / (cell.n * F)) * lnQ;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A species in the net equation, remembering which beaker it is in. */
export interface SidedTerm extends Term {
  side: Side;
}

export interface Analysis {
  cathodeSide: Side;
  anodeSide: Side;
  cathode: HalfCell;
  anode: HalfCell;
  /** The cathode under standard conditions, by E° alone — the exam answer. */
  standardCathodeSide: Side;
  /** True when the concentrations have turned the cell round compared to E°. */
  polarityReversed: boolean;
  /** Two identical half-cells at different concentrations. */
  concentrationCell: boolean;
  /** Electrons transferred in the net equation. */
  n: number;
  /** Multipliers for the cathode and anode half-reactions in the net equation. */
  cathodeFactor: number;
  anodeFactor: number;
  reactants: SidedTerm[];
  products: SidedTerm[];
  /** E°cell = E°cathode − E°anode, with the roles as they actually are. */
  E0cell: number;
  /** Reaction quotient of the net equation. */
  Q: number;
  /** The Nernst correction (RT/nF) ln Q, V. */
  correction: number;
  /** The EMF of the cell: E°cell − (RT/nF) ln Q. */
  E: number;
  /** The two half-cells' own potentials. */
  leftPotential: number;
  rightPotential: number;
  /** What the voltmeter shows: 0 without a salt bridge. */
  reading: number;
  /** Whether charge can move: a salt bridge, and an EMF to drive it. */
  running: boolean;
  /** E has fallen to (nearly) zero: the reaction has reached equilibrium. */
  flat: boolean;
  /** Current flowing on a complete circuit, as a fraction of 1,1 V. */
  flow: number;
}

const FLAT_BELOW = 0.0005;

/** Work the whole cell out from its state. */
export function analyse(state: CellState): Analysis {
  const T = state.temperature;
  const left = halfCellById(state.left.cell);
  const right = halfCellById(state.right.cell);
  const leftPotential = halfPotential(left, state.left.amounts, T);
  const rightPotential = halfPotential(right, state.right.amounts, T);
  const concentrationCell = left.id === right.id;

  // The half-cell with the higher potential is reduced: it is the cathode.
  const cathodeSide: Side = rightPotential >= leftPotential ? "right" : "left";
  const anodeSide: Side = cathodeSide === "right" ? "left" : "right";
  const standardCathodeSide: Side =
    right.E0 > left.E0 ? "right" : left.E0 > right.E0 ? "left" : cathodeSide;
  const cathode = cathodeSide === "right" ? right : left;
  const anode = cathodeSide === "right" ? left : right;
  const cathodeAmounts = state[cathodeSide].amounts;
  const anodeAmounts = state[anodeSide].amounts;

  const divisor = gcd(cathode.n, anode.n);
  const cathodeFactor = anode.n / divisor;
  const anodeFactor = cathode.n / divisor;
  const n = cathode.n * cathodeFactor;

  const sided = (terms: Term[], side: Side, factor: number): SidedTerm[] =>
    terms.map((t) => ({ ...t, coef: t.coef * factor, side }));
  const reactants = [...sided(cathode.ox, cathodeSide, cathodeFactor), ...sided(anode.red, anodeSide, anodeFactor)];
  const products = [...sided(cathode.red, cathodeSide, cathodeFactor), ...sided(anode.ox, anodeSide, anodeFactor)];

  const amountsOf = (side: Side) => (side === cathodeSide ? cathodeAmounts : anodeAmounts);
  let lnQ = 0;
  for (const t of products) lnQ += t.coef * Math.log(activity(t, amountsOf(t.side)));
  for (const t of reactants) lnQ -= t.coef * Math.log(activity(t, amountsOf(t.side)));
  const E0cell = cathode.E0 - anode.E0;
  const correction = ((R * T) / (n * F)) * lnQ;
  const E = E0cell - correction;

  const flat = E < FLAT_BELOW;
  const running = state.saltBridge && !flat;
  return {
    cathodeSide,
    anodeSide,
    cathode,
    anode,
    standardCathodeSide,
    polarityReversed: cathodeSide !== standardCathodeSide,
    concentrationCell,
    n,
    cathodeFactor,
    anodeFactor,
    reactants,
    products,
    E0cell,
    Q: Math.exp(lnQ),
    correction,
    E,
    leftPotential,
    rightPotential,
    reading: state.saltBridge ? Math.max(0, E) : 0,
    running,
    flat,
    flow: running ? Math.min(1, Math.max(0.15, E / 1.1)) : 0,
  };
}

/**
 * How fast the cell runs down: mol·dm⁻³ of reaction per second per volt of
 * EMF, as if the external circuit were a fixed resistor (current ∝ EMF). The
 * textbook Zn / Cu cell at ×1 goes flat in about a minute.
 */
export const RUN_RATE = 0.018;
/** The cell never crawls slower than it would at this EMF, so a cell near equilibrium still gets there. */
export const CRAWL_EMF = 0.05;

/**
 * Let the cell run for `seconds`: reactant concentrations fall and product
 * concentrations rise in the ratio of the net equation, until a reactant is
 * used up or the EMF reaches zero (equilibrium, Q = K). Returns the same
 * state when nothing can change.
 */
export function advance(state: CellState, analysis: Analysis, seconds: number, speed = 1): CellState {
  return step(state, analysis, seconds, speed).state;
}

/** As advance(), also saying how far the reaction went (mol·dm⁻³ of the net equation). */
export function step(
  state: CellState,
  analysis: Analysis,
  seconds: number,
  speed = 1,
): { state: CellState; extent: number } {
  if (!analysis.running || seconds <= 0 || speed <= 0) return { state, extent: 0 };
  let extent = RUN_RATE * Math.max(analysis.E, CRAWL_EMF) * speed * seconds;
  const scale = (t: Term) => (t.phase === "g" ? STANDARD_P : 1);
  for (const t of analysis.reactants) {
    if (t.phase === "s") continue;
    const available = (state[t.side].amounts[t.formula] - FLOOR) / (t.coef * scale(t));
    extent = Math.min(extent, Math.max(0, available));
  }
  if (extent <= 0) return { state, extent: 0 };

  const apply = (byExtent: number): CellState => {
    const next: CellState = {
      ...state,
      left: { ...state.left, amounts: { ...state.left.amounts } },
      right: { ...state.right, amounts: { ...state.right.amounts } },
    };
    for (const t of analysis.reactants) {
      if (t.phase === "s") continue;
      next[t.side].amounts[t.formula] = Math.max(FLOOR, next[t.side].amounts[t.formula] - t.coef * scale(t) * byExtent);
    }
    for (const t of analysis.products) {
      if (t.phase === "s") continue;
      next[t.side].amounts[t.formula] = next[t.side].amounts[t.formula] + t.coef * scale(t) * byExtent;
    }
    return next;
  };

  // A whole step can overshoot equilibrium — past it the EMF in this direction
  // is negative and the cell would run backwards. The EMF falls monotonically
  // with the extent, so bisect to the point where it reaches zero and stop
  // there: flat. (analyse() would swap the roles and report it positive, so
  // the EMF is taken with the roles as they are.)
  const emf = (candidate: CellState) =>
    halfPotential(analysis.cathode, candidate[analysis.cathodeSide].amounts, candidate.temperature) -
    halfPotential(analysis.anode, candidate[analysis.anodeSide].amounts, candidate.temperature);
  let next = apply(extent);
  let taken = extent;
  if (emf(next) < 0) {
    let low = 0;
    let high = extent;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const E = emf(apply(mid));
      if (E < 0) high = mid;
      else if (E < FLAT_BELOW / 2) {
        low = mid;
        break;
      } else low = mid;
    }
    next = apply(low);
    taken = low;
  }
  return { state: next, extent: taken };
}

// ---- Words and symbols -----------------------------------------------------

const PHASE_LABEL: Record<Phase, string> = { s: "(s)", aq: "(aq)", g: "(g)" };

/** "2H⁺(aq)". */
export function termText(t: Term, withPhase = true): string {
  return `${t.coef > 1 ? t.coef : ""}${t.formula}${withPhase ? PHASE_LABEL[t.phase] : ""}`;
}

const joinTerms = (terms: Term[]) => terms.map((t) => termText(t)).join(" + ");

/** The reduction half-reaction, times `factor`: "Cu²⁺(aq) + 2e⁻ → Cu(s)". */
export function reductionText(cell: HalfCell, factor = 1): string {
  const times = (terms: Term[]) => terms.map((t) => ({ ...t, coef: t.coef * factor }));
  return `${joinTerms(times(cell.ox))} + ${cell.n * factor}e⁻ → ${joinTerms(times(cell.red))}`;
}

/** The oxidation half-reaction, times `factor`: "Zn(s) → Zn²⁺(aq) + 2e⁻". */
export function oxidationText(cell: HalfCell, factor = 1): string {
  const times = (terms: Term[]) => terms.map((t) => ({ ...t, coef: t.coef * factor }));
  return `${joinTerms(times(cell.red))} → ${joinTerms(times(cell.ox))} + ${cell.n * factor}e⁻`;
}

/** A concentration or pressure the way it is written on the board. */
export function amountText(term: Term, amounts: Amounts): string {
  const value = amounts[term.formula] ?? 0;
  if (term.phase === "g") return `${formatSigFigs(value, 3)} kPa`;
  return `${formatSigFigs(value, 3)} mol·dm⁻³`;
}

/**
 * The net ionic equation. A concentration cell's species would cancel, so
 * it is written with the two concentrations instead.
 */
export function overallText(a: Analysis, state: CellState): string {
  if (a.concentrationCell) {
    const ion = a.cathode.ox[0];
    const from = amountText(ion, state[a.cathodeSide].amounts);
    const to = amountText(ion, state[a.anodeSide].amounts);
    return `${ion.formula}(aq, ${from}) → ${ion.formula}(aq, ${to})`;
  }
  return `${joinTerms(a.reactants)} → ${joinTerms(a.products)}`;
}

/** "[Zn²⁺] / [Cu²⁺]", "[Al³⁺]² / [Cu²⁺]³", "[H⁺]² / (p(H₂)/p°)". */
export function quotientText(a: Analysis): string {
  const factor = (t: SidedTerm) => {
    const base = t.phase === "g" ? `(p(${t.formula})/p°)` : `[${t.formula}]`;
    const sideTag = a.concentrationCell ? (t.side === a.anodeSide ? "anode" : "cathode") : "";
    return `${base}${sideTag}${t.coef > 1 ? superscript(t.coef) : ""}`;
  };
  const inSolutionFirst = (terms: SidedTerm[]) =>
    terms.filter((t) => t.phase !== "s").sort((x, y) => (x.phase === y.phase ? 0 : x.phase === "aq" ? -1 : 1));
  const top = inSolutionFirst(a.products).map(factor);
  const bottom = inSolutionFirst(a.reactants).map(factor);
  const part = (parts: string[]) => (parts.length === 0 ? "1" : parts.join(" × "));
  return `${part(top)} / ${part(bottom)}`;
}

/**
 * One side of the cell notation, from the electrode outwards. Species in the
 * same phase share a comma; a phase boundary gets a bar.
 */
function sideNotation(cell: HalfCell, amounts: Amounts, role: Role, withAmounts: boolean): string {
  const own = (terms: Term[]) => terms.filter((t) => !(t.phase === "s" && t.formula === cell.electrode));
  const outward = [...own(cell.red), ...own(cell.ox)];
  let text = `${cell.electrode}(s)`;
  let previous: Phase = "s";
  for (const t of outward) {
    const label = `${t.formula}${PHASE_LABEL[t.phase]}${withAmounts && t.phase !== "s" ? ` (${amountText(t, amounts)})` : ""}`;
    text += (t.phase === previous ? ", " : " | ") + label;
    previous = t.phase;
  }
  if (role === "anode") return text;
  // The cathode reads inwards: solution first, electrode last.
  return text.split(/( \| |, )/).reverse().join("");
}

/** "Zn(s) | Zn²⁺(aq) (1 mol·dm⁻³) || Cu²⁺(aq) (1 mol·dm⁻³) | Cu(s)". Anode on the left, as the convention has it. */
export function cellNotation(a: Analysis, state: CellState, withAmounts = true): string {
  const anodeText = sideNotation(a.anode, state[a.anodeSide].amounts, "anode", withAmounts);
  const cathodeText = sideNotation(a.cathode, state[a.cathodeSide].amounts, "cathode", withAmounts);
  return `${anodeText} || ${cathodeText}`;
}

/** The sign a side's electrode carries, for a label. */
export function polarity(role: Role): string {
  return role === "cathode" ? "+" : "−";
}

export function roleOf(a: Analysis, side: Side): Role {
  return a.cathodeSide === side ? "cathode" : "anode";
}

/** Volts as the data sheet writes them: "1,10 V". */
export function voltsText(v: number, decimals = 2): string {
  const rounded = Number(v.toFixed(decimals));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${formatFixed(rounded, decimals).replace("-", "−")} V`;
}

/** The coefficient in front of log Q at this temperature: 2,303RT/nF (0,059/n at 298 K). */
export function logCoefficient(temperature: number, n: number): number {
  return (Math.LN10 * R * temperature) / (n * F);
}

/**
 * What a learner is expected to say about this cell, as short points for the
 * memo under the picture.
 */
export function talkingPoints(a: Analysis, state: CellState): string[] {
  const el = electrolyteById(state.electrolyte);
  const cathodeIon = a.cathode.ox.map((t) => t.formula).join(" / ");
  const anodeRed = a.anode.red.map((t) => t.formula).join(" / ");
  const points: string[] = [];
  if (a.concentrationCell) {
    points.push(
      `Both half-cells are ${a.cathode.label}, so E°cell = 0 V. The EMF comes only from the difference in concentration: the more concentrated solution is the cathode and the dilute one the anode, until the two concentrations are equal.`,
    );
  } else {
    points.push(
      `${a.cathode.label} has the higher E° (${voltsText(a.cathode.E0)} against ${voltsText(a.anode.E0)}), so ${cathodeIon} is reduced at the ${a.cathode.electrode} electrode: it is the cathode (+). ${anodeRed} is oxidised at the ${a.anode.electrode} electrode: the anode (−).`,
    );
    points.push(`${cathodeIon} is the stronger oxidising agent; ${anodeRed} is the stronger reducing agent.`);
  }
  if (a.polarityReversed) {
    points.push(
      `At these concentrations the cell runs the other way round from standard conditions: the Nernst correction is bigger than E°cell, so the roles swap and E°cell for the reaction as it runs is ${voltsText(a.E0cell)}.`,
    );
  }
  points.push(`Electrons flow through the wire from the ${a.anode.electrode} electrode (anode) to the ${a.cathode.electrode} electrode (cathode). Conventional current goes the other way.`);
  points.push(
    state.saltBridge
      ? `In the salt bridge, ${el.cation} ions move towards the cathode half-cell and ${el.anion} ions towards the anode half-cell, so each solution stays electrically neutral and the circuit is complete.`
      : `Without the salt bridge the circuit is not complete: charge builds up in each beaker, no current flows and the voltmeter reads 0 V.`,
  );
  const massPoints: string[] = [];
  if (!a.anode.inert) massPoints.push(`the ${a.anode.electrode} anode loses mass as it dissolves`);
  if (!a.cathode.inert) massPoints.push(`the ${a.cathode.electrode} cathode gains mass as ${cathodeIon} is deposited on it`);
  if (massPoints.length) points.push(`As the cell runs, ${massPoints.join(" and ")}.`);
  if (a.anode.inert || a.cathode.inert) {
    points.push(`A platinum electrode is inert: it only conducts electrons and takes no part in the reaction.`);
  }
  const fading = a.reactants.filter((t) => t.phase === "aq" && SOLUTION_TINTS[t.formula]);
  for (const t of fading) points.push(`The ${TINT_NAMES[t.formula]} colour of the ${t.formula} solution fades as it is used up.`);
  points.push(
    a.flat
      ? `The EMF has fallen to 0 V: the reaction has reached equilibrium (Q = K) and the cell is flat.`
      : `As the cell runs, the reactant concentration falls and the product concentration rises, so Q grows and the EMF drops, until the reaction reaches equilibrium (Q = K) and E = 0 V: a flat cell.`,
  );
  points.push(
    `Only the concentrations and the temperature change the EMF. Bigger electrodes or more solution leave the reading as it is; they only let the cell deliver current for longer.`,
  );
  return points;
}

// ---- Colours the picture uses --------------------------------------------

/** Solutions with a colour of their own; everything else is colourless. */
export const SOLUTION_TINTS: Record<string, string> = {
  "Cu²⁺": "#2f86d6",
  "Ni²⁺": "#3ea35a",
  "Fe²⁺": "#9bc98a",
  "Fe³⁺": "#c98a2d",
};

const TINT_NAMES: Record<string, string> = {
  "Cu²⁺": "blue",
  "Ni²⁺": "green",
  "Fe²⁺": "pale green",
  "Fe³⁺": "yellow-brown",
};

export const ELECTRODE_COLOURS: Record<string, string> = {
  Mg: "#a7abb1",
  Al: "#c9ced3",
  Zn: "#8d99a6",
  Fe: "#6c7075",
  Ni: "#b5b9be",
  Sn: "#c3c7cb",
  Pb: "#5e6670",
  Pt: "#c2c8cf",
  Cu: "#c4714e",
  Ag: "#dde1e6",
};

/** The dot colour for an ion in the solution. */
export function ionColour(formula: string): string {
  return SOLUTION_TINTS[formula] ?? "#6b7a8c";
}

export function fileNameFor(a: Analysis): string {
  const slug = (cell: HalfCell) => cell.electrode.toLowerCase() + (cell.inert ? `_${cell.id}` : "");
  return `galvanic_cell_${slug(a.anode)}_${slug(a.cathode)}.png`;
}
