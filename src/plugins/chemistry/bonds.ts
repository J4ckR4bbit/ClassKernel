// Bonds: the structural formula of a molecule from a short text, laid out
// the way a textbook draws it; each bond's average enthalpy and polarity;
// and a substance's molar mass from the data sheet's masses.
//
// SOURCES
// - Average bond enthalpies (kJ·mol⁻¹): the CRC Handbook of Chemistry and
//   Physics, rounded as school tables print them. They are averages over many
//   compounds; a few bonds differ a lot by compound (C=O is 805 in CO₂ and
//   1 072 in CO against the 745 average) and the notes say so.
// - Electronegativities: the data sheet (elements.ts).
// - Polarity bands: the CAPS / IEB convention — a difference up to 0,4 is
//   non-polar covalent, up to 2,1 polar covalent, above that ionic. Both
//   limits are constants below; some textbooks use 1,7 for the second.

import { elementBySymbol } from "./elements";

export const NON_POLAR_MAX = 0.4;
export const IONIC_MIN = 2.1;

export type BondOrder = 1 | 2 | 3;

const ORDER_SYMBOL: Record<BondOrder, string> = { 1: "–", 2: "=", 3: "≡" };

/**
 * Average bond enthalpies, kJ·mol⁻¹, keyed "A–B" with the bond symbol
 * between (– = ≡). Either order of the two elements is found.
 */
export const BOND_ENTHALPIES: Record<string, number> = {
  "H–H": 436,
  "C–H": 413,
  "N–H": 391,
  "O–H": 464,
  "S–H": 364,
  "P–H": 322,
  "H–F": 567,
  "H–Cl": 431,
  "H–Br": 366,
  "H–I": 299,
  "C–C": 347,
  "C=C": 614,
  "C≡C": 839,
  "C–N": 305,
  "C=N": 615,
  "C≡N": 891,
  "C–O": 358,
  "C=O": 745,
  "C≡O": 1072,
  "C–S": 272,
  "C–F": 485,
  "C–Cl": 339,
  "C–Br": 276,
  "C–I": 240,
  "N–N": 160,
  "N=N": 418,
  "N≡N": 945,
  "N–O": 201,
  "N=O": 607,
  "O–O": 146,
  "O=O": 498,
  "S–O": 265,
  "S=O": 523,
  "S–S": 266,
  "P–O": 335,
  "P=O": 544,
  "F–F": 158,
  "Cl–Cl": 243,
  "Br–Br": 193,
  "I–I": 151,
  "Si–O": 452,
  "Si–H": 318,
};

/** "C–H" style key for a bond, in the table's order. */
export function bondKey(a: string, b: string, order: BondOrder): string {
  const sym = ORDER_SYMBOL[order];
  const direct = `${a}${sym}${b}`;
  if (direct in BOND_ENTHALPIES) return direct;
  const reversed = `${b}${sym}${a}`;
  if (reversed in BOND_ENTHALPIES) return reversed;
  return direct;
}

export function bondEnthalpy(a: string, b: string, order: BondOrder): number | undefined {
  return BOND_ENTHALPIES[bondKey(a, b, order)];
}

export type BondType = "non-polar covalent" | "polar covalent" | "ionic";

export interface Polarity {
  difference: number;
  type: BondType;
  /** The atom that carries δ⁻, or null for a non-polar bond. */
  negative: string | null;
  positive: string | null;
}

/** The polarity of a bond between two elements from their electronegativities. */
export function polarity(a: string, b: string): Polarity {
  const ea = elementBySymbol(a)?.en;
  const eb = elementBySymbol(b)?.en;
  if (ea === undefined || eb === undefined) return { difference: 0, type: "non-polar covalent", negative: null, positive: null };
  const difference = Math.abs(ea - eb);
  const type: BondType = difference > IONIC_MIN ? "ionic" : difference > NON_POLAR_MAX ? "polar covalent" : "non-polar covalent";
  if (type === "non-polar covalent" || ea === eb) return { difference, type, negative: null, positive: null };
  return { difference, type, negative: ea > eb ? a : b, positive: ea > eb ? b : a };
}

