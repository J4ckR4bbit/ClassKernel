// The chemistry of an electrolytic cell, the way the Grade 12 course asks it:
// what is in the cell, which species is reduced at the cathode and which is
// oxidised at the anode (by the standard electrode potentials, with the usual
// exception for a concentrated chloride solution), the half-reactions and the
// net equation, the least voltage the supply must give, and Faraday's law —
// how much metal is plated and how much gas is given off for a current and a
// time. The view only draws what this works out, so it is tested without a
// browser.
//
// Conventions follow the data sheet: E° values are standard reduction
// potentials at 298 K; F = 96 500 C·mol⁻¹ (as the galvanic cell uses);
// Vm = 22,4 dm³·mol⁻¹ at STP; molar masses as on the periodic table.

import { formatFixed, formatSigFigs } from "../numbers";
import { F, voltsText } from "../galvanic-cell/cell";

export { F, voltsText };

/** Molar gas volume at STP, dm³·mol⁻¹. */
export const VM = 22.4;
/** The solution in the beaker, dm³ (250 cm³). */
export const VOLUME = 0.25;
/**
 * At or above this chloride concentration (mol·dm⁻³) Cl⁻ is oxidised in
 * preference to water, although water's E° is lower: oxygen is slow to form
 * at the electrode (its overpotential). Below it, the solution counts as
 * dilute and oxygen forms instead — what the textbooks say for "dilute" and
 * "concentrated" sodium chloride.
 */
export const CHLORIDE_CONCENTRATED = 0.5;
/** Grams of an active anode under the solution: when it has all dissolved the circuit is broken. */
export const ANODE_MASS = 10;
/** A melt never runs short in a lesson: its ions are counted as this many moles. */
export const MELT_POOL = 1e6;
/** Below this (mol) a species is used up. */
export const GONE = 1e-9;

export type Phase = "s" | "l" | "g" | "aq";

export interface Term {
  formula: string;
  coef: number;
  phase: Phase;
}

/** A half-reaction from the table, written as a reduction: ox + n e⁻ → red. */
export interface Couple {
  id: string;
  ox: Term[];
  red: Term[];
  n: number;
  E0: number;
}

const s = (formula: string, coef = 1): Term => ({ formula, coef, phase: "s" });
const l = (formula: string, coef = 1): Term => ({ formula, coef, phase: "l" });
const aq = (formula: string, coef = 1): Term => ({ formula, coef, phase: "aq" });
const g = (formula: string, coef = 1): Term => ({ formula, coef, phase: "g" });

/** The half-reactions that can happen in these cells, from the table of standard reduction potentials. */
export const COUPLES: Record<string, Couple> = {
  K: { id: "K", ox: [aq("K⁺")], red: [s("K")], n: 1, E0: -2.93 },
  Na: { id: "Na", ox: [aq("Na⁺")], red: [s("Na")], n: 1, E0: -2.71 },
  "H2O-red": { id: "H2O-red", ox: [l("H₂O", 2)], red: [g("H₂"), aq("OH⁻", 2)], n: 2, E0: -0.83 },
  Zn: { id: "Zn", ox: [aq("Zn²⁺")], red: [s("Zn")], n: 2, E0: -0.76 },
  Fe: { id: "Fe", ox: [aq("Fe²⁺")], red: [s("Fe")], n: 2, E0: -0.44 },
  Ni: { id: "Ni", ox: [aq("Ni²⁺")], red: [s("Ni")], n: 2, E0: -0.27 },
  Pb: { id: "Pb", ox: [aq("Pb²⁺")], red: [s("Pb")], n: 2, E0: -0.13 },
  H: { id: "H", ox: [aq("H⁺", 2)], red: [g("H₂")], n: 2, E0: 0 },
  Cu: { id: "Cu", ox: [aq("Cu²⁺")], red: [s("Cu")], n: 2, E0: 0.34 },
  I2: { id: "I2", ox: [aq("I₂")], red: [aq("I⁻", 2)], n: 2, E0: 0.54 },
  Ag: { id: "Ag", ox: [aq("Ag⁺")], red: [s("Ag")], n: 1, E0: 0.8 },
  Br2: { id: "Br2", ox: [l("Br₂")], red: [aq("Br⁻", 2)], n: 2, E0: 1.07 },
  "H2O-ox": { id: "H2O-ox", ox: [g("O₂"), aq("H⁺", 4)], red: [l("H₂O", 2)], n: 4, E0: 1.23 },
  Cl2: { id: "Cl2", ox: [g("Cl₂")], red: [aq("Cl⁻", 2)], n: 2, E0: 1.36 },
  Au: { id: "Au", ox: [aq("Au³⁺")], red: [s("Au")], n: 3, E0: 1.5 },
};

/** Which couple reduces a cation, and which oxidises an anion. */
const CATION_COUPLE: Record<string, string> = {
  "K⁺": "K",
  "Na⁺": "Na",
  "Zn²⁺": "Zn",
  "Fe²⁺": "Fe",
  "Ni²⁺": "Ni",
  "Pb²⁺": "Pb",
  "H⁺": "H",
  "Cu²⁺": "Cu",
  "Ag⁺": "Ag",
  "Au³⁺": "Au",
};
const ANION_COUPLE: Record<string, string> = { "Cl⁻": "Cl2", "Br⁻": "Br2", "I⁻": "I2" };

