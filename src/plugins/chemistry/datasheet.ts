// The data sheet's tables as data: the constants, the chemistry formulae and
// the standard reduction potentials (Table 4A), so they can be searched and
// clicked on the board. Values as printed on the DBE / IEB Physical Sciences
// data sheet; a value here that differs from your copy is a one-line fix.

export interface Constant {
  name: string;
  symbol: string;
  value: string;
  unit: string;
}

export const CONSTANTS: Constant[] = [
  { name: "Acceleration due to gravity", symbol: "g", value: "9,8", unit: "m·s⁻²" },
  { name: "Universal gravitational constant", symbol: "G", value: "6,67 × 10⁻¹¹", unit: "N·m²·kg⁻²" },
  { name: "Speed of light in a vacuum", symbol: "c", value: "3,0 × 10⁸", unit: "m·s⁻¹" },
  { name: "Planck's constant", symbol: "h", value: "6,63 × 10⁻³⁴", unit: "J·s" },
  { name: "Coulomb's constant", symbol: "k", value: "9,0 × 10⁹", unit: "N·m²·C⁻²" },
  { name: "Charge on electron", symbol: "e", value: "−1,6 × 10⁻¹⁹", unit: "C" },
  { name: "Electron mass", symbol: "mₑ", value: "9,11 × 10⁻³¹", unit: "kg" },
  { name: "Mass of the Earth", symbol: "M", value: "5,98 × 10²⁴", unit: "kg" },
  { name: "Radius of the Earth", symbol: "Rₑ", value: "6,38 × 10⁶", unit: "m" },
  { name: "Avogadro's constant", symbol: "Nₐ", value: "6,02 × 10²³", unit: "mol⁻¹" },
  { name: "Molar gas constant", symbol: "R", value: "8,31", unit: "J·K⁻¹·mol⁻¹" },
  { name: "Standard pressure", symbol: "pᶿ", value: "1,013 × 10⁵", unit: "Pa" },
  { name: "Molar gas volume at STP", symbol: "Vₘ", value: "22,4", unit: "dm³·mol⁻¹" },
  { name: "Standard temperature", symbol: "Tᶿ", value: "273", unit: "K" },
  { name: "Ion product of water at 298 K", symbol: "Kw", value: "1,0 × 10⁻¹⁴", unit: "" },
  { name: "Faraday constant", symbol: "F", value: "96 500", unit: "C·mol⁻¹" },
];

export interface Formula {
  topic: string;
  formula: string;
  meaning: string;
}

export const FORMULAE: Formula[] = [
  { topic: "Moles", formula: "n = m / M", meaning: "moles from mass and molar mass" },
  { topic: "Moles", formula: "n = N / Nₐ", meaning: "moles from number of particles" },
  { topic: "Moles", formula: "n = V / Vₘ", meaning: "moles of a gas at STP from its volume" },
  { topic: "Solutions", formula: "c = n / V  or  c = m / (M·V)", meaning: "concentration in mol·dm⁻³" },
  { topic: "Titration", formula: "cₐVₐ / nₐ = cᵦVᵦ / nᵦ", meaning: "at the equivalence point, acid and base in their mole ratio" },
  { topic: "Acids and bases", formula: "pH = −log[H₃O⁺]", meaning: "and [H₃O⁺] = 10⁻ᵖᴴ" },
  { topic: "Acids and bases", formula: "Kw = [H₃O⁺][OH⁻] = 1 × 10⁻¹⁴ at 298 K", meaning: "ion product of water" },
  { topic: "Equilibrium", formula: "Kc = [C]ᶜ[D]ᵈ / [A]ᵃ[B]ᵇ", meaning: "for aA + bB ⇌ cC + dD, solids and pure liquids left out" },
  { topic: "Electrochemistry", formula: "E°cell = E°cathode − E°anode", meaning: "also written E°reduction − E°oxidation, or E°oxidising agent − E°reducing agent" },
  { topic: "Energy", formula: "ΔH = H(products) − H(reactants)", meaning: "negative for exothermic" },
  { topic: "Energy", formula: "ΔH ≈ Σ(bonds broken) − Σ(bonds formed)", meaning: "from average bond enthalpies" },
  { topic: "Gases", formula: "pV = nRT", meaning: "ideal gas equation, p in Pa, V in m³, T in K" },
  { topic: "Rates", formula: "rate = Δ[ ] / Δt", meaning: "change in concentration (or mass, volume) per unit time" },
];

export interface HalfReaction {
  id: string;
  /** The oxidised form and what goes with it, with the electrons: "MnO₄⁻ + 8H⁺ + 5e⁻". */
  left: string;
  /** The reduced form: "Mn²⁺ + 4H₂O". */
  right: string;
  electrons: number;
  E: number;
  /** For the alphabetical table: the symbol it is listed under. */
  sortKey: string;
}

