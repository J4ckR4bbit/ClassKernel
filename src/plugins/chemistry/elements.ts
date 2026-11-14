// The elements — the one place to correct a value.
//
// SOURCES
// - Symbol, name, atomic number, relative atomic mass and electronegativity:
//   the DBE / IEB Physical Sciences data sheet (Table 3, the periodic table),
//   which gives masses to one decimal (Cl 35,5; Cu 63,5) and Pauling
//   electronegativities to one decimal. Elements 104–118 are not on the data
//   sheet; their mass numbers are IUPAC's most stable isotope, in brackets.
// - Ionisation energies (kJ·mol⁻¹): NIST Atomic Spectra Database, rounded to
//   the nearest kJ·mol⁻¹ as the CRC Handbook tabulates them.
// - Melting and boiling points (°C) and densities: CRC Handbook of Chemistry
//   and Physics (at 101,3 kPa; sublimation marked in the notes).
// - Common oxidation states: the states met at school first, then others
//   that occur in common compounds.
// A value with `check` beside it is one to confirm against a printed table
// before relying on it in a memo.

export type Category =
  | "alkali"
  | "alkaline"
  | "transition"
  | "post-transition"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble"
  | "lanthanide"
  | "actinide";

export const CATEGORY_NAMES: Record<Category, string> = {
  alkali: "Alkali metals",
  alkaline: "Alkaline earth metals",
  transition: "Transition metals",
  "post-transition": "Post-transition metals",
  metalloid: "Metalloids",
  nonmetal: "Non-metals",
  halogen: "Halogens",
  noble: "Noble gases",
  lanthanide: "Lanthanides",
  actinide: "Actinides",
};

/**
 * Paul Tol's light qualitative scheme — distinguishable with the common
 * colour-vision deficiencies — one colour per category, with the name always
 * written in the legend and the pop-up.
 */
export const CATEGORY_COLOURS: Record<Category, string> = {
  alkali: "#ee8866",
  alkaline: "#eedd88",
  transition: "#77aadd",
  "post-transition": "#99ddff",
  metalloid: "#bbcc33",
  nonmetal: "#44bb99",
  halogen: "#ffaabb",
  noble: "#aaaa00",
  lanthanide: "#dddddd",
  actinide: "#cc99cc",
};

export type State = "solid" | "liquid" | "gas" | "unknown";

export interface ElementDetail {
  /** First, second and third ionisation energies, kJ·mol⁻¹ (fewer where the atom has fewer electrons). */
  ionisation: number[];
  /** °C; null where the element sublimes or the value is not known. */
  melting: number | null;
  boiling: number | null;
  /** g·cm⁻³ at room temperature (gases at 0 °C, g·dm⁻³ ÷ 1000). */
  density?: number;
  /** Most common first. */
  oxidation: number[];
  /** A line for the class: what it is like, what it is used for. */
  notes: string;
  /** A doubt about a value above. */
  check?: string;
}

export interface Element {
  z: number;
  symbol: string;
  name: string;
  /** Relative atomic mass as on the data sheet; see massInBrackets(). */
  mass: number;
  group: number | null;
  period: number;
  category: Category;
  /** Pauling electronegativity as on the data sheet; absent for the noble gases and the heaviest elements. */
  en?: number;
  /** At 25 °C and 101,3 kPa. */
  state: State;
  diatomic?: boolean;
  /** Ferromagnetic at room temperature. */
  ferromagnetic?: boolean;
  /** No stable isotope. */
  radioactive?: boolean;
  detail?: ElementDetail;
}

type Row = [number, string, string, number, number | null, number, Category, number | undefined, State];