/** Molar masses, g·mol⁻¹, as on the data sheet's periodic table. */
export const MOLAR_MASS: Record<string, number> = {
  Cu: 63.5,
  Ag: 108,
  Ni: 59,
  Zn: 65,
  Fe: 56,
  Au: 197,
  Pb: 207,
  Na: 23,
  K: 39,
  "H₂": 2,
  "O₂": 32,
  "Cl₂": 71,
  "Br₂": 160,
  "I₂": 254,
};

export interface Metal {
  symbol: string;
  name: string;
  ion: string;
  couple: string;
  colour: string;
}

export const METALS: Record<string, Metal> = {
  Cu: { symbol: "Cu", name: "copper", ion: "Cu²⁺", couple: "Cu", colour: "#c4714e" },
  Ag: { symbol: "Ag", name: "silver", ion: "Ag⁺", couple: "Ag", colour: "#dde1e6" },
  Ni: { symbol: "Ni", name: "nickel", ion: "Ni²⁺", couple: "Ni", colour: "#b5b9be" },
  Zn: { symbol: "Zn", name: "zinc", ion: "Zn²⁺", couple: "Zn", colour: "#8d99a6" },
  Fe: { symbol: "Fe", name: "iron", ion: "Fe²⁺", couple: "Fe", colour: "#6c7075" },
  Au: { symbol: "Au", name: "gold", ion: "Au³⁺", couple: "Au", colour: "#d4af37" },
  Pb: { symbol: "Pb", name: "lead", ion: "Pb²⁺", couple: "Pb", colour: "#5e6670" },
  Na: { symbol: "Na", name: "sodium", ion: "Na⁺", couple: "Na", colour: "#d8dde2" },
  K: { symbol: "K", name: "potassium", ion: "K⁺", couple: "K", colour: "#d8dde2" },
};

// ---- What goes in the cell -------------------------------------------------

export interface Electrolyte {
  id: string;
  /** "Copper(II) chloride solution". */
  name: string;
  /** "CuCl₂". */
  formula: string;
  molten: boolean;
  /** Ions per formula unit. */
  ions: Array<{ formula: string; per: number }>;
  defaultConcentration: number;
  maxConcentration: number;
  /** "about 800 °C", for a melt. */
  temperature?: string;
}

export const ELECTROLYTES: Electrolyte[] = [
  { id: "cucl2", name: "Copper(II) chloride solution", formula: "CuCl₂", molten: false, ions: [{ formula: "Cu²⁺", per: 1 }, { formula: "Cl⁻", per: 2 }], defaultConcentration: 1, maxConcentration: 2 },
  { id: "cuso4", name: "Copper(II) sulfate solution", formula: "CuSO₄", molten: false, ions: [{ formula: "Cu²⁺", per: 1 }, { formula: "SO₄²⁻", per: 1 }], defaultConcentration: 1, maxConcentration: 1.5 },
  { id: "nacl", name: "Sodium chloride solution", formula: "NaCl", molten: false, ions: [{ formula: "Na⁺", per: 1 }, { formula: "Cl⁻", per: 1 }], defaultConcentration: 1, maxConcentration: 6 },
  { id: "ki", name: "Potassium iodide solution", formula: "KI", molten: false, ions: [{ formula: "K⁺", per: 1 }, { formula: "I⁻", per: 1 }], defaultConcentration: 1, maxConcentration: 2 },
  { id: "h2so4", name: "Dilute sulfuric acid (acidified water)", formula: "H₂SO₄", molten: false, ions: [{ formula: "H⁺", per: 2 }, { formula: "SO₄²⁻", per: 1 }], defaultConcentration: 0.5, maxConcentration: 1 },
  { id: "agno3", name: "Silver nitrate solution", formula: "AgNO₃", molten: false, ions: [{ formula: "Ag⁺", per: 1 }, { formula: "NO₃⁻", per: 1 }], defaultConcentration: 0.5, maxConcentration: 1 },
  { id: "niso4", name: "Nickel(II) sulfate solution", formula: "NiSO₄", molten: false, ions: [{ formula: "Ni²⁺", per: 1 }, { formula: "SO₄²⁻", per: 1 }], defaultConcentration: 1, maxConcentration: 1.5 },
  { id: "nacl-l", name: "Molten sodium chloride", formula: "NaCl", molten: true, ions: [{ formula: "Na⁺", per: 1 }, { formula: "Cl⁻", per: 1 }], defaultConcentration: 1, maxConcentration: 1, temperature: "about 800 °C" },
  { id: "pbbr2-l", name: "Molten lead(II) bromide", formula: "PbBr₂", molten: true, ions: [{ formula: "Pb²⁺", per: 1 }, { formula: "Br⁻", per: 2 }], defaultConcentration: 1, maxConcentration: 1, temperature: "about 400 °C" },
];

export function electrolyteById(id: string): Electrolyte {
  return ELECTROLYTES.find((e) => e.id === id) ?? ELECTROLYTES[0];
}

export interface Material {
  id: string;
  name: string;
  /** What the picture writes beside it: "C", "Cu". */
  symbol: string;
  /** Carbon and platinum only conduct; they never react. */
  inert: boolean;
  /** Fraction of each metal by mass, for an electrode that can be oxidised. */
  composition: Record<string, number>;
  colour: string;
  shape: "plate" | "spoon";
}