// ---- Structural formulas ---------------------------------------------------

export interface AtomNode {
  element: string;
  children: Array<{ order: BondOrder; node: AtomNode }>;
}

/**
 * Parse a structural formula written the way one would say it:
 * "CH3-CH2-OH", "CH2=CH2", "CH≡CH", "CH3-C(=O)-OH", "HO-S(=O)(=O)-OH",
 * "O=C=O", "NH3", "H-O-H". An element symbol followed by H and a digit
 * carries that many hydrogens; parentheses hold a branch; – = ≡ (or - = #)
 * set the bond order; the first atom written is the root.
 */
export function parseStructure(text: string): AtomNode {
  let i = 0;
  const s = text.replace(/\s+/g, "");
  const peek = () => s[i];
  const orderOf = (c: string | undefined): BondOrder | null => (c === "-" || c === "–" ? 1 : c === "=" ? 2 : c === "#" || c === "≡" ? 3 : null);

  const readElement = (): string => {
    const m = /^[A-Z][a-z]?/.exec(s.slice(i));
    if (!m) throw new Error(`Expected an element at ${i} in "${text}"`);
    i += m[0].length;
    return m[0];
  };

  const readAtom = (): AtomNode => {
    const element = readElement();
    const node: AtomNode = { element, children: [] };
    // Implicit hydrogens: "CH3", "OH", "NH2" — but not when the next symbol starts a real element like "Hg".
    if (element !== "H" && peek() === "H" && !/^[a-z]/.test(s[i + 1] ?? "")) {
      i++;
      const m = /^\d+/.exec(s.slice(i));
      const count = m ? parseInt(m[0], 10) : 1;
      if (m) i += m[0].length;
      for (let k = 0; k < count; k++) node.children.push({ order: 1, node: { element: "H", children: [] } });
    }
    // Branches.
    while (peek() === "(") {
      i++;
      const order = orderOf(peek());
      if (order) i++;
      const child = readChain();
      if (peek() !== ")") throw new Error(`Expected ")" at ${i} in "${text}"`);
      i++;
      node.children.push({ order: order ?? 1, node: child });
    }
    return node;
  };

  // A chain: atom (bond atom)*, each later atom hanging off the previous.
  const readChain = (): AtomNode => {
    const first = readAtom();
    let current = first;
    while (i < s.length && peek() !== ")") {
      const order = orderOf(peek());
      if (order) i++;
      const next = readAtom();
      current.children.push({ order: order ?? 1, node: next });
      current = next;
    }
    return first;
  };

  const root = readChain();
  if (i !== s.length) throw new Error(`Unexpected "${s[i]}" at ${i} in "${text}"`);
  return root;
}

export interface PlacedAtom {
  id: number;
  element: string;
  x: number;
  y: number;
}

export interface PlacedBond {
  from: number;
  to: number;
  order: BondOrder;
}

export interface Molecule {
  atoms: PlacedAtom[];
  bonds: PlacedBond[];
}

export type Shape = "bent" | "linear";

const isLeaf = (n: AtomNode) => n.children.length === 0;

/**
 * Lay the tree out as a textbook structural formula: chains run left to
 * right, branches go up and down at right angles, a terminal pair of atoms
 * (the H's on an alkene carbon, the two O's of a carboxyl) spread at 60°.
 * Bond length 1; the renderer scales it.
 */