// z, symbol, name, mass (data sheet), group, period, category, electronegativity, state at 25 °C
const ROWS: Row[] = [
  [1, "H", "Hydrogen", 1, 1, 1, "nonmetal", 2.1, "gas"],
  [2, "He", "Helium", 4, 18, 1, "noble", undefined, "gas"],
  [3, "Li", "Lithium", 7, 1, 2, "alkali", 1.0, "solid"],
  [4, "Be", "Beryllium", 9, 2, 2, "alkaline", 1.5, "solid"],
  [5, "B", "Boron", 10.8, 13, 2, "metalloid", 2.0, "solid"],
  [6, "C", "Carbon", 12, 14, 2, "nonmetal", 2.5, "solid"],
  [7, "N", "Nitrogen", 14, 15, 2, "nonmetal", 3.0, "gas"],
  [8, "O", "Oxygen", 16, 16, 2, "nonmetal", 3.5, "gas"],
  [9, "F", "Fluorine", 19, 17, 2, "halogen", 4.0, "gas"],
  [10, "Ne", "Neon", 20.2, 18, 2, "noble", undefined, "gas"],
  [11, "Na", "Sodium", 23, 1, 3, "alkali", 0.9, "solid"],
  [12, "Mg", "Magnesium", 24.3, 2, 3, "alkaline", 1.2, "solid"],
  [13, "Al", "Aluminium", 27, 13, 3, "post-transition", 1.5, "solid"],
  [14, "Si", "Silicon", 28.1, 14, 3, "metalloid", 1.8, "solid"],
  [15, "P", "Phosphorus", 31, 15, 3, "nonmetal", 2.1, "solid"],
  [16, "S", "Sulfur", 32.1, 16, 3, "nonmetal", 2.5, "solid"],
  [17, "Cl", "Chlorine", 35.5, 17, 3, "halogen", 3.0, "gas"],
  [18, "Ar", "Argon", 39.9, 18, 3, "noble", undefined, "gas"],
  [19, "K", "Potassium", 39.1, 1, 4, "alkali", 0.8, "solid"],
  [20, "Ca", "Calcium", 40.1, 2, 4, "alkaline", 1.0, "solid"],
  [21, "Sc", "Scandium", 45, 3, 4, "transition", 1.3, "solid"],
  [22, "Ti", "Titanium", 47.9, 4, 4, "transition", 1.5, "solid"],
  [23, "V", "Vanadium", 50.9, 5, 4, "transition", 1.6, "solid"],
  [24, "Cr", "Chromium", 52, 6, 4, "transition", 1.6, "solid"],
  [25, "Mn", "Manganese", 54.9, 7, 4, "transition", 1.5, "solid"],
  [26, "Fe", "Iron", 55.8, 8, 4, "transition", 1.8, "solid"],
  [27, "Co", "Cobalt", 58.9, 9, 4, "transition", 1.8, "solid"],
  [28, "Ni", "Nickel", 58.7, 10, 4, "transition", 1.8, "solid"],
  [29, "Cu", "Copper", 63.5, 11, 4, "transition", 1.9, "solid"],
  [30, "Zn", "Zinc", 65.4, 12, 4, "transition", 1.6, "solid"],
  [31, "Ga", "Gallium", 69.7, 13, 4, "post-transition", 1.6, "solid"],
  [32, "Ge", "Germanium", 72.6, 14, 4, "metalloid", 1.8, "solid"],
  [33, "As", "Arsenic", 74.9, 15, 4, "metalloid", 2.0, "solid"],
  [34, "Se", "Selenium", 79, 16, 4, "nonmetal", 2.4, "solid"],
  [35, "Br", "Bromine", 79.9, 17, 4, "halogen", 2.8, "liquid"],
  [36, "Kr", "Krypton", 83.8, 18, 4, "noble", undefined, "gas"],
  [37, "Rb", "Rubidium", 85.5, 1, 5, "alkali", 0.8, "solid"],
  [38, "Sr", "Strontium", 87.6, 2, 5, "alkaline", 1.0, "solid"],
  [39, "Y", "Yttrium", 88.9, 3, 5, "transition", 1.2, "solid"],
  [40, "Zr", "Zirconium", 91.2, 4, 5, "transition", 1.4, "solid"],
  [41, "Nb", "Niobium", 92.9, 5, 5, "transition", 1.6, "solid"],
  [42, "Mo", "Molybdenum", 96, 6, 5, "transition", 1.8, "solid"],
  [43, "Tc", "Technetium", 98, 7, 5, "transition", 1.9, "solid"],
  [44, "Ru", "Ruthenium", 101.1, 8, 5, "transition", 2.2, "solid"],
  [45, "Rh", "Rhodium", 102.9, 9, 5, "transition", 2.2, "solid"],
  [46, "Pd", "Palladium", 106.4, 10, 5, "transition", 2.2, "solid"],
  [47, "Ag", "Silver", 107.9, 11, 5, "transition", 1.9, "solid"],
  [48, "Cd", "Cadmium", 112.4, 12, 5, "transition", 1.7, "solid"],
  [49, "In", "Indium", 114.8, 13, 5, "post-transition", 1.7, "solid"],
  [50, "Sn", "Tin", 118.7, 14, 5, "post-transition", 1.8, "solid"],
  [51, "Sb", "Antimony", 121.8, 15, 5, "metalloid", 1.9, "solid"],
  [52, "Te", "Tellurium", 127.6, 16, 5, "metalloid", 2.1, "solid"],
  [53, "I", "Iodine", 126.9, 17, 5, "halogen", 2.5, "solid"],
  [54, "Xe", "Xenon", 131.3, 18, 5, "noble", undefined, "gas"],
  [55, "Cs", "Caesium", 132.9, 1, 6, "alkali", 0.7, "solid"],
  [56, "Ba", "Barium", 137.3, 2, 6, "alkaline", 0.9, "solid"],
  [57, "La", "Lanthanum", 138.9, null, 6, "lanthanide", 1.1, "solid"],
  [58, "Ce", "Cerium", 140.1, null, 6, "lanthanide", 1.1, "solid"],
  [59, "Pr", "Praseodymium", 140.9, null, 6, "lanthanide", 1.1, "solid"],
  [60, "Nd", "Neodymium", 144.2, null, 6, "lanthanide", 1.1, "solid"],
  [61, "Pm", "Promethium", 145, null, 6, "lanthanide", 1.1, "solid"],
  [62, "Sm", "Samarium", 150.4, null, 6, "lanthanide", 1.2, "solid"],
  [63, "Eu", "Europium", 152, null, 6, "lanthanide", 1.1, "solid"],
  [64, "Gd", "Gadolinium", 157.3, null, 6, "lanthanide", 1.2, "solid"],
  [65, "Tb", "Terbium", 158.9, null, 6, "lanthanide", 1.2, "solid"],
  [66, "Dy", "Dysprosium", 162.5, null, 6, "lanthanide", 1.2, "solid"],
  [67, "Ho", "Holmium", 164.9, null, 6, "lanthanide", 1.2, "solid"],
  [68, "Er", "Erbium", 167.3, null, 6, "lanthanide", 1.2, "solid"],
  [69, "Tm", "Thulium", 168.9, null, 6, "lanthanide", 1.2, "solid"],
  [70, "Yb", "Ytterbium", 173, null, 6, "lanthanide", 1.1, "solid"],
  [71, "Lu", "Lutetium", 175, null, 6, "lanthanide", 1.3, "solid"],
  [72, "Hf", "Hafnium", 178.5, 4, 6, "transition", 1.3, "solid"],
  [73, "Ta", "Tantalum", 180.9, 5, 6, "transition", 1.5, "solid"],
  [74, "W", "Tungsten", 183.8, 6, 6, "transition", 1.7, "solid"],
  [75, "Re", "Rhenium", 186.2, 7, 6, "transition", 1.9, "solid"],
  [76, "Os", "Osmium", 190.2, 8, 6, "transition", 2.2, "solid"],
  [77, "Ir", "Iridium", 192.2, 9, 6, "transition", 2.2, "solid"],
  [78, "Pt", "Platinum", 195.1, 10, 6, "transition", 2.2, "solid"],
  [79, "Au", "Gold", 197, 11, 6, "transition", 2.4, "solid"],
  [80, "Hg", "Mercury", 200.6, 12, 6, "transition", 1.9, "liquid"],
  [81, "Tl", "Thallium", 204.4, 13, 6, "post-transition", 1.8, "solid"],
  [82, "Pb", "Lead", 207.2, 14, 6, "post-transition", 1.8, "solid"],
  [83, "Bi", "Bismuth", 209, 15, 6, "post-transition", 1.9, "solid"],
  [84, "Po", "Polonium", 209, 16, 6, "post-transition", 2.0, "solid"],
  [85, "At", "Astatine", 210, 17, 6, "halogen", 2.2, "solid"],
  [86, "Rn", "Radon", 222, 18, 6, "noble", undefined, "gas"],
  [87, "Fr", "Francium", 223, 1, 7, "alkali", 0.7, "solid"],
  [88, "Ra", "Radium", 226, 2, 7, "alkaline", 0.9, "solid"],
  [89, "Ac", "Actinium", 227, null, 7, "actinide", 1.1, "solid"],
  [90, "Th", "Thorium", 232, null, 7, "actinide", 1.3, "solid"],
  [91, "Pa", "Protactinium", 231, null, 7, "actinide", 1.5, "solid"],
  [92, "U", "Uranium", 238, null, 7, "actinide", 1.7, "solid"],
  [93, "Np", "Neptunium", 237, null, 7, "actinide", 1.3, "solid"],
  [94, "Pu", "Plutonium", 244, null, 7, "actinide", 1.3, "solid"],
  [95, "Am", "Americium", 243, null, 7, "actinide", 1.3, "solid"],
  [96, "Cm", "Curium", 247, null, 7, "actinide", 1.3, "solid"],
  [97, "Bk", "Berkelium", 247, null, 7, "actinide", 1.3, "solid"],
  [98, "Cf", "Californium", 251, null, 7, "actinide", 1.3, "solid"],
  [99, "Es", "Einsteinium", 252, null, 7, "actinide", 1.3, "solid"],
  [100, "Fm", "Fermium", 257, null, 7, "actinide", 1.3, "solid"],
  [101, "Md", "Mendelevium", 258, null, 7, "actinide", 1.3, "solid"],
  [102, "No", "Nobelium", 259, null, 7, "actinide", 1.3, "solid"],
  [103, "Lr", "Lawrencium", 262, null, 7, "actinide", undefined, "solid"],
  [104, "Rf", "Rutherfordium", 261, 4, 7, "transition", undefined, "unknown"],
  [105, "Db", "Dubnium", 262, 5, 7, "transition", undefined, "unknown"],
  [106, "Sg", "Seaborgium", 266, 6, 7, "transition", undefined, "unknown"],
  [107, "Bh", "Bohrium", 264, 7, 7, "transition", undefined, "unknown"],
  [108, "Hs", "Hassium", 277, 8, 7, "transition", undefined, "unknown"],
  [109, "Mt", "Meitnerium", 268, 9, 7, "transition", undefined, "unknown"],
  [110, "Ds", "Darmstadtium", 281, 10, 7, "transition", undefined, "unknown"],
  [111, "Rg", "Roentgenium", 272, 11, 7, "transition", undefined, "unknown"],
  [112, "Cn", "Copernicium", 285, 12, 7, "transition", undefined, "unknown"],
  [113, "Nh", "Nihonium", 286, 13, 7, "post-transition", undefined, "unknown"],
  [114, "Fl", "Flerovium", 289, 14, 7, "post-transition", undefined, "unknown"],
  [115, "Mc", "Moscovium", 290, 15, 7, "post-transition", undefined, "unknown"],
  [116, "Lv", "Livermorium", 293, 16, 7, "post-transition", undefined, "unknown"],
  [117, "Ts", "Tennessine", 294, 17, 7, "halogen", undefined, "unknown"],
  [118, "Og", "Oganesson", 294, 18, 7, "noble", undefined, "unknown"],
];