export const MATERIALS: Material[] = [
  { id: "c", name: "Carbon (graphite)", symbol: "C", inert: true, composition: {}, colour: "#3d4248", shape: "plate" },
  { id: "pt", name: "Platinum", symbol: "Pt", inert: true, composition: {}, colour: "#c2c8cf", shape: "plate" },
  { id: "cu", name: "Copper (pure)", symbol: "Cu", inert: false, composition: { Cu: 1 }, colour: "#c4714e", shape: "plate" },
  {
    id: "cu-impure",
    name: "Impure copper",
    symbol: "Cu",
    inert: false,
    composition: { Cu: 0.95, Zn: 0.02, Fe: 0.01, Ag: 0.015, Au: 0.005 },
    colour: "#8f5a40",
    shape: "plate",
  },
  { id: "ag", name: "Silver", symbol: "Ag", inert: false, composition: { Ag: 1 }, colour: "#dde1e6", shape: "plate" },
  { id: "ni", name: "Nickel", symbol: "Ni", inert: false, composition: { Ni: 1 }, colour: "#b5b9be", shape: "plate" },
  { id: "fe", name: "Iron (steel)", symbol: "Fe", inert: false, composition: { Fe: 1 }, colour: "#6c7075", shape: "plate" },
  { id: "spoon", name: "Iron spoon", symbol: "Fe", inert: false, composition: { Fe: 1 }, colour: "#6c7075", shape: "spoon" },
];

export function materialById(id: string): Material {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}

/** The metal an active electrode is mostly made of. */
export function mainMetal(material: Material): string | null {
  let best: string | null = null;
  for (const [metal, fraction] of Object.entries(material.composition)) {
    if (best === null || fraction > material.composition[best]) best = metal;
  }
  return best;
}

/** How the cell is set up. Changing any of it starts the run again. */
export interface Setup {
  electrolyte: string;
  /** mol·dm⁻³ of the salt (or acid) at the start; ignored for a melt. */
  concentration: number;
  /** The electrode joined to the positive terminal. */
  anode: string;
  /** The electrode joined to the negative terminal. */
  cathode: string;
  /** A membrane between the electrodes (the chlor-alkali cell). */
  membrane: boolean;
  /** Collect the gases in tubes over the electrodes, to compare their volumes. */
  collectGas: boolean;
}

export interface Preset {
  id: string;
  name: string;
  setup: Setup;
}

const setup = (electrolyte: string, concentration: number, anode: string, cathode: string, extra: Partial<Setup> = {}): Setup => ({
  electrolyte,
  concentration,
  anode,
  cathode,
  membrane: false,
  collectGas: false,
  ...extra,
});

/** The set-ups the course keeps meeting. */
export const PRESETS: Preset[] = [
  { id: "cucl2", name: "CuCl₂(aq), carbon electrodes", setup: setup("cucl2", 1, "c", "c") },
  { id: "cuso4-c", name: "CuSO₄(aq), carbon electrodes", setup: setup("cuso4", 1, "c", "c") },
  { id: "cuso4-cu", name: "CuSO₄(aq), copper electrodes", setup: setup("cuso4", 1, "cu", "cu") },
  { id: "refining", name: "Refining impure copper", setup: setup("cuso4", 1, "cu-impure", "cu") },
  { id: "plate-cu", name: "Copper-plating a spoon", setup: setup("cuso4", 1, "cu", "spoon") },
  { id: "plate-ag", name: "Silver-plating a spoon", setup: setup("agno3", 0.5, "ag", "spoon") },
  { id: "plate-ni", name: "Nickel-plating a spoon", setup: setup("niso4", 1, "ni", "spoon") },
  { id: "brine", name: "Brine: the chlor-alkali membrane cell", setup: setup("nacl", 5, "c", "fe", { membrane: true }) },
  { id: "nacl-dilute", name: "Dilute NaCl(aq), carbon electrodes", setup: setup("nacl", 0.1, "c", "c") },
  { id: "water", name: "Acidified water, gases collected", setup: setup("h2so4", 0.5, "pt", "pt", { collectGas: true }) },
  { id: "ki", name: "KI(aq), carbon electrodes", setup: setup("ki", 1, "c", "c") },
  { id: "nacl-molten", name: "Molten NaCl (Downs cell)", setup: setup("nacl-l", 1, "c", "fe") },
  { id: "pbbr2-molten", name: "Molten PbBr₂, carbon electrodes", setup: setup("pbbr2-l", 1, "c", "c") },
];

export const DEFAULT_SETUP: Setup = PRESETS[0].setup;

/** The preset a set-up matches exactly, if any. */
export function presetFor(current: Setup): Preset | undefined {
  return PRESETS.find((p) => (Object.keys(p.setup) as Array<keyof Setup>).every((k) => p.setup[k] === current[k]));
}

// ---- The run ---------------------------------------------------------------