/** Table 4A: standard reduction potentials at 298 K, in decreasing order. */
export const REDUCTION_POTENTIALS: HalfReaction[] = [
  { id: "f2", left: "F₂(g) + 2e⁻", right: "2F⁻", electrons: 2, E: 2.87, sortKey: "F" },
  { id: "co3", left: "Co³⁺ + e⁻", right: "Co²⁺", electrons: 1, E: 1.81, sortKey: "Co" },
  { id: "h2o2", left: "H₂O₂ + 2H⁺ + 2e⁻", right: "2H₂O", electrons: 2, E: 1.77, sortKey: "H" },
  { id: "mno4", left: "MnO₄⁻ + 8H⁺ + 5e⁻", right: "Mn²⁺ + 4H₂O", electrons: 5, E: 1.51, sortKey: "Mn" },
  { id: "cl2", left: "Cl₂(g) + 2e⁻", right: "2Cl⁻", electrons: 2, E: 1.36, sortKey: "Cl" },
  { id: "cr2o7", left: "Cr₂O₇²⁻ + 14H⁺ + 6e⁻", right: "2Cr³⁺ + 7H₂O", electrons: 6, E: 1.33, sortKey: "Cr" },
  { id: "o2-acid", left: "O₂(g) + 4H⁺ + 4e⁻", right: "2H₂O", electrons: 4, E: 1.23, sortKey: "O" },
  { id: "mno2", left: "MnO₂ + 4H⁺ + 2e⁻", right: "Mn²⁺ + 2H₂O", electrons: 2, E: 1.23, sortKey: "Mn" },
  { id: "pt", left: "Pt²⁺ + 2e⁻", right: "Pt", electrons: 2, E: 1.2, sortKey: "Pt" },
  { id: "br2", left: "Br₂(ℓ) + 2e⁻", right: "2Br⁻", electrons: 2, E: 1.07, sortKey: "Br" },
  { id: "no3-no", left: "NO₃⁻ + 4H⁺ + 3e⁻", right: "NO(g) + 2H₂O", electrons: 3, E: 0.96, sortKey: "N" },
  { id: "hg", left: "Hg²⁺ + 2e⁻", right: "Hg(ℓ)", electrons: 2, E: 0.85, sortKey: "Hg" },
  { id: "ag", left: "Ag⁺ + e⁻", right: "Ag", electrons: 1, E: 0.8, sortKey: "Ag" },
  { id: "no3-no2", left: "NO₃⁻ + 2H⁺ + e⁻", right: "NO₂(g) + H₂O", electrons: 1, E: 0.8, sortKey: "N" },
  { id: "fe3", left: "Fe³⁺ + e⁻", right: "Fe²⁺", electrons: 1, E: 0.77, sortKey: "Fe" },
  { id: "o2-h2o2", left: "O₂(g) + 2H⁺ + 2e⁻", right: "H₂O₂", electrons: 2, E: 0.68, sortKey: "O" },
  { id: "i2", left: "I₂ + 2e⁻", right: "2I⁻", electrons: 2, E: 0.54, sortKey: "I" },
  { id: "cu1", left: "Cu⁺ + e⁻", right: "Cu", electrons: 1, E: 0.52, sortKey: "Cu" },
  { id: "so2-s", left: "SO₂ + 4H⁺ + 4e⁻", right: "S + 2H₂O", electrons: 4, E: 0.45, sortKey: "S" },
  { id: "o2-oh", left: "2H₂O + O₂ + 4e⁻", right: "4OH⁻", electrons: 4, E: 0.4, sortKey: "O" },
  { id: "cu2", left: "Cu²⁺ + 2e⁻", right: "Cu", electrons: 2, E: 0.34, sortKey: "Cu" },
  { id: "so4-so2", left: "SO₄²⁻ + 4H⁺ + 2e⁻", right: "SO₂(g) + 2H₂O", electrons: 2, E: 0.17, sortKey: "S" },
  { id: "cu2-cu1", left: "Cu²⁺ + e⁻", right: "Cu⁺", electrons: 1, E: 0.16, sortKey: "Cu" },
  { id: "sn4", left: "Sn⁴⁺ + 2e⁻", right: "Sn²⁺", electrons: 2, E: 0.15, sortKey: "Sn" },
  { id: "s-h2s", left: "S + 2H⁺ + 2e⁻", right: "H₂S(g)", electrons: 2, E: 0.14, sortKey: "S" },
  { id: "h", left: "2H⁺ + 2e⁻", right: "H₂(g)", electrons: 2, E: 0.0, sortKey: "H" },
  { id: "fe3-fe", left: "Fe³⁺ + 3e⁻", right: "Fe", electrons: 3, E: -0.06, sortKey: "Fe" },
  { id: "pb", left: "Pb²⁺ + 2e⁻", right: "Pb", electrons: 2, E: -0.13, sortKey: "Pb" },
  { id: "sn", left: "Sn²⁺ + 2e⁻", right: "Sn", electrons: 2, E: -0.14, sortKey: "Sn" },
  { id: "ni", left: "Ni²⁺ + 2e⁻", right: "Ni", electrons: 2, E: -0.27, sortKey: "Ni" },
  { id: "co", left: "Co²⁺ + 2e⁻", right: "Co", electrons: 2, E: -0.28, sortKey: "Co" },
  { id: "cd", left: "Cd²⁺ + 2e⁻", right: "Cd", electrons: 2, E: -0.4, sortKey: "Cd" },
  { id: "cr3-cr2", left: "Cr³⁺ + e⁻", right: "Cr²⁺", electrons: 1, E: -0.41, sortKey: "Cr" },
  { id: "fe", left: "Fe²⁺ + 2e⁻", right: "Fe", electrons: 2, E: -0.44, sortKey: "Fe" },
  { id: "cr", left: "Cr³⁺ + 3e⁻", right: "Cr", electrons: 3, E: -0.74, sortKey: "Cr" },
  { id: "zn", left: "Zn²⁺ + 2e⁻", right: "Zn", electrons: 2, E: -0.76, sortKey: "Zn" },
  { id: "h2o", left: "2H₂O + 2e⁻", right: "H₂(g) + 2OH⁻", electrons: 2, E: -0.83, sortKey: "H" },
  { id: "cr2", left: "Cr²⁺ + 2e⁻", right: "Cr", electrons: 2, E: -0.91, sortKey: "Cr" },
  { id: "mn", left: "Mn²⁺ + 2e⁻", right: "Mn", electrons: 2, E: -1.18, sortKey: "Mn" },
  { id: "al", left: "Al³⁺ + 3e⁻", right: "Al", electrons: 3, E: -1.66, sortKey: "Al" },
  { id: "mg", left: "Mg²⁺ + 2e⁻", right: "Mg", electrons: 2, E: -2.36, sortKey: "Mg" },
  { id: "na", left: "Na⁺ + e⁻", right: "Na", electrons: 1, E: -2.71, sortKey: "Na" },
  { id: "ca", left: "Ca²⁺ + 2e⁻", right: "Ca", electrons: 2, E: -2.87, sortKey: "Ca" },
  { id: "sr", left: "Sr²⁺ + 2e⁻", right: "Sr", electrons: 2, E: -2.89, sortKey: "Sr" },
  { id: "ba", left: "Ba²⁺ + 2e⁻", right: "Ba", electrons: 2, E: -2.9, sortKey: "Ba" },
  { id: "cs", left: "Cs⁺ + e⁻", right: "Cs", electrons: 1, E: -2.92, sortKey: "Cs" },
  { id: "k", left: "K⁺ + e⁻", right: "K", electrons: 1, E: -2.93, sortKey: "K" },
  { id: "li", left: "Li⁺ + e⁻", right: "Li", electrons: 1, E: -3.05, sortKey: "Li" },
];