export const DIATOMIC = new Set(["H", "N", "O", "F", "Cl", "Br", "I"]);
/** Ferromagnetic at room temperature. */
export const FERROMAGNETIC = new Set(["Fe", "Co", "Ni", "Gd"]);
/** No stable isotope; the data sheet brackets the mass number of the longest-lived one. */
export const RADIOACTIVE = new Set([
  "Tc", "Pm", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
  "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]);
/** Th, Pa and U have a standard atomic weight; the other radioactive elements get a bracketed mass number. */
const MASS_IN_BRACKETS = new Set([...RADIOACTIVE].filter((s) => !["Th", "Pa", "U"].includes(s)));

export function massInBrackets(e: Element): boolean {
  return MASS_IN_BRACKETS.has(e.symbol);
}

/**
 * The deeper properties, for hydrogen to barium and the extras on the
 * simplified table. Keyed by symbol.
 */
const DETAILS: Record<string, ElementDetail> = {
  H: { ionisation: [1312], melting: -259, boiling: -253, density: 0.00009, oxidation: [1, -1], notes: "The lightest element; a colourless diatomic gas (H₂) that burns in oxygen to give water. Made in the lab from an acid and a reactive metal; pops with a lighted splint." },
  He: { ionisation: [2372, 5251], melting: null, boiling: -269, density: 0.00018, oxidation: [0], notes: "Inert noble gas, lighter than air: balloons, airships and the coolant for MRI magnets. Does not freeze at normal pressure." },
  Li: { ionisation: [520, 7298, 11815], melting: 181, boiling: 1342, density: 0.53, oxidation: [1], notes: "The lightest metal, soft enough to cut; floats on oil, fizzes gently in water. Lithium-ion batteries." },
  Be: { ionisation: [900, 1757, 14849], melting: 1287, boiling: 2469, density: 1.85, oxidation: [2], notes: "Hard, light, grey metal; toxic dust. Alloys for springs and aircraft, X-ray windows." },
  B: { ionisation: [801, 2427, 3660], melting: 2076, boiling: 3927, density: 2.34, oxidation: [3], notes: "Metalloid; forms electron-deficient compounds such as BF₃. Borax, borosilicate (Pyrex) glass." },
  C: { ionisation: [1086, 2353, 4621], melting: null, boiling: null, density: 2.27, oxidation: [4, -4, 2], notes: "Diamond, graphite and the fullerenes are allotropes. Sublimes at about 3 640 °C rather than melting at normal pressure. The backbone of organic chemistry." },
  N: { ionisation: [1402, 2856, 4578], melting: -210, boiling: -196, density: 0.00125, oxidation: [-3, 5, 3, 2, 4], notes: "78 % of the air as unreactive N₂ (triple bond). Ammonia by the Haber process; nitric acid; fertilisers." },
  O: { ionisation: [1314, 3388, 5301], melting: -219, boiling: -183, density: 0.00143, oxidation: [-2, -1], notes: "21 % of the air as O₂; ozone O₃ is its other allotrope. Relights a glowing splint. −1 in peroxides." },
  F: { ionisation: [1681, 3374, 6050], melting: -220, boiling: -188, density: 0.0017, oxidation: [-1], notes: "The most electronegative element and the strongest oxidising agent; a pale yellow, very reactive gas. Teflon, toothpaste fluoride." },
  Ne: { ionisation: [2081, 3952, 6122], melting: -249, boiling: -246, density: 0.0009, oxidation: [0], notes: "Noble gas; glows orange-red in a discharge tube. Advertising signs." },
  Na: { ionisation: [496, 4562, 6910], melting: 98, boiling: 883, density: 0.97, oxidation: [1], notes: "Soft, silvery, stored under oil; reacts vigorously with water to give NaOH and H₂. Yellow flame colour. Table salt, NaOH, street lamps." },
  Mg: { ionisation: [738, 1451, 7733], melting: 650, boiling: 1090, density: 1.74, oxidation: [2], notes: "Burns with a brilliant white flame to give MgO; reacts slowly with cold water, quickly with steam. Light alloys, flares, chlorophyll." },
  Al: { ionisation: [578, 1817, 2745], melting: 660, boiling: 2519, density: 2.70, oxidation: [3], notes: "Light, strong, protected by a thin oxide layer so it seems unreactive. Extracted from bauxite by electrolysis (Hall–Héroult). Cans, foil, aircraft." },
  Si: { ionisation: [787, 1577, 3232], melting: 1414, boiling: 3265, density: 2.33, oxidation: [4, -4], notes: "Metalloid with a giant covalent (diamond-like) structure; semiconductor. Sand and quartz are SiO₂; glass, computer chips, silicones." },
  P: { ionisation: [1012, 1907, 2914], melting: 44, boiling: 281, density: 1.82, oxidation: [-3, 5, 3], notes: "White phosphorus (P₄) ignites in air and is stored under water; red phosphorus is safer (matchbox strikers). Melting and boiling points are white phosphorus. Fertilisers (phosphates), DNA." },
  S: { ionisation: [1000, 2252, 3357], melting: 115, boiling: 445, density: 2.07, oxidation: [-2, 4, 6], notes: "Brittle yellow solid of S₈ rings; burns with a blue flame to SO₂. Sulfuric acid (Contact process), vulcanised rubber, matches." },
  Cl: { ionisation: [1251, 2298, 3822], melting: -102, boiling: -34, density: 0.0032, oxidation: [-1, 1, 3, 5, 7], notes: "Pale green, poisonous diatomic gas; bleaches damp litmus. Water treatment, PVC, bleach, HCl. Displaces Br⁻ and I⁻ from solution." },
  Ar: { ionisation: [1521, 2666, 3931], melting: -189, boiling: -186, density: 0.0018, oxidation: [0], notes: "About 1 % of the air; the commonest noble gas. Fills light bulbs and shields welding." },
  K: { ionisation: [419, 3052, 4420], melting: 63, boiling: 759, density: 0.86, oxidation: [1], notes: "More reactive than sodium: ignites on water with a lilac flame. Potash fertilisers; K⁺ in nerve cells." },
  Ca: { ionisation: [590, 1145, 4912], melting: 842, boiling: 1484, density: 1.55, oxidation: [2], notes: "Reacts steadily with cold water, giving Ca(OH)₂ (limewater) and H₂. Brick-red flame. Limestone, bones and teeth, cement." },
  Sc: { ionisation: [633, 1235, 2389], melting: 1541, boiling: 2836, density: 2.99, oxidation: [3], notes: "Light transition metal, always +3 (one 3d electron). Aluminium–scandium alloys for aircraft." },
  Ti: { ionisation: [659, 1310, 2653], melting: 1668, boiling: 3287, density: 4.51, oxidation: [4, 3], notes: "Strong, light, corrosion-resistant: hip joints, aircraft. TiO₂ is the white pigment in paint and sunscreen." },
  V: { ionisation: [651, 1414, 2830], melting: 1910, boiling: 3407, density: 6.0, oxidation: [5, 4, 3, 2], notes: "Shows four colours in its four oxidation states (yellow, blue, green, violet). V₂O₅ is the catalyst in the Contact process." },
  Cr: { ionisation: [653, 1591, 2987], melting: 1907, boiling: 2671, density: 7.15, oxidation: [3, 6, 2], notes: "Hard, shiny, resists corrosion: chrome plating, stainless steel. Dichromate Cr₂O₇²⁻ (orange) is a strong oxidising agent, reduced to green Cr³⁺." },
  Mn: { ionisation: [717, 1509, 3248], melting: 1246, boiling: 2061, density: 7.3, oxidation: [2, 4, 7, 3, 6], notes: "Permanganate MnO₄⁻ (purple) is the classic oxidising agent in titrations, reduced to colourless Mn²⁺. MnO₂ catalyses the decomposition of H₂O₂; steel-making." },
  Fe: { ionisation: [762, 1562, 2957], melting: 1538, boiling: 2861, density: 7.87, oxidation: [2, 3], notes: "Ferromagnetic. Extracted in the blast furnace from haematite Fe₂O₃; rusts in damp air. Fe²⁺ pale green, Fe³⁺ yellow-brown. Haemoglobin, steel, the Haber process catalyst." },
  Co: { ionisation: [760, 1648, 3232], melting: 1495, boiling: 2927, density: 8.86, oxidation: [2, 3], notes: "Ferromagnetic. Cobalt chloride paper is blue when dry and pink when wet: the test for water. Vitamin B₁₂, blue glass, magnets." },
  Ni: { ionisation: [737, 1753, 3395], melting: 1455, boiling: 2913, density: 8.90, oxidation: [2], notes: "Ferromagnetic. Catalyst for hydrogenating oils to margarine; coins, stainless steel, rechargeable batteries. Ni²⁺ solutions are green." },
  Cu: { ionisation: [745, 1958, 3555], melting: 1085, boiling: 2562, density: 8.96, oxidation: [2, 1], notes: "Reddish metal, the best cheap conductor: wiring, pipes, coins. Cu²⁺ solutions are blue; copper below hydrogen in the activity series, so it does not react with dilute acids." },
  Zn: { ionisation: [906, 1733, 3833], melting: 420, boiling: 907, density: 7.14, oxidation: [2], notes: "Galvanising (sacrificial protection of iron), brass, the case of dry cells and the anode of the Zn/Cu cell. Zn²⁺ is colourless (full 3d)." },
  Ga: { ionisation: [579, 1979, 2963], melting: 30, boiling: 2204, density: 5.91, oxidation: [3], notes: "Melts in the hand. Gallium arsenide LEDs and solar cells." },
  Ge: { ionisation: [762, 1537, 3302], melting: 938, boiling: 2833, density: 5.32, oxidation: [4, 2], notes: "Metalloid semiconductor; the first transistors. Infrared optics." },
  As: { ionisation: [947, 1798, 2735], melting: null, boiling: null, density: 5.75, oxidation: [-3, 3, 5], notes: "Metalloid; sublimes at about 615 °C. Toxic; pesticides formerly, semiconductors (GaAs)." },
  Se: { ionisation: [941, 2045, 2974], melting: 221, boiling: 685, density: 4.81, oxidation: [-2, 4, 6], notes: "Non-metal below sulfur; photoconductive (photocopiers, light meters). An essential trace element." },
  Br: { ionisation: [1140, 2103, 3470], melting: -7, boiling: 59, density: 3.10, oxidation: [-1, 1, 5], notes: "The only liquid non-metal: dense, red-brown, choking fumes. Bromine water tests for C=C (decolourises). Displaced from bromides by chlorine." },
  Kr: { ionisation: [1351, 2350, 3565], melting: -157, boiling: -153, density: 0.0037, oxidation: [0, 2], notes: "Noble gas; forms KrF₂ under forcing conditions. High-performance lamps." },
  Rb: { ionisation: [403, 2633, 3860], melting: 39, boiling: 688, density: 1.53, oxidation: [1], notes: "Very reactive alkali metal; ignites in air. Atomic clocks." },
  Sr: { ionisation: [550, 1064, 4138], melting: 777, boiling: 1382, density: 2.64, oxidation: [2], notes: "Crimson flame colour: red fireworks and flares. Strontium-90 is a fallout isotope that collects in bone." },
  Y: { ionisation: [600, 1180, 1980], melting: 1522, boiling: 3345, density: 4.47, oxidation: [3], notes: "YAG lasers, the red phosphor in old televisions, superconductors (YBCO)." },
  Zr: { ionisation: [640, 1270, 2218], melting: 1855, boiling: 4409, density: 6.52, oxidation: [4], notes: "Corrosion-resistant; cladding for nuclear fuel rods. Cubic zirconia (ZrO₂) imitates diamond." },
  Nb: { ionisation: [652, 1380, 2416], melting: 2477, boiling: 4744, density: 8.57, oxidation: [5, 3], notes: "Superconducting magnets (Nb–Ti) in MRI scanners; steel alloys for pipelines." },
  Mo: { ionisation: [684, 1560, 2618], melting: 2623, boiling: 4639, density: 10.2, oxidation: [6, 4], notes: "Very high melting point; hardens steel. Part of the nitrogenase enzyme that fixes nitrogen." },
  Tc: { ionisation: [702, 1470, 2850], melting: 2157, boiling: 4265, density: 11.5, oxidation: [7, 4], notes: "The lightest element with no stable isotope; the first made artificially. Technetium-99m is the commonest medical imaging tracer." },
  Ru: { ionisation: [710, 1620, 2747], melting: 2334, boiling: 4150, density: 12.4, oxidation: [3, 4, 8], notes: "Hard platinum-group metal; hardens platinum and palladium; catalysts." },
  Rh: { ionisation: [720, 1744, 2997], melting: 1964, boiling: 3695, density: 12.4, oxidation: [3], notes: "Platinum-group metal; the key metal in catalytic converters for reducing NOₓ." },
  Pd: { ionisation: [804, 1870, 3177], melting: 1555, boiling: 2963, density: 12.0, oxidation: [2, 4], notes: "Absorbs hydrogen; catalytic converters, hydrogenation catalysts. A full 4d¹⁰ shell and no 5s electrons." },
  Ag: { ionisation: [731, 2070, 3361], melting: 962, boiling: 2162, density: 10.5, oxidation: [1], notes: "The best conductor of electricity and heat. Tarnishes with sulfur. Silver halides darken in light (photography); Ag⁺ precipitates Cl⁻, Br⁻, I⁻ as white, cream, yellow." },
  Cd: { ionisation: [868, 1631, 3616], melting: 321, boiling: 767, density: 8.69, oxidation: [2], notes: "Toxic heavy metal; nickel–cadmium batteries, control rods. Yellow pigment (CdS)." },
  In: { ionisation: [558, 1821, 2704], melting: 157, boiling: 2072, density: 7.31, oxidation: [3, 1], notes: "Soft metal; indium tin oxide is the transparent conductor in touch screens." },
  Sn: { ionisation: [709, 1412, 2943], melting: 232, boiling: 2602, density: 7.29, oxidation: [4, 2], notes: "Tin plate protects steel cans; solder, bronze (with copper). Sn²⁺ is a reducing agent." },
  Sb: { ionisation: [834, 1595, 2440], melting: 631, boiling: 1587, density: 6.68, oxidation: [3, 5, -3], notes: "Metalloid; hardens lead in batteries and bullets. Flame retardants." },
  Te: { ionisation: [869, 1790, 2698], melting: 450, boiling: 988, density: 6.24, oxidation: [-2, 4, 6], notes: "Metalloid; solar cells (CdTe), alloys. Gives garlic breath." },
  I: { ionisation: [1008, 1846, 3180], melting: 114, boiling: 184, density: 4.93, oxidation: [-1, 1, 5, 7], notes: "Grey-black solid that sublimes to a violet vapour. Blue-black with starch (the test for iodine or for starch). Antiseptic, thyroid hormone." },
  Xe: { ionisation: [1170, 2046, 3099], melting: -112, boiling: -108, density: 0.0059, oxidation: [0, 2, 4, 6], notes: "The noble gas that forms compounds most readily (XeF₂, XeF₄, XeO₃). Car headlamps, anaesthetic, ion engines." },
  Cs: { ionisation: [376, 2234, 3400], melting: 28, boiling: 671, density: 1.93, oxidation: [1], notes: "The most reactive metal that can be handled (francium is too radioactive); explodes in water. Defines the second (atomic clock).", check: "Third ionisation energy is from a secondary table." },
  Ba: { ionisation: [503, 965, 3600], melting: 727, boiling: 1897, density: 3.62, oxidation: [2], notes: "Apple-green flame colour. Barium sulfate is insoluble (the test for SO₄²⁻, the barium meal for X-rays); soluble barium salts are poisonous.", check: "Third ionisation energy is from a secondary table." },
  Pt: { ionisation: [870, 1791, 2800], melting: 1768, boiling: 3825, density: 21.5, oxidation: [2, 4], notes: "Inert, precious; the electrode in the standard hydrogen electrode and the catalyst in converters and the Ostwald process. Cisplatin treats cancer.", check: "Third ionisation energy is an estimate; most tables stop at the second." },
  Au: { ionisation: [890, 1980, 2900], melting: 1064, boiling: 2856, density: 19.3, oxidation: [3, 1], notes: "Unreactive, malleable, never tarnishes; dissolves only in aqua regia. South Africa's Witwatersrand produced much of the world's gold.", check: "Third ionisation energy is an estimate; most tables stop at the second." },
  Hg: { ionisation: [1007, 1810, 3300], melting: -39, boiling: 357, density: 13.5, oxidation: [2, 1], notes: "The only metal liquid at room temperature; toxic vapour. Thermometers and barometers formerly, fluorescent lamps, dental amalgam. Hg₂²⁺ is the +1 ion." },
  Pb: { ionisation: [716, 1450, 3081], melting: 327, boiling: 1749, density: 11.3, oxidation: [2, 4], notes: "Dense, soft, toxic; lead–acid car batteries (Pb / PbO₂), radiation shielding, formerly petrol and paint. PbI₂ is a bright yellow precipitate." },
  U: { ionisation: [598, 1420, 1900], melting: 1135, boiling: 4131, density: 19.1, oxidation: [6, 4], notes: "Radioactive; uranium-235 fissions in reactors and weapons, uranium-238 is used for dating rocks. The uranyl ion UO₂²⁺ is yellow.", check: "Third ionisation energy is an estimate in most tables." },
};

export const ELEMENTS: Element[] = ROWS.map(([z, symbol, name, mass, group, period, category, en, state]) => ({
  z,
  symbol,
  name,
  mass,
  group,
  period,
  category,
  en,
  state,
  diatomic: DIATOMIC.has(symbol) || undefined,
  ferromagnetic: FERROMAGNETIC.has(symbol) || undefined,
  radioactive: RADIOACTIVE.has(symbol) || undefined,
  detail: DETAILS[symbol],
}));

export function elementByZ(z: number): Element {
  const e = ELEMENTS[z - 1];
  if (!e || e.z !== z) throw new Error(`No element ${z}`);
  return e;
}

export function elementBySymbol(symbol: string): Element | undefined {
  return ELEMENTS.find((e) => e.symbol === symbol);
}

/**
 * The simplified table: the first 20 elements and the ones a school course
 * keeps meeting after that.
 */
export const SIMPLIFIED_EXTRAS = ["Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Br", "Kr", "Sr", "Ag", "Sn", "I", "Xe", "Ba", "Pt", "Au", "Hg", "Pb", "U"];

export function inSimplifiedTable(e: Element): boolean {
  return e.z <= 20 || SIMPLIFIED_EXTRAS.includes(e.symbol);
}

export type MetalCharacter = "metal" | "metalloid" | "non-metal";

export function metalCharacter(e: Element): MetalCharacter {
  if (e.category === "metalloid") return "metalloid";
  if (e.category === "nonmetal" || e.category === "halogen" || e.category === "noble") return "non-metal";
  return "metal";
}

/** Grid position: column 1–18 and row 1–7 for the main body, rows 9 and 10 for the f-block. */
export function gridPosition(e: Element): { column: number; row: number } {
  if (e.category === "lanthanide") return { column: e.z - 57 + 4, row: 9 };
  if (e.category === "actinide") return { column: e.z - 89 + 4, row: 10 };
  return { column: e.group!, row: e.period };
}