/** How far the cell has run: everything that changes as charge passes. */
export interface Progress {
  /** Seconds since the start. */
  time: number;
  /** Coulombs passed. */
  charge: number;
  /** Moles of each ion in the electrolyte. */
  moles: Record<string, number>;
  /** Grams of an active anode still under the solution. */
  anodeLeft: number;
  /** Grams of each metal deposited at the cathode. */
  plated: Record<string, number>;
  /** Grams of each metal fallen from the anode as sludge. */
  sludge: Record<string, number>;
  /** Moles of electrons through each half-reaction, keyed "cathode:Cu", "anode:Cl2", "anode:metal". */
  electrons: Record<string, number>;
  /** The current was changed during the run, so Q ≠ It. */
  currentChanged: boolean;
  /** Why the cell stopped by itself. */
  stopped: "" | "anode-gone";
}

export function freshProgress(current: Setup): Progress {
  const el = electrolyteById(current.electrolyte);
  const moles: Record<string, number> = {};
  for (const ion of el.ions) moles[ion.formula] = el.molten ? MELT_POOL : current.concentration * ion.per * VOLUME;
  const anode = materialById(current.anode);
  return {
    time: 0,
    charge: 0,
    moles,
    anodeLeft: anode.inert ? 0 : ANODE_MASS,
    plated: {},
    sludge: {},
    electrons: {},
    currentChanged: false,
    stopped: "",
  };
}

/** mol·dm⁻³ of an ion now. */
export function concentrationOf(progress: Progress, formula: string): number {
  return (progress.moles[formula] ?? 0) / VOLUME;
}

export interface Candidate {
  /** What is reduced or oxidised, as the memo names it: "Cu²⁺", "H₂O", "Cl⁻", "Cu (the anode)". */
  agent: string;
  couple: Couple;
  /** The anode itself dissolving. */
  electrode: boolean;
}

/** Electrons (mol) an active anode gives per gram dissolved; its less reactive metals fall off as sludge. */
function electronsPerGram(material: Material): number {
  const main = mainMetal(material);
  if (!main) return 0;
  const mainE0 = COUPLES[METALS[main].couple].E0;
  let perGram = 0;
  for (const [metal, fraction] of Object.entries(material.composition)) {
    const couple = COUPLES[METALS[metal].couple];
    if (couple.E0 <= mainE0) perGram += (fraction * couple.n) / MOLAR_MASS[metal];
  }
  return perGram;
}

/** Everything that could be reduced at the cathode, the strongest oxidising agent (highest E°) first. */
export function cathodeCandidates(current: Setup, progress: Progress): Candidate[] {
  const el = electrolyteById(current.electrolyte);
  const list: Candidate[] = [];
  for (const [formula, amount] of Object.entries(progress.moles)) {
    const id = CATION_COUPLE[formula];
    if (id && amount > GONE) list.push({ agent: formula, couple: COUPLES[id], electrode: false });
  }
  if (!el.molten) list.push({ agent: "H₂O", couple: COUPLES["H2O-red"], electrode: false });
  return list.sort((a, b) => b.couple.E0 - a.couple.E0);
}

/**
 * Everything that could be oxidised at the anode, the strongest reducing agent
 * (lowest E°) first — except that a concentrated chloride solution gives Cl₂
 * before water gives O₂.
 */
export function anodeCandidates(current: Setup, progress: Progress): { list: Candidate[]; chlorideException: boolean } {
  const el = electrolyteById(current.electrolyte);
  const material = materialById(current.anode);
  const list: Candidate[] = [];
  const main = mainMetal(material);
  if (!material.inert && main && progress.anodeLeft > GONE) {
    list.push({ agent: `${METALS[main].symbol} (the anode)`, couple: COUPLES[METALS[main].couple], electrode: true });
  }
  for (const [formula, amount] of Object.entries(progress.moles)) {
    const id = ANION_COUPLE[formula];
    if (id && amount > GONE) list.push({ agent: formula, couple: COUPLES[id], electrode: false });
  }
  if (!el.molten) list.push({ agent: "H₂O", couple: COUPLES["H2O-ox"], electrode: false });
  list.sort((a, b) => a.couple.E0 - b.couple.E0);
  let chlorideException = false;
  const water = list.findIndex((c) => c.couple.id === "H2O-ox");
  const chloride = list.findIndex((c) => c.couple.id === "Cl2");
  if (water >= 0 && chloride > water && concentrationOf(progress, "Cl⁻") >= CHLORIDE_CONCENTRATED) {
    const [cl] = list.splice(chloride, 1);
    list.splice(water, 0, cl);
    chlorideException = true;
  }
  return { list, chlorideException };
}

/** Moles of electrons a candidate can take before what it uses runs out. */
function capacity(candidate: Candidate, current: Setup, progress: Progress, role: "anode" | "cathode"): number {
  if (candidate.electrode) return progress.anodeLeft * electronsPerGram(materialById(current.anode));
  const used = role === "cathode" ? candidate.couple.ox : candidate.couple.red;
  let most = Infinity;
  for (const t of used) {
    if (t.phase !== "aq") continue;
    most = Math.min(most, ((progress.moles[t.formula] ?? 0) / t.coef) * candidate.couple.n);
  }
  return most;
}

