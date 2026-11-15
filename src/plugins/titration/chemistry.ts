// The chemistry of a titration: what is in the flask after any volume from
// the burette, its pH, where the equivalence points fall, and the colour an
// indicator shows. The pH comes from the charge balance of everything in the
// flask, solved by bisection, so strong, weak, polyprotic and mixed cases all
// go through the same arithmetic: no special cases, no "approximation for
// weak acids" that fails near the equivalence point.
//
// SOURCES: pKa values from the CRC Handbook of Chemistry and Physics at
// 25 °C (Ka in the notes as the textbook writes them). Kw = 1,0 × 10⁻¹⁴.
// Indicator ranges and colours from the IEB / DBE data sheet where it lists
// them (methyl orange, bromothymol blue, phenolphthalein) and the CRC
// Handbook for the rest.

import { formatFixed, formatSigFigs, superscript } from "../numbers";

export const KW = 1e-14;

/**
 * One acid–base system in a solute: a species that can carry up to
 * pKa.length protons. z0 is the charge of the fully deprotonated form (Cl⁻:
 * −1, CO₃²⁻: −2, NH₃: 0), so the form with k protons has charge z0 + k.
 */
export interface AcidSystem {
  pKa: number[];
  z0: number;
}

export type SoluteKind = "strong acid" | "weak acid" | "strong base" | "weak base" | "neutral";

export interface Solute {
  id: string;
  formula: string;
  name: string;
  kind: SoluteKind;
  /** Charge of the spectator cations per formula unit (Na⁺: 1; Ba²⁺: 2; none for HCl or NH₃). */
  cations: number;
  /** Acid–base systems per formula unit (an empty list for NaOH or water). */
  systems: AcidSystem[];
  /** Protons it can give (acids) or accept (bases) per formula unit, for the equivalence points. */
  equivalents: number;
  /** Solubility limit at 25 °C, mol·dm⁻³, for the sparingly soluble hydroxides. */
  solubility?: number;
  notes: string;
}

const strongAcid = (id: string, formula: string, name: string, notes: string): Solute => ({
  id,
  formula,
  name,
  kind: "strong acid",
  cations: 0,
  systems: [{ pKa: [-7], z0: -1 }],
  equivalents: 1,
  notes,
});