export function layoutMolecule(root: AtomNode, shape: Shape = "linear"): Molecule {
  const atoms: PlacedAtom[] = [];
  const bonds: PlacedBond[] = [];
  const rad = (deg: number) => (deg * Math.PI) / 180;

  const place = (node: AtomNode, x: number, y: number, incoming: number | null): number => {
    const id = atoms.length;
    atoms.push({ id, element: node.element, x, y });
    const children = node.children;
    const m = children.length;
    let angles: number[] = [];
    if (incoming === null) {
      // The root: spread around, the last-written child continuing to the right.
      if (m === 1) angles = [0];
      else if (m === 2) angles = shape === "bent" ? [128, -128] : [180, 0]; // bent: both to the left, up and down
      else if (m === 3) angles = [120, -120, 0];
      else angles = [90, 180, -90, 0];
    } else {
      const straight = incoming;
      const last = children[m - 1];
      if (m === 0) angles = [];
      else if (m === 1) angles = [straight];
      else if (!isLeaf(last.node)) {
        // Branches above and below, the chain carries on straight.
        const branches = m - 1;
        const branchAngles = branches === 1 ? [straight + 90] : branches === 2 ? [straight + 90, straight - 90] : [straight + 90, straight - 90, straight + 45];
        angles = [...branchAngles, straight];
      } else if (m === 2) angles = [straight + 60, straight - 60];
      else if (m === 3) angles = [straight + 90, straight - 90, straight];
      else angles = [straight + 90, straight - 90, straight + 45, straight - 45];
    }
    children.forEach((child, k) => {
      const a = angles[k] ?? incoming ?? 0;
      const cx = x + Math.cos(rad(a));
      const cy = y - Math.sin(rad(a));
      const childId = place(child.node, cx, cy, a);
      bonds.push({ from: id, to: childId, order: child.order });
    });
    return id;
  };
  place(root, 0, 0, null);
  return { atoms, bonds };
}

export interface BondSummary {
  key: string;
  a: string;
  b: string;
  order: BondOrder;
  count: number;
  enthalpy: number | undefined;
  polarity: Polarity;
}

/** The bonds in a molecule, grouped: "4 × C–H at 413 kJ·mol⁻¹…". */
export function summariseBonds(molecule: Molecule): BondSummary[] {
  const map = new Map<string, BondSummary>();
  for (const bond of molecule.bonds) {
    const a = molecule.atoms[bond.from].element;
    const b = molecule.atoms[bond.to].element;
    const key = bondKey(a, b, bond.order);
    const existing = map.get(key);
    if (existing) existing.count++;
    else {
      const [left, right] = key.split(/[–=≡]/);
      map.set(key, { key, a: left, b: right, order: bond.order, count: 1, enthalpy: BOND_ENTHALPIES[key], polarity: polarity(left, right) });
    }
  }
  return [...map.values()];
}

/** The energy to break every bond in one mole of molecules, if every bond has a value. */
export function totalBondEnthalpy(summary: BondSummary[]): number | undefined {
  let total = 0;
  for (const s of summary) {
    if (s.enthalpy === undefined) return undefined;
    total += s.count * s.enthalpy;
  }
  return total;
}

// ---- Formulas ----------------------------------------------------------------

const SUBSCRIPT_DIGITS: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

/** Atoms per formula unit from a formula written with subscripts: "Ca(OH)₂" → Ca 1, O 2, H 2. Charges and dots are ignored. */
export function composition(formula: string): Map<string, number> {
  const plain = formula
    .replace(/[₀-₉]/g, (d) => SUBSCRIPT_DIGITS[d])
    .replace(/[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "")
    .replace(/·.*$/, "");
  let i = 0;
  const parse = (): Map<string, number> => {
    const out = new Map<string, number>();
    const add = (sym: string, n: number) => out.set(sym, (out.get(sym) ?? 0) + n);
    while (i < plain.length && plain[i] !== ")") {
      if (plain[i] === "(") {
        i++;
        const inner = parse();
        i++; // ")"
        const m = /^\d+/.exec(plain.slice(i));
        const n = m ? parseInt(m[0], 10) : 1;
        if (m) i += m[0].length;
        for (const [sym, count] of inner) add(sym, count * n);
      } else {
        const m = /^([A-Z][a-z]?)(\d*)/.exec(plain.slice(i));
        if (!m) throw new Error(`Cannot read "${formula}" at "${plain.slice(i)}"`);
        i += m[0].length;
        add(m[1], m[2] ? parseInt(m[2], 10) : 1);
      }
    }
    return out;
  };
  return parse();
}

/** Molar mass in g·mol⁻¹ from the data sheet's relative atomic masses. */
export function molarMass(formula: string): number {
  let total = 0;
  for (const [sym, n] of composition(formula)) {
    const e = elementBySymbol(sym);
    if (!e) throw new Error(`No element "${sym}" in "${formula}"`);
    total += e.mass * n;
  }
  return Math.round(total * 10) / 10;
}

/** The composition a structural formula implies, to check it against the written formula. */
export function structureComposition(root: AtomNode): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (n: AtomNode) => {
    out.set(n.element, (out.get(n.element) ?? 0) + 1);
    n.children.forEach((c) => walk(c.node));
  };
  walk(root);
  return out;
}