/** Let `electrons` mol of e⁻ through one half-reaction, changing `next` in place. */
function apply(next: Progress, candidate: Candidate, electrons: number, current: Setup, role: "anode" | "cathode"): void {
  const { couple } = candidate;
  if (candidate.electrode) {
    const material = materialById(current.anode);
    const main = mainMetal(material)!;
    const mainE0 = COUPLES[METALS[main].couple].E0;
    const grams = electrons / electronsPerGram(material);
    next.anodeLeft = Math.max(0, next.anodeLeft - grams);
    for (const [metal, fraction] of Object.entries(material.composition)) {
      if (COUPLES[METALS[metal].couple].E0 <= mainE0) {
        const ion = METALS[metal].ion;
        next.moles[ion] = (next.moles[ion] ?? 0) + (fraction * grams) / MOLAR_MASS[metal];
      } else {
        next.sludge[metal] = (next.sludge[metal] ?? 0) + fraction * grams;
      }
    }
    next.electrons["anode:metal"] = (next.electrons["anode:metal"] ?? 0) + electrons;
    return;
  }
  const [used, made] = role === "cathode" ? [couple.ox, couple.red] : [couple.red, couple.ox];
  const per = electrons / couple.n;
  for (const t of used) {
    if (t.phase === "aq") next.moles[t.formula] = Math.max(0, (next.moles[t.formula] ?? 0) - t.coef * per);
  }
  for (const t of made) {
    if (t.phase === "aq") next.moles[t.formula] = (next.moles[t.formula] ?? 0) + t.coef * per;
    else if (t.phase === "s" && MOLAR_MASS[t.formula]) next.plated[t.formula] = (next.plated[t.formula] ?? 0) + t.coef * per * MOLAR_MASS[t.formula];
  }
  const key = `${role}:${couple.id}`;
  next.electrons[key] = (next.electrons[key] ?? 0) + electrons;
}

/** Share `electrons` among an electrode's candidates in order. Returns how many were used. */
function discharge(next: Progress, current: Setup, role: "anode" | "cathode", electrons: number): number {
  const list = role === "cathode" ? cathodeCandidates(current, next) : anodeCandidates(current, next).list;
  let left = electrons;
  for (const candidate of list) {
    if (left <= 0) break;
    const room = capacity(candidate, current, next, role);
    const take = Math.min(left, room);
    if (take > 0) apply(next, candidate, take, current, role);
    left -= take;
    // When an active anode has dissolved away, nothing joins the wire to the
    // electrolyte any more: the circuit is broken.
    if (candidate.electrode && next.anodeLeft <= GONE) {
      next.stopped = "anode-gone";
      return electrons - left;
    }
  }
  return electrons - Math.max(0, left);
}

/** Electrons (mol) shared out at a time: small enough that a mixture of products comes out right. */
const CHUNK = 2e-4;

/**
 * Let the cell run for `seconds` at `current` amperes. Electrons go to the
 * strongest oxidising agent at the cathode and come from the strongest
 * reducing agent at the anode; when one is used up, the next takes over.
 */
export function advance(current: Setup, progress: Progress, amperes: number, seconds: number): Progress {
  if (seconds <= 0 || amperes <= 0 || progress.stopped) return progress;
  const next: Progress = {
    ...progress,
    moles: { ...progress.moles },
    plated: { ...progress.plated },
    sludge: { ...progress.sludge },
    electrons: { ...progress.electrons },
  };
  const total = (amperes * seconds) / F;
  let done = 0;
  while (done < total - 1e-15) {
    const chunk = Math.min(CHUNK, total - done);
    const given = discharge(next, current, "anode", chunk);
    if (given > 0) discharge(next, current, "cathode", given);
    // H⁺ and OH⁻ made in the same solution neutralise each other.
    const h = next.moles["H⁺"] ?? 0;
    const oh = next.moles["OH⁻"] ?? 0;
    if (h > 0 && oh > 0) {
      const both = Math.min(h, oh);
      next.moles["H⁺"] = h - both;
      next.moles["OH⁻"] = oh - both;
    }
    done += given;
    if (next.stopped || given <= 0) break;
  }
  const ran = (done * F) / amperes;
  next.time = progress.time + Math.min(seconds, ran);
  next.charge = progress.charge + done * F;
  return next;
}

// ---- Working it out --------------------------------------------------------

export interface Analysis {
  electrolyte: Electrolyte;
  anodeMaterial: Material;
  cathodeMaterial: Material;
  cathodeList: Candidate[];
  anodeList: Candidate[];
  /** What is reduced at the cathode now. */
  cathode: Candidate;
  /** What is oxidised at the anode now. */
  anode: Candidate;
  chlorideException: boolean;
  /** Cl⁻ is there but the solution is too dilute to give Cl₂. */
  chlorideDilute: boolean;
  /** The least EMF the supply must give: −E°cell = E°(anode couple) − E°(cathode couple), or 0. */
  minVoltage: number;
  /** Net ionic equation; null when nothing changes overall (copper moved from anode to cathode). */
  net: { reactants: Term[]; products: Term[] } | null;
}