export const SOLUTES: Solute[] = [
  strongAcid("hcl", "HCl", "Hydrochloric acid", "Strong monoprotic acid: completely ionised in water."),
  strongAcid("hno3", "HNO₃", "Nitric acid", "Strong monoprotic acid: completely ionised in water."),
  {
    id: "h2so4",
    formula: "H₂SO₄",
    name: "Sulfuric acid",
    kind: "strong acid",
    cations: 0,
    systems: [{ pKa: [-3, 1.99], z0: -2 }],
    equivalents: 2,
    notes: "Diprotic. The first proton is fully ionised; the second (HSO₄⁻, Ka = 1,0 × 10⁻²) is a weak acid, but in a titration both are neutralised, so 1 mol H₂SO₄ needs 2 mol NaOH.",
  },
  {
    id: "hf",
    formula: "HF",
    name: "Hydrofluoric acid",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [3.17], z0: -1 }],
    equivalents: 1,
    notes: "Weak monoprotic acid, Ka = 6,8 × 10⁻⁴. Weak, but it etches glass.",
  },
  {
    id: "ch3cooh",
    formula: "CH₃COOH",
    name: "Ethanoic (acetic) acid",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [4.76], z0: -1 }],
    equivalents: 1,
    notes: "Weak monoprotic acid, Ka = 1,8 × 10⁻⁵: vinegar. Equivalence with a strong base is above 7, so phenolphthalein is the indicator.",
  },
  {
    id: "hcooh",
    formula: "HCOOH",
    name: "Methanoic (formic) acid",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [3.75], z0: -1 }],
    equivalents: 1,
    notes: "Weak monoprotic acid, Ka = 1,8 × 10⁻⁴; ant stings.",
  },
  {
    id: "oxalic",
    formula: "H₂C₂O₄",
    name: "Oxalic (ethanedioic) acid",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [1.25, 4.27], z0: -2 }],
    equivalents: 2,
    notes: "Diprotic weak acid, Ka₁ = 5,6 × 10⁻², Ka₂ = 5,4 × 10⁻⁵. The primary standard for standardising NaOH; 1 mol needs 2 mol NaOH.",
  },
  {
    id: "h3po4",
    formula: "H₃PO₄",
    name: "Phosphoric acid",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [2.15, 7.2, 12.35], z0: -3 }],
    equivalents: 3,
    notes: "Triprotic weak acid, Ka₁ = 7,1 × 10⁻³, Ka₂ = 6,3 × 10⁻⁸, Ka₃ = 4,5 × 10⁻¹³. Two clear equivalence points; the third proton is too weak to titrate.",
  },
  {
    id: "h2co3",
    formula: "H₂CO₃",
    name: "Carbonic acid (CO₂ in water)",
    kind: "weak acid",
    cations: 0,
    systems: [{ pKa: [6.35, 10.33], z0: -2 }],
    equivalents: 2,
    notes: "Diprotic weak acid, Ka₁ = 4,5 × 10⁻⁷, Ka₂ = 4,7 × 10⁻¹¹: soda water, rain.",
  },
  {
    id: "naoh",
    formula: "NaOH",
    name: "Sodium hydroxide",
    kind: "strong base",
    cations: 1,
    systems: [],
    equivalents: 1,
    notes: "Strong base: completely dissociated into Na⁺ and OH⁻. Absorbs CO₂ from the air, so it is standardised against oxalic acid.",
  },
  {
    id: "koh",
    formula: "KOH",
    name: "Potassium hydroxide",
    kind: "strong base",
    cations: 1,
    systems: [],
    equivalents: 1,
    notes: "Strong base: completely dissociated into K⁺ and OH⁻.",
  },
  {
    id: "baoh2",
    formula: "Ba(OH)₂",
    name: "Barium hydroxide",
    kind: "strong base",
    cations: 2,
    systems: [],
    equivalents: 2,
    solubility: 0.1,
    notes: "Strong base giving 2 OH⁻ per formula unit, so 1 mol neutralises 2 mol HCl. Soluble up to about 0,1 mol·dm⁻³.",
  },
  {
    id: "caoh2",
    formula: "Ca(OH)₂",
    name: "Calcium hydroxide (limewater)",
    kind: "strong base",
    cations: 2,
    systems: [],
    equivalents: 2,
    solubility: 0.02,
    notes: "Strong base, 2 OH⁻ per formula unit, but only about 0,02 mol·dm⁻³ dissolves: saturated limewater. Above that it is a suspension (the simulation treats it as dissolved).",
  },
  {
    id: "mgoh2",
    formula: "Mg(OH)₂",
    name: "Magnesium hydroxide",
    kind: "strong base",
    cations: 2,
    systems: [],
    equivalents: 2,
    solubility: 0.00016,
    notes: "What dissolves is fully dissociated (2 OH⁻ per formula unit), but only about 1,6 × 10⁻⁴ mol·dm⁻³ does: milk of magnesia is a suspension, which is why it is a safe antacid. Above the solubility the simulation treats it as if dissolved.",
  },
  {
    id: "nh3",
    formula: "NH₃",
    name: "Ammonia",
    kind: "weak base",
    cations: 0,
    systems: [{ pKa: [9.25], z0: 0 }],
    equivalents: 1,
    notes: "Weak base, Kb = 1,8 × 10⁻⁵ (NH₄⁺ has Ka = 5,6 × 10⁻¹⁰). Equivalence with a strong acid is below 7, so methyl orange is the indicator.",
  },
  {
    id: "na2co3",
    formula: "Na₂CO₃",
    name: "Sodium carbonate",
    kind: "weak base",
    cations: 2,
    systems: [{ pKa: [6.35, 10.33], z0: -2 }],
    equivalents: 2,
    notes: "Weak diprotic base (Kb₁ = 2,1 × 10⁻⁴): accepts two protons. Two equivalence points against a strong acid, at about pH 8,3 (phenolphthalein) and pH 3,9 (methyl orange). Washing soda; a primary standard for acids.",
  },
  {
    id: "nahco3",
    formula: "NaHCO₃",
    name: "Sodium hydrogen carbonate",
    kind: "weak base",
    cations: 1,
    systems: [{ pKa: [6.35, 10.33], z0: -2 }],
    equivalents: 1,
    notes: "Amphiprotic, but titrated as a weak base accepting one proton (equivalence near pH 3,9). Baking soda; antacid.",
  },
  {
    id: "h2o",
    formula: "H₂O",
    name: "Water",
    kind: "neutral",
    cations: 0,
    systems: [],
    equivalents: 0,
    notes: "Pure water, pH 7: adding it only dilutes what is in the flask.",
  },
];