export function halfReactionById(id: string): HalfReaction {
  const h = REDUCTION_POTENTIALS.find((r) => r.id === id);
  if (!h) throw new Error(`No half-reaction "${id}"`);
  return h;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export interface CellFromTable {
  cathode: HalfReaction;
  anode: HalfReaction;
  E0cell: number;
  /** Multipliers to equalise the electrons. */
  cathodeTimes: number;
  anodeTimes: number;
  /** The oxidation half-reaction written forwards: "Zn → Zn²⁺ + 2e⁻". */
  oxidationText: string;
  reductionText: string;
  /** Who is the stronger oxidising / reducing agent, in words. */
  agents: string;
}

const stripElectrons = (left: string) => left.replace(/\s*\+\s*\d*e⁻$/, "").replace(/^\d*e⁻\s*\+\s*/, "");

/**
 * Two half-reactions from the table make a cell: the one with the higher E°
 * is reduced (cathode); the other runs backwards (anode).
 */
export function cellFromTable(a: HalfReaction, b: HalfReaction): CellFromTable {
  const [cathode, anode] = a.E >= b.E ? [a, b] : [b, a];
  const g = gcd(cathode.electrons, anode.electrons);
  const cathodeTimes = anode.electrons / g;
  const anodeTimes = cathode.electrons / g;
  const times = (n: number, text: string) => (n === 1 ? text : `${n} × (${text})`);
  return {
    cathode,
    anode,
    E0cell: cathode.E - anode.E,
    cathodeTimes,
    anodeTimes,
    reductionText: times(cathodeTimes, `${cathode.left} → ${cathode.right}`),
    oxidationText: times(anodeTimes, `${anode.right} → ${anode.left}`),
    agents: `${stripElectrons(cathode.left)} is the stronger oxidising agent; ${anode.right} is the stronger reducing agent.`,
  };
}