export function analyse(current: Setup, progress: Progress): Analysis {
  const electrolyte = electrolyteById(current.electrolyte);
  const cathodeList = cathodeCandidates(current, progress);
  const { list: anodeList, chlorideException } = anodeCandidates(current, progress);
  const cathode = cathodeList[0];
  const anode = anodeList[0];
  const chlorideDilute = anode.couple.id === "H2O-ox" && anodeList.some((c) => c.couple.id === "Cl2");
  return {
    electrolyte,
    anodeMaterial: materialById(current.anode),
    cathodeMaterial: materialById(current.cathode),
    cathodeList,
    anodeList,
    cathode,
    anode,
    chlorideException,
    chlorideDilute,
    minVoltage: Math.max(0, anode.couple.E0 - cathode.couple.E0),
    net: netEquation(cathode.couple, anode.couple),
  };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The two half-reactions added so the electrons cancel, with what appears on both sides taken off. */
export function netEquation(cathode: Couple, anode: Couple): { reactants: Term[]; products: Term[] } | null {
  const divisor = gcd(cathode.n, anode.n);
  const fc = anode.n / divisor;
  const fa = cathode.n / divisor;
  const left = new Map<string, Term>();
  const right = new Map<string, Term>();
  const add = (side: Map<string, Term>, terms: Term[], factor: number) => {
    for (const t of terms) {
      const was = side.get(t.formula);
      side.set(t.formula, { ...t, coef: (was?.coef ?? 0) + t.coef * factor });
    }
  };
  add(left, cathode.ox, fc);
  add(right, cathode.red, fc);
  add(left, anode.red, fa);
  add(right, anode.ox, fa);
  // H⁺ and OH⁻ on the same side are water.
  for (const side of [left, right]) {
    const h = side.get("H⁺");
    const oh = side.get("OH⁻");
    if (h && oh) {
      const both = Math.min(h.coef, oh.coef);
      h.coef -= both;
      oh.coef -= both;
      const water = side.get("H₂O");
      side.set("H₂O", { formula: "H₂O", phase: "l", coef: (water?.coef ?? 0) + both });
    }
  }
  for (const [formula, t] of left) {
    const other = right.get(formula);
    if (!other) continue;
    const both = Math.min(t.coef, other.coef);
    t.coef -= both;
    other.coef -= both;
  }
  const keep = (side: Map<string, Term>) => [...side.values()].filter((t) => t.coef > 0);
  let reactants = keep(left);
  let products = keep(right);
  if (reactants.length === 0 && products.length === 0) return null;
  // Halve 4H₂O → 4H₂ + 2O₂ down to its lowest whole numbers.
  const all = [...reactants, ...products].map((t) => t.coef);
  const common = all.reduce((a, b) => gcd(a, b));
  if (common > 1) {
    reactants = reactants.map((t) => ({ ...t, coef: t.coef / common }));
    products = products.map((t) => ({ ...t, coef: t.coef / common }));
  }
  return { reactants, products };
}

/** One thing made (or used) at an electrode, with Faraday's law worked through. */
export interface Product {
  role: "anode" | "cathode";
  /** "Cu", "H₂", "Cl₂", "Cu (anode)". */
  formula: string;
  phase: Phase;
  /** Electrons per formula unit: Cu²⁺ + 2e⁻ → Cu gives 2. */
  ratio: number;
  /** mol of e⁻ through this half-reaction. */
  electrons: number;
  moles: number;
  molarMass: number;
  grams: number;
  /** dm³ at STP, for a gas. */
  volume: number | null;
  /** For the anode dissolving: what it is made of was oxidised, not formed. */
  dissolved: boolean;
  /** Fraction of a dissolving anode that is its main metal (1 when pure). */
  purity: number;
}

/** What each half-reaction has made so far. */
export function productsOf(current: Setup, progress: Progress): Product[] {
  const list: Product[] = [];
  const el = electrolyteById(current.electrolyte);
  for (const [key, electrons] of Object.entries(progress.electrons)) {
    if (electrons <= 0) continue;
    const [role, id] = key.split(":") as ["anode" | "cathode", string];
    if (id === "metal") {
      const material = materialById(current.anode);
      const main = mainMetal(material)!;
      const grams = ANODE_MASS - progress.anodeLeft;
      list.push({
        role,
        formula: METALS[main].symbol,
        phase: "s",
        ratio: COUPLES[METALS[main].couple].n,
        electrons,
        // Of an impure anode, only the main metal's share: the rest is impurity.
        moles: ((material.composition[main] ?? 1) * grams) / MOLAR_MASS[main],
        molarMass: MOLAR_MASS[main],
        grams,
        volume: null,
        dissolved: true,
        purity: material.composition[main] ?? 1,
      });
      continue;
    }
    const couple = COUPLES[id];
    const made = role === "cathode" ? couple.red : couple.ox;
    const main = made.find((t) => t.phase !== "aq" || t.formula === "I₂") ?? made[0];
    if (main.formula === "H₂O") continue;
    const moles = (electrons / couple.n) * main.coef;
    const molarMass = MOLAR_MASS[main.formula] ?? 0;
    list.push({
      role,
      formula: main.formula,
      phase: phaseIn(main, el.molten),
      ratio: couple.n / main.coef,
      electrons,
      moles,
      molarMass,
      grams: moles * molarMass,
      volume: main.phase === "g" || (el.molten && main.formula === "Br₂") ? moles * VM : null,
      dissolved: false,
      purity: 1,
    });
  }
  // Cathode first, then the anode; the biggest share first.
  return list.sort((a, b) => (a.role === b.role ? b.electrons - a.electrons : a.role === "cathode" ? -1 : 1));
}

// ---- Words and symbols -----------------------------------------------------

/** A species' phase in this cell: in a melt there is no water — ions have no (aq), metals are liquid, bromine a gas. */
export function phaseIn(t: Term, molten: boolean): Phase {
  if (!molten) return t.phase;
  if (t.phase === "s") return "l";
  if (t.formula === "Br₂") return "g";
  return t.phase;
}

/** "2Cl⁻(aq)"; in a melt the ions are written bare: "Na⁺". */
export function termText(t: Term, molten = false): string {
  const phase = phaseIn(t, molten);
  const label = molten && phase === "aq" ? "" : `(${phase})`;
  return `${t.coef > 1 ? t.coef : ""}${t.formula}${label}`;
}

const joinTerms = (terms: Term[], molten: boolean) => terms.map((t) => termText(t, molten)).join(" + ");

/** "2e⁻", or "e⁻" for one, as the data sheet writes it. */
const electronsText = (n: number) => `${n > 1 ? n : ""}e⁻`;

/** "Cu²⁺(aq) + 2e⁻ → Cu(s)". */
export function reductionText(couple: Couple, molten = false): string {
  return `${joinTerms(couple.ox, molten)} + ${electronsText(couple.n)} → ${joinTerms(couple.red, molten)}`;
}

/** "2Cl⁻(aq) → Cl₂(g) + 2e⁻". */
export function oxidationText(couple: Couple, molten = false): string {
  return `${joinTerms(couple.red, molten)} → ${joinTerms(couple.ox, molten)} + ${electronsText(couple.n)}`;
}

/** The net equation, or what happens when nothing does overall. */
export function netText(a: Analysis): string {
  if (!a.net) {
    const metal = mainMetal(a.anodeMaterial);
    return metal
      ? `No net reaction: ${METALS[metal].name} is moved from the anode to the cathode.`
      : "No net reaction.";
  }
  const molten = a.electrolyte.molten;
  return `${joinTerms(a.net.reactants, molten)} → ${joinTerms(a.net.products, molten)}`;
}

/** "30 min 00 s", "1 h 05 min 00 s". */
export function timeText(seconds: number): string {
  const whole = Math.floor(seconds + 1e-6);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h} h ${pad(m)} min ${pad(sec)} s` : `${m} min ${pad(sec)} s`;
}

/** A measured value to three figures, trailing zeros kept: "0,0373", "1,18", "418". */
export function three(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(n)));
  if (exponent >= 5 || exponent <= -4) return formatSigFigs(n, 3);
  return formatFixed(n, Math.max(0, 2 - exponent));
}

export function fileNameFor(current: Setup): string {
  const el = electrolyteById(current.electrolyte);
  const slug = (id: string) => id.replace(/[^a-z0-9]+/g, "_");
  return `electrolysis_${slug(el.id)}_${slug(current.anode)}_${slug(current.cathode)}.png`;
}

// ---- What a learner is expected to say -------------------------------------

const TINT_NAME: Record<string, string> = { "Cu²⁺": "blue", "Ni²⁺": "green" };

export function talkingPoints(current: Setup, progress: Progress, a: Analysis): string[] {
  const points: string[] = [];
  const el = a.electrolyte;
  const anodeMain = mainMetal(a.anodeMaterial);
  const cathodeIon = a.cathode.agent;
  points.push(
    "The anode is joined to the positive terminal of the supply and the cathode to the negative terminal. Oxidation happens at the anode, reduction at the cathode — as in a galvanic cell, but here the anode is positive and the cathode negative.",
  );
  points.push(
    "Electrons flow through the wires from the negative terminal to the cathode, and from the anode back to the positive terminal. In the electrolyte the current is carried by ions: cations move to the cathode, anions to the anode.",
  );
  points.push(
    `The reaction is not spontaneous: electrical energy is changed into chemical energy. ${
      a.minVoltage > 0.005
        ? `E°cell = E°cathode − E°anode = ${voltsText(-a.minVoltage)} is negative, so the supply must give more than ${voltsText(a.minVoltage).replace("+", "")} to drive it.`
        : "The same reaction runs in opposite directions at the two electrodes, so almost any voltage drives it."
    }`,
  );
  if (el.molten) {
    points.push(
      `There is no water in a melt, so the salt's own ions are the only things that can react. ${el.formula} must be molten (${el.temperature}) — in a solid the ions can't move, so it doesn't conduct.`,
    );
  }
  if (a.anodeMaterial.inert || a.cathodeMaterial.inert) {
    const names = [...new Set([a.anodeMaterial, a.cathodeMaterial].filter((m) => m.inert).map((m) => m.name.toLowerCase()))];
    points.push(`The ${names.join(" and ")} electrode${names.length > 1 ? "s are" : " is"} inert: it only conducts and takes no part in the reaction.`);
  }
  if (a.cathode.couple.id === "H2O-red" && (progress.moles["Na⁺"] ?? 0) + (progress.moles["K⁺"] ?? 0) > GONE) {
    const metal = (progress.moles["Na⁺"] ?? 0) > GONE ? "Na⁺" : "K⁺";
    points.push(
      `Water, not ${metal}, is reduced at the cathode: H₂O (E° = −0,83 V) is a stronger oxidising agent than ${metal} (${voltsText(COUPLES[CATION_COUPLE[metal]].E0)}). Hydrogen bubbles off and OH⁻ ions are left behind, so the solution round the cathode becomes basic.`,
    );
  }
  if (el.id === "nacl" && a.cathode.couple.id === "H2O-red" && a.anode.couple.id === "Cl2") {
    points.push("Overall: 2NaCl(aq) + 2H₂O(l) → 2NaOH(aq) + H₂(g) + Cl₂(g) — the three products of the chlor-alkali industry: chlorine (water treatment, PVC), hydrogen (a fuel) and sodium hydroxide (soap, paper).");
    points.push(
      current.membrane
        ? "The membrane lets Na⁺ ions through to the cathode side but keeps Cl⁻ and Cl₂ away from the OH⁻, so the sodium hydroxide stays pure and chlorine can't react with it."
        : "With no membrane, the chlorine would react with the sodium hydroxide to make sodium hypochlorite (bleach) — why the industry separates them with a membrane.",
    );
  }
  if (a.chlorideException) {
    points.push(
      `By E° alone water (+1,23 V) would be oxidised before Cl⁻ (+1,36 V), but oxygen forms only slowly at the electrode, so from a concentrated chloride solution chlorine is given off. (Below about ${formatFixed(CHLORIDE_CONCENTRATED, 1)} mol·dm⁻³ Cl⁻ the tool treats the solution as dilute.)`,
    );
  }
  if (a.chlorideDilute) {
    points.push("The chloride solution is dilute, so water is oxidised to oxygen at the anode rather than Cl⁻ to chlorine.");
  }
  if (a.anode.couple.id === "H2O-ox") {
    points.push("Oxygen bubbles off the anode and H⁺ ions form there, so the solution round the anode becomes acidic.");
  }
  if (a.anode.couple.id === "I2") {
    points.push("I⁻ (E° = +0,54 V for I₂ / I⁻) is a stronger reducing agent than water (+1,23 V), so iodine forms: the solution turns brown round the anode.");
  }
  if (el.id === "h2so4" && a.cathode.couple.id === "H" && a.anode.couple.id === "H2O-ox") {
    points.push(
      "Overall 2H₂O(l) → 2H₂(g) + O₂(g): hydrogen and oxygen form in the ratio 2 : 1 by volume. The same electrons give twice as many moles of H₂ (2 e⁻ each) as of O₂ (4 e⁻ each). The acid only lets the water conduct; there is as much of it at the end as at the start.",
    );
  }
  // Mass changes and colours.
  const cathodeMetal = a.cathode.couple.red.find((t) => t.phase === "s");
  if (cathodeMetal) {
    points.push(
      el.molten
        ? `${METALS[cathodeMetal.formula]?.name ?? cathodeMetal.formula} metal forms at the cathode as a liquid${cathodeMetal.formula === "Na" ? ", less dense than the melt, so it rises and is collected" : cathodeMetal.formula === "Pb" ? " and sinks to the bottom" : ""}.`
        : `The cathode gains mass as ${cathodeMetal.formula} is deposited on it.`,
    );
  }
  if (a.anode.electrode && anodeMain) {
    points.push(`The ${METALS[anodeMain].name} anode is oxidised: it loses mass as ${METALS[anodeMain].ion} ions go into solution.`);
  }
  const tinted = Object.keys(TINT_NAME).find((ion) => (freshProgress(current).moles[ion] ?? 0) > 0);
  if (tinted && !el.molten) {
    const replenished = a.anode.electrode && anodeMain && METALS[anodeMain].ion === tinted;
    points.push(
      replenished
        ? `The ${TINT_NAME[tinted]} colour stays the same: every ${tinted} ion reduced at the cathode is replaced by one formed at the anode, so [${tinted}] doesn't change.`
        : `The ${TINT_NAME[tinted]} colour of the solution fades as ${tinted} ions are used up.`,
    );
  }
  if (a.anodeMaterial.id === "cu-impure") {
    points.push(
      "Refining: the impure copper anode dissolves and pure copper builds up on the cathode. Zinc and iron in it are oxidised too and go into solution, but they aren't reduced at the cathode — Cu²⁺ is the stronger oxidising agent. Silver and gold are not oxidised: they fall under the anode as sludge, which is worth recovering.",
    );
  }
  if (a.cathodeMaterial.shape === "spoon" && anodeMain && a.anode.electrode) {
    points.push(
      `Electroplating: the spoon is the cathode, the plating metal (${METALS[anodeMain].name}) is the anode, and the electrolyte holds that metal's ions. The ${METALS[anodeMain].ion} ions reduced on the spoon are replaced by the anode as it dissolves.`,
    );
  }
  if (a.anodeMaterial.shape === "spoon") {
    points.push("The spoon is the anode here, so it is oxidised and dissolves instead of being plated. To plate an object, make it the cathode.");
  }
  const original = freshProgress(current);
  for (const [ion, start] of Object.entries(original.moles)) {
    if (el.molten || start <= GONE || (progress.moles[ion] ?? 0) > GONE) continue;
    if (CATION_COUPLE[ion]) points.push(`All the ${ion} has been used up, so now ${cathodeIon} is reduced at the cathode.`);
    else if (ANION_COUPLE[ion]) points.push(`All the ${ion} has been used up, so now ${a.anode.agent} is oxidised at the anode.`);
  }
  if (progress.stopped === "anode-gone") {
    points.push("The anode has dissolved away under the solution, so nothing joins the wire to the electrolyte: the circuit is broken and the current stops.");
  }
  return points;
}