export function soluteById(id: string): Solute {
  const s = SOLUTES.find((x) => x.id === id);
  if (!s) throw new Error(`No solute "${id}"`);
  return s;
}

export const isAcid = (s: Solute) => s.kind === "strong acid" || s.kind === "weak acid";
export const isBase = (s: Solute) => s.kind === "strong base" || s.kind === "weak base";

/** A solution: what, how concentrated (mol·dm⁻³), how much (cm³). */
export interface Portion {
  solute: Solute;
  concentration: number;
  volume: number;
}

/**
 * Fractions of a system's forms at a pH: index k is the form with k protons
 * (0 = fully deprotonated). Computed in logs so pKa 12 and pH 1 don't
 * overflow.
 */
export function fractions(system: AcidSystem, pH: number): number[] {
  const n = system.pKa.length;
  // log10 of the (unnormalised) weight of the form with k protons, relative to the fully deprotonated form.
  const logs: number[] = [0];
  for (let k = 1; k <= n; k++) {
    // Adding the k-th proton uses the k-th pKa counted from the fully protonated end.
    const pKa = system.pKa[n - k];
    logs.push(logs[k - 1] + (pKa - pH));
  }
  const top = Math.max(...logs);
  const weights = logs.map((l) => 10 ** (l - top));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

/** The average charge carried by one formula unit's systems at a pH. */
function systemCharge(system: AcidSystem, pH: number): number {
  return fractions(system, pH).reduce((sum, f, k) => sum + f * (system.z0 + k), 0);
}

/** Everything in the flask, as mol·dm⁻³ of each solute in the total volume. */
export interface Mixture {
  totalVolume: number;
  parts: Array<{ solute: Solute; concentration: number }>;
}

export function mix(portions: Portion[]): Mixture {
  const totalVolume = portions.reduce((v, p) => v + p.volume, 0);
  const byId = new Map<string, { solute: Solute; moles: number }>();
  for (const p of portions) {
    if (p.volume <= 0) continue;
    const entry = byId.get(p.solute.id) ?? { solute: p.solute, moles: 0 };
    entry.moles += p.concentration * p.volume;
    byId.set(p.solute.id, entry);
  }
  return {
    totalVolume,
    parts: totalVolume > 0 ? [...byId.values()].map((e) => ({ solute: e.solute, concentration: e.moles / totalVolume })) : [],
  };
}

/**
 * The pH of a mixture from its charge balance:
 * [H⁺] + Σ cations − [OH⁻] + Σ (concentration × average charge of each system) = 0.
 * The left side falls monotonically with pH, so bisection finds the root.
 */
export function pHOf(mixture: Mixture): number {
  const balance = (pH: number) => {
    const h = 10 ** -pH;
    let total = h - KW / h;
    for (const part of mixture.parts) {
      if (part.concentration <= 0) continue;
      total += part.concentration * part.solute.cations;
      for (const system of part.solute.systems) total += part.concentration * systemCharge(system, pH);
    }
    return total;
  };
  let low = -2;
  let high = 16;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (balance(mid) > 0) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export interface Setup {
  burette: { solute: Solute; concentration: number };
  flask: { solute: Solute; concentration: number; volume: number };
}

/** The flask's contents after `added` cm³ from the burette. */
export function flaskAfter(setup: Setup, added: number): Mixture {
  return mix([
    { solute: setup.flask.solute, concentration: setup.flask.concentration, volume: setup.flask.volume },
    { solute: setup.burette.solute, concentration: setup.burette.concentration, volume: added },
  ]);
}

export function pHAfter(setup: Setup, added: number): number {
  return pHOf(flaskAfter(setup, added));
}

export interface EquivalencePoint {
  /** 1 for the first proton (or hydroxide), 2 for the second… */
  step: number;
  volume: number;
  pH: number;
}

/**
 * Where the equivalence points fall: the volume from the burette that
 * supplies k equivalents for every formula unit in the flask, k up to the
 * flask solute's equivalents (an acid against a base) or the burette's
 * equivalents (a base in the burette, several OH⁻ per unit, still one point
 * per proton of the flask acid). No points when both are acids, both bases,
 * or one is water.
 */
export function equivalencePoints(setup: Setup): EquivalencePoint[] {
  const a = setup.flask.solute;
  const b = setup.burette.solute;
  const neutralising = (isAcid(a) && isBase(b)) || (isBase(a) && isAcid(b));
  if (!neutralising || setup.burette.concentration <= 0 || setup.flask.concentration <= 0) return [];
  const molesInFlask = setup.flask.concentration * setup.flask.volume; // mmol
  const points: EquivalencePoint[] = [];
  for (let step = 1; step <= a.equivalents; step++) {
    const volume = (step * molesInFlask) / (setup.burette.concentration * b.equivalents);
    points.push({ step, volume, pH: pHAfter(setup, volume) });
  }
  return points;
}

/** The pH curve from 0 to `maxVolume` cm³ in `stepVolume` steps, for the graph. */
export function curve(setup: Setup, maxVolume: number, stepVolume = 0.1): Array<{ volume: number; pH: number }> {
  const out: Array<{ volume: number; pH: number }> = [];
  for (let v = 0; v <= maxVolume + 1e-9; v += stepVolume) out.push({ volume: Number(v.toFixed(3)), pH: pHAfter(setup, v) });
  return out;
}

// ---- Indicators ------------------------------------------------------------

export interface Indicator {
  id: string;
  name: string;
  /** The pH range over which the colour changes. */
  low: number;
  high: number;
  /** Colour of the acid form and the base form. */
  acidColour: string;
  baseColour: string;
  acidName: string;
  baseName: string;
}

export const INDICATORS: Indicator[] = [
  { id: "methyl-orange", name: "Methyl orange", low: 3.1, high: 4.4, acidColour: "#e4403a", baseColour: "#f4c430", acidName: "red", baseName: "yellow" },
  { id: "bromocresol-green", name: "Bromocresol green", low: 3.8, high: 5.4, acidColour: "#f4d03f", baseColour: "#2b6cb0", acidName: "yellow", baseName: "blue" },
  { id: "methyl-red", name: "Methyl red", low: 4.4, high: 6.2, acidColour: "#d7263d", baseColour: "#f1d302", acidName: "red", baseName: "yellow" },
  { id: "litmus", name: "Litmus", low: 5.0, high: 8.0, acidColour: "#d64550", baseColour: "#3b5bdb", acidName: "red", baseName: "blue" },
  { id: "bromothymol-blue", name: "Bromothymol blue", low: 6.0, high: 7.6, acidColour: "#f2d94e", baseColour: "#1f5fbf", acidName: "yellow", baseName: "blue" },
  { id: "phenol-red", name: "Phenol red", low: 6.8, high: 8.4, acidColour: "#f1c40f", baseColour: "#d7263d", acidName: "yellow", baseName: "red" },
  { id: "phenolphthalein", name: "Phenolphthalein", low: 8.2, high: 10.0, acidColour: "#ffffff", baseColour: "#e3399a", acidName: "colourless", baseName: "pink" },
];

export function indicatorById(id: string): Indicator | undefined {
  return INDICATORS.find((i) => i.id === id);
}

/** Universal indicator's scale, red through violet. */
const UNIVERSAL: Array<[number, string]> = [
  [0, "#c0392b"],
  [2, "#e74c3c"],
  [4, "#f39c12"],
  [5, "#f1c40f"],
  [6, "#d4e157"],
  [7, "#27ae60"],
  [8, "#1abc9c"],
  [9, "#2980b9"],
  [11, "#5b3fa0"],
  [14, "#4a235a"],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function mixColours(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/**
 * The colour an indicator shows at a pH: the base form's fraction follows
 * the Henderson–Hasselbalch curve about the middle of its range, and the two
 * colours are mixed in that ratio. `null` for no indicator, "universal" for
 * the universal scale.
 */
export function indicatorColour(indicatorId: string | null, pH: number): string | null {
  if (!indicatorId) return null;
  if (indicatorId === "universal") {
    for (let i = 1; i < UNIVERSAL.length; i++) {
      const [p0, c0] = UNIVERSAL[i - 1];
      const [p1, c1] = UNIVERSAL[i];
      if (pH <= p1) return mixColours(c0, c1, Math.max(0, Math.min(1, (pH - p0) / (p1 - p0))));
    }
    return UNIVERSAL[UNIVERSAL.length - 1][1];
  }
  const ind = indicatorById(indicatorId);
  if (!ind) return null;
  const pK = (ind.low + ind.high) / 2;
  // The range is where the ratio runs about 1:10 to 10:1; scale so the ends of the range are ~9 % and 91 %.
  const width = (ind.high - ind.low) / 2;
  const t = 1 / (1 + 10 ** (-(pH - pK) / width));
  return mixColours(ind.acidColour, ind.baseColour, t);
}

/** Indicators whose range brackets a pH — the ones that would show this equivalence point. */
export function suitableIndicators(pH: number): Indicator[] {
  return INDICATORS.filter((i) => pH >= i.low - 0.3 && pH <= i.high + 0.3);
}

// ---- Words -----------------------------------------------------------------

/** "0,1 mol·dm⁻³" */
export function concentrationText(c: number): string {
  return `${formatSigFigs(c, 3)} mol·dm⁻³`;
}

/** "25,00 cm³" — a burette reads to two decimals. */
export function volumeText(v: number, decimals = 2): string {
  return `${formatFixed(v, decimals)} cm³`;
}

/** "[H₃O⁺] = 1,0 × 10⁻³ mol·dm⁻³" style: a concentration from a pH. */
export function concentrationFromPH(pH: number): string {
  const c = 10 ** -pH;
  let exponent = Math.floor(Math.log10(c));
  let mantissa = Number((c / 10 ** exponent).toFixed(1));
  if (mantissa >= 10) {
    mantissa = 1;
    exponent += 1;
  }
  return `${formatFixed(mantissa, 1)} × 10${superscript(exponent)} mol·dm⁻³`;
}

/** What the class is to calculate: the relation at the equivalence point, in words. */
export function equivalenceRelation(setup: Setup): string {
  const a = setup.flask.solute;
  const b = setup.burette.solute;
  if (!((isAcid(a) && isBase(b)) || (isBase(a) && isAcid(b)))) return "No neutralisation: the two solutions are not an acid and a base.";
  const acid = isAcid(a) ? a : b;
  const base = isAcid(a) ? b : a;
  return `n(${acid.formula}) : n(${base.formula}) = ${base.equivalents} : ${acid.equivalents}, so c₁V₁ / ${base.equivalents} = c₂V₂ / ${acid.equivalents} (1 = acid, 2 = base)`;
}