// ---- Lewis structures ----------------------------------------------------------

/** Valence electrons an atom brings: its group number's last digit for the main groups, the group for Mn and Cr, 2 for Zn, Cd and Hg. */
export function valenceElectrons(symbol: string): number {
  const e = elementBySymbol(symbol);
  if (!e || e.group === null) return 0;
  if (e.group <= 2) return e.group;
  if (e.group >= 13) return e.group - 10;
  if (e.group === 12) return 2;
  return e.group;
}

export interface LewisStructure {
  /** Lone pairs on each atom, by atom id. */
  lonePairs: number[];
  /** Formal charge on each atom, by atom id. */
  formalCharges: number[];
  totalValenceElectrons: number;
}

/**
 * Lone pairs and formal charges for a drawn structure carrying `charge`:
 * count the valence electrons, take out the bonding pairs, give the
 * outer atoms their octets (the most electronegative first), then the
 * inner atoms theirs, and leave anything over on the central atoms
 * (an expanded octet, as on the Cl of chlorate). Formal charge is then
 * valence − lone-pair electrons − bonds.
 */
export function lewisStructure(molecule: Molecule, charge: number): LewisStructure {
  const bondsOf = molecule.atoms.map(() => 0);
  const degree = molecule.atoms.map(() => 0);
  for (const b of molecule.bonds) {
    bondsOf[b.from] += b.order;
    bondsOf[b.to] += b.order;
    degree[b.from]++;
    degree[b.to]++;
  }
  const total = molecule.atoms.reduce((sum, a) => sum + valenceElectrons(a.element), 0) - charge;
  let remaining = total - 2 * molecule.bonds.reduce((s, b) => s + b.order, 0);
  const nonbonding = molecule.atoms.map(() => 0);
  const need = molecule.atoms.map((a, i) => (a.element === "H" || a.element === "He" ? 0 : Math.max(0, 8 - 2 * bondsOf[i])));
  const en = (i: number) => elementBySymbol(molecule.atoms[i].element)?.en ?? 0;
  const order = molecule.atoms
    .map((_, i) => i)
    .sort((a, b) => (degree[a] === 1 ? 0 : 1) - (degree[b] === 1 ? 0 : 1) || en(b) - en(a));
  for (const i of order) {
    const give = Math.min(need[i], remaining);
    nonbonding[i] += give;
    remaining -= give;
  }
  // Anything left sits on the atoms with the most bonds (the centres).
  if (remaining > 0) {
    const centres = molecule.atoms.map((_, i) => i).filter((i) => degree[i] > 1 && molecule.atoms[i].element !== "H");
    const target = centres.length ? centres : [0];
    const each = Math.floor(remaining / target.length / 2) * 2;
    for (const i of target) {
      const give = Math.min(each, remaining);
      nonbonding[i] += give;
      remaining -= give;
    }
    if (remaining > 0) nonbonding[target[0]] += remaining;
  }
  const formalCharges = molecule.atoms.map((a, i) => valenceElectrons(a.element) - nonbonding[i] - bondsOf[i]);
  return { lonePairs: nonbonding.map((e) => Math.floor(e / 2)), formalCharges, totalValenceElectrons: total };
}
