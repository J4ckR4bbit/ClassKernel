// Common substances: the inorganic ones a school course keeps meeting, and
// the first members of the organic homologous series in the syllabus. Each
// molecular substance carries a structural formula bonds.ts can draw and
// count the bonds of; ionic substances are built from their ions.
//
// SOURCES: states and boiling points from the CRC Handbook at 101,3 kPa;
// whether a molecule is polar from its shape (the VSEPR result the course
// teaches). Molar masses are worked out from the data sheet's masses.

import { State } from "./elements";

export type Section = "inorganic" | "organic";
export type Bonding = "covalent molecular" | "ionic" | "metallic" | "giant covalent";

export interface IonPart {
  /** A polyatomic ion's id in ions.ts, or a monatomic ion written out: "Na⁺", "Cl⁻", "Fe³⁺". */
  ion: string;
  count: number;
}

export interface Substance {
  id: string;
  formula: string;
  name: string;
  section: Section;
  /** Inorganic: Element, Oxide, Acid, Base, Salt, Other molecule. Organic: the homologous series. */
  group: string;
  state: State;
  bonding: Bonding;
  /** For a molecular substance: the structural formula. */
  structure?: string;
  shape?: "bent";
  /** For an ionic substance: the ions in one formula unit. */
  ions?: IonPart[];
  /** Whether the molecule as a whole is polar (null when it isn't a molecule). */
  polarMolecule: boolean | null;
  /** Organic: the functional group and the condensed formula. */
  functionalGroup?: string;
  condensed?: string;
  /** °C at 101,3 kPa, where it helps (the organic series). */
  boiling?: number;
  notes: string;
}

const inorganic = (s: Omit<Substance, "section">): Substance => ({ ...s, section: "inorganic" });
const organic = (s: Omit<Substance, "section" | "bonding" | "polarMolecule"> & { polarMolecule?: boolean }): Substance => ({
  ...s,
  section: "organic",
  bonding: "covalent molecular",
  polarMolecule: s.polarMolecule ?? true,
});

export const SUBSTANCES: Substance[] = [
  // ---- Elements
  inorganic({ id: "h2", formula: "H₂", name: "Hydrogen", group: "Element", state: "gas", bonding: "covalent molecular", structure: "H-H", polarMolecule: false, notes: "Diatomic; the single bond is strong (436 kJ·mol⁻¹) but H₂ burns readily in O₂ once started. Pops with a lighted splint." }),
  inorganic({ id: "o2", formula: "O₂", name: "Oxygen", group: "Element", state: "gas", bonding: "covalent molecular", structure: "O=O", polarMolecule: false, notes: "Diatomic with a double bond. Relights a glowing splint. 21 % of air." }),
  inorganic({ id: "o3", formula: "O₃", name: "Ozone", group: "Element", state: "gas", bonding: "covalent molecular", structure: "O=O-O", shape: "bent", polarMolecule: true, notes: "Bent; the real bonds are both 1,5 (resonance). The ozone layer absorbs UV; at ground level a pollutant." }),
  inorganic({ id: "n2", formula: "N₂", name: "Nitrogen", group: "Element", state: "gas", bonding: "covalent molecular", structure: "N#N", polarMolecule: false, notes: "Triple bond, 945 kJ·mol⁻¹: why N₂ is so unreactive and the Haber process needs a catalyst, heat and pressure. 78 % of air." }),
  inorganic({ id: "f2", formula: "F₂", name: "Fluorine", group: "Element", state: "gas", bonding: "covalent molecular", structure: "F-F", polarMolecule: false, notes: "The weakest halogen–halogen bond (158 kJ·mol⁻¹) and the most reactive element." }),
  inorganic({ id: "cl2", formula: "Cl₂", name: "Chlorine", group: "Element", state: "gas", bonding: "covalent molecular", structure: "Cl-Cl", polarMolecule: false, notes: "Pale green gas; bleaches damp litmus; displaces Br⁻ and I⁻." }),
  inorganic({ id: "br2", formula: "Br₂", name: "Bromine", group: "Element", state: "liquid", bonding: "covalent molecular", structure: "Br-Br", polarMolecule: false, notes: "Red-brown liquid; bromine water is decolourised by an alkene (the test for C=C)." }),
  inorganic({ id: "i2", formula: "I₂", name: "Iodine", group: "Element", state: "solid", bonding: "covalent molecular", structure: "I-I", polarMolecule: false, notes: "Grey-black solid, violet vapour; blue-black with starch. The weakest, longest halogen bond." }),
  inorganic({ id: "c-diamond", formula: "C", name: "Carbon (diamond and graphite)", group: "Element", state: "solid", bonding: "giant covalent", polarMolecule: null, notes: "Giant covalent: every carbon bonded to four others in diamond (hard, insulator) or three in sheets in graphite (soft, conducts). C–C 347 kJ·mol⁻¹ throughout." }),
  inorganic({ id: "cu", formula: "Cu", name: "Copper", group: "Element", state: "solid", bonding: "metallic", polarMolecule: null, notes: "Metallic bonding: a lattice of Cu²⁺ ions in a sea of delocalised electrons, which is why it conducts and bends." }),
  inorganic({ id: "na", formula: "Na", name: "Sodium", group: "Element", state: "solid", bonding: "metallic", polarMolecule: null, notes: "Metallic bonding with one delocalised electron per atom: soft, low melting point, very reactive." }),

  // ---- Molecular compounds and oxides
  inorganic({ id: "h2o", formula: "H₂O", name: "Water", group: "Other molecule", state: "liquid", bonding: "covalent molecular", structure: "OH2", shape: "bent", polarMolecule: true, notes: "Bent (104,5°), two lone pairs on O, so the two polar O–H bonds don't cancel: a polar molecule with hydrogen bonding, hence the high boiling point." }),
  inorganic({ id: "h2o2", formula: "H₂O₂", name: "Hydrogen peroxide", group: "Other molecule", state: "liquid", bonding: "covalent molecular", structure: "HO-OH", polarMolecule: true, notes: "The weak O–O bond (146 kJ·mol⁻¹) is why it decomposes to water and oxygen, faster with MnO₂ or catalase." }),
  inorganic({ id: "co2", formula: "CO₂", name: "Carbon dioxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "O=C=O", polarMolecule: false, notes: "Linear, so the two polar C=O bonds cancel: non-polar. Each C=O here is about 805 kJ·mol⁻¹, more than the 745 average. Turns limewater milky." }),
  inorganic({ id: "co", formula: "CO", name: "Carbon monoxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "C#O", polarMolecule: true, notes: "A triple bond, the strongest known (1 072 kJ·mol⁻¹). Poisonous: binds to haemoglobin. From incomplete combustion." }),
  inorganic({ id: "nh3", formula: "NH₃", name: "Ammonia", group: "Base", state: "gas", bonding: "covalent molecular", structure: "NH3", polarMolecule: true, notes: "Trigonal pyramidal with a lone pair: polar, hydrogen-bonded, very soluble; a weak base. Haber process; fertilisers." }),
  inorganic({ id: "hcl", formula: "HCl", name: "Hydrogen chloride (hydrochloric acid)", group: "Acid", state: "gas", bonding: "covalent molecular", structure: "H-Cl", polarMolecule: true, notes: "A polar molecule as a gas; in water it ionises completely to H₃O⁺ and Cl⁻: a strong acid." }),
  inorganic({ id: "hf", formula: "HF", name: "Hydrogen fluoride (hydrofluoric acid)", group: "Acid", state: "gas", bonding: "covalent molecular", structure: "H-F", polarMolecule: true, notes: "The strongest hydrogen–halogen bond (567 kJ·mol⁻¹) and hydrogen bonding make HF a weak acid, unlike HCl." }),
  inorganic({ id: "hbr", formula: "HBr", name: "Hydrogen bromide", group: "Acid", state: "gas", bonding: "covalent molecular", structure: "H-Br", polarMolecule: true, notes: "Strong acid in water; the H–X bond weakens down the group, so acid strength rises HF < HCl < HBr < HI." }),
  inorganic({ id: "hi", formula: "HI", name: "Hydrogen iodide", group: "Acid", state: "gas", bonding: "covalent molecular", structure: "H-I", polarMolecule: true, notes: "The weakest H–X bond (299 kJ·mol⁻¹) and the strongest of the four acids." }),
  inorganic({ id: "h2s", formula: "H₂S", name: "Hydrogen sulfide", group: "Other molecule", state: "gas", bonding: "covalent molecular", structure: "SH2", shape: "bent", polarMolecule: true, notes: "Rotten-egg gas; bent like water but no hydrogen bonding (S is less electronegative), so it is a gas." }),
  inorganic({ id: "so2", formula: "SO₂", name: "Sulfur dioxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "O=S=O", shape: "bent", polarMolecule: true, notes: "Bent (a lone pair on S), polar. From burning sulfur and fossil fuels; acid rain; the Contact process." }),
  inorganic({ id: "so3", formula: "SO₃", name: "Sulfur trioxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "O=S(=O)=O", polarMolecule: false, notes: "Trigonal planar, non-polar. Made from SO₂ over V₂O₅; dissolved to give sulfuric acid." }),
  inorganic({ id: "no", formula: "NO", name: "Nitrogen monoxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "N=O", polarMolecule: true, notes: "An odd-electron molecule (a radical) from lightning and engines; oxidises in air to brown NO₂." }),
  inorganic({ id: "no2", formula: "NO₂", name: "Nitrogen dioxide", group: "Oxide", state: "gas", bonding: "covalent molecular", structure: "O=N-O", shape: "bent", polarMolecule: true, notes: "Brown, bent, an odd-electron molecule; the bonds are really 1,5 each. Acid rain and smog; the Ostwald process." }),
  inorganic({ id: "sio2", formula: "SiO₂", name: "Silicon dioxide (silica)", group: "Oxide", state: "solid", bonding: "giant covalent", polarMolecule: null, notes: "Giant covalent: each Si bonded to four O, each O to two Si. Sand, quartz, glass; very high melting point." }),
  inorganic({ id: "mgo", formula: "MgO", name: "Magnesium oxide", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Mg²⁺", count: 1 }, { ion: "O²⁻", count: 1 }], polarMolecule: null, notes: "Ionic lattice of Mg²⁺ and O²⁻; the double charges give a very high melting point (2 852 °C). A basic oxide; furnace linings." }),
  inorganic({ id: "cao", formula: "CaO", name: "Calcium oxide (quicklime)", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Ca²⁺", count: 1 }, { ion: "O²⁻", count: 1 }], polarMolecule: null, notes: "From heating limestone; reacts violently with water to give slaked lime, Ca(OH)₂." }),
  inorganic({ id: "cuo", formula: "CuO", name: "Copper(II) oxide", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Cu²⁺", count: 1 }, { ion: "O²⁻", count: 1 }], polarMolecule: null, notes: "Black basic oxide; reacts with dilute acids to give blue Cu²⁺ salts; reduced to copper by hydrogen or carbon." }),
  inorganic({ id: "fe2o3", formula: "Fe₂O₃", name: "Iron(III) oxide (rust, haematite)", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Fe³⁺", count: 2 }, { ion: "O²⁻", count: 3 }], polarMolecule: null, notes: "Rust and the main iron ore; reduced by CO in the blast furnace." }),
  inorganic({ id: "al2o3", formula: "Al₂O₃", name: "Aluminium oxide", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Al³⁺", count: 2 }, { ion: "O²⁻", count: 3 }], polarMolecule: null, notes: "Amphoteric; the protective layer on aluminium, bauxite, and electrolysed (in cryolite) to make the metal." }),
  inorganic({ id: "zno", formula: "ZnO", name: "Zinc oxide", group: "Oxide", state: "solid", bonding: "ionic", ions: [{ ion: "Zn²⁺", count: 1 }, { ion: "O²⁻", count: 1 }], polarMolecule: null, notes: "Amphoteric white powder, yellow when hot; sunscreen, calamine." }),

  // ---- Acids (molecular)
  inorganic({ id: "h2so4", formula: "H₂SO₄", name: "Sulfuric acid", group: "Acid", state: "liquid", bonding: "covalent molecular", structure: "HO-S(=O)(=O)-OH", polarMolecule: true, notes: "Strong diprotic acid; a dehydrating agent when concentrated (chars sugar). Contact process; car batteries, fertilisers." }),
  inorganic({ id: "hno3", formula: "HNO₃", name: "Nitric acid", group: "Acid", state: "liquid", bonding: "covalent molecular", structure: "HO-N(=O)=O", polarMolecule: true, notes: "Strong acid and oxidising agent; dissolves copper with brown NO₂ fumes. Ostwald process; fertilisers, explosives." }),
  inorganic({ id: "h3po4", formula: "H₃PO₄", name: "Phosphoric acid", group: "Acid", state: "solid", bonding: "covalent molecular", structure: "HO-P(=O)(-OH)-OH", polarMolecule: true, notes: "Weak triprotic acid; cola drinks, rust remover, fertilisers." }),
  inorganic({ id: "h2co3", formula: "H₂CO₃", name: "Carbonic acid", group: "Acid", state: "liquid", bonding: "covalent molecular", structure: "HO-C(=O)-OH", polarMolecule: true, notes: "CO₂ dissolved in water; weak, diprotic, and mostly still CO₂(aq). Soda water, rain, blood buffer." }),

  // ---- Bases and salts (ionic)
  inorganic({ id: "naoh", formula: "NaOH", name: "Sodium hydroxide", group: "Base", state: "solid", bonding: "ionic", ions: [{ ion: "Na⁺", count: 1 }, { ion: "hydroxide", count: 1 }], polarMolecule: null, notes: "Strong base; deliquescent, absorbs CO₂. Soap, paper, drain cleaner." }),
  inorganic({ id: "koh", formula: "KOH", name: "Potassium hydroxide", group: "Base", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 1 }, { ion: "hydroxide", count: 1 }], polarMolecule: null, notes: "Strong base; alkaline batteries, soft soap." }),
  inorganic({ id: "caoh2", formula: "Ca(OH)₂", name: "Calcium hydroxide (slaked lime)", group: "Base", state: "solid", bonding: "ionic", ions: [{ ion: "Ca²⁺", count: 1 }, { ion: "hydroxide", count: 2 }], polarMolecule: null, notes: "Sparingly soluble: limewater. Neutralises acid soil, mortar." }),
  inorganic({ id: "mgoh2", formula: "Mg(OH)₂", name: "Magnesium hydroxide", group: "Base", state: "solid", bonding: "ionic", ions: [{ ion: "Mg²⁺", count: 1 }, { ion: "hydroxide", count: 2 }], polarMolecule: null, notes: "Milk of magnesia, an antacid: so insoluble it is safe to swallow." }),
  inorganic({ id: "nacl", formula: "NaCl", name: "Sodium chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Na⁺", count: 1 }, { ion: "Cl⁻", count: 1 }], polarMolecule: null, notes: "Table salt: a cubic lattice of Na⁺ and Cl⁻, each surrounded by six of the other. Melts at 801 °C; conducts when molten or dissolved." }),
  inorganic({ id: "kbr", formula: "KBr", name: "Potassium bromide", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 1 }, { ion: "Br⁻", count: 1 }], polarMolecule: null, notes: "Chlorine displaces bromine from it: Cl₂ + 2KBr → 2KCl + Br₂." }),
  inorganic({ id: "ki", formula: "KI", name: "Potassium iodide", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 1 }, { ion: "I⁻", count: 1 }], polarMolecule: null, notes: "Iodised salt; gives yellow PbI₂ with lead nitrate; oxidised to iodine by chlorine or H₂O₂." }),
  inorganic({ id: "mgcl2", formula: "MgCl₂", name: "Magnesium chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Mg²⁺", count: 1 }, { ion: "Cl⁻", count: 2 }], polarMolecule: null, notes: "From magnesium and hydrochloric acid; in sea water; electrolysed for magnesium." }),
  inorganic({ id: "cacl2", formula: "CaCl₂", name: "Calcium chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Ca²⁺", count: 1 }, { ion: "Cl⁻", count: 2 }], polarMolecule: null, notes: "A drying agent (hygroscopic); de-icing roads." }),
  inorganic({ id: "caco3", formula: "CaCO₃", name: "Calcium carbonate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Ca²⁺", count: 1 }, { ion: "carbonate", count: 1 }], polarMolecule: null, notes: "Limestone, marble, chalk, shells. Insoluble; fizzes with acid; decomposes to CaO and CO₂ when heated." }),
  inorganic({ id: "na2co3", formula: "Na₂CO₃", name: "Sodium carbonate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Na⁺", count: 2 }, { ion: "carbonate", count: 1 }], polarMolecule: null, notes: "Washing soda; a weak base in solution; a primary standard for acids." }),
  inorganic({ id: "nahco3", formula: "NaHCO₃", name: "Sodium hydrogen carbonate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Na⁺", count: 1 }, { ion: "hydrogen-carbonate", count: 1 }], polarMolecule: null, notes: "Baking soda: gives CO₂ with acid or heat. Antacid; fire extinguishers." }),
  inorganic({ id: "cuso4", formula: "CuSO₄", name: "Copper(II) sulfate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Cu²⁺", count: 1 }, { ion: "sulfate", count: 1 }], polarMolecule: null, notes: "White anhydrous, blue as the pentahydrate CuSO₄·5H₂O: the test for water. Fungicide; electroplating; the Zn/Cu cell." }),
  inorganic({ id: "na2so4", formula: "Na₂SO₄", name: "Sodium sulfate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Na⁺", count: 2 }, { ion: "sulfate", count: 1 }], polarMolecule: null, notes: "The salt from NaOH and H₂SO₄; detergents, glass." }),
  inorganic({ id: "baso4", formula: "BaSO₄", name: "Barium sulfate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Ba²⁺", count: 1 }, { ion: "sulfate", count: 1 }], polarMolecule: null, notes: "The white precipitate that tests for sulfate; so insoluble it is swallowed for X-rays." }),
  inorganic({ id: "agno3", formula: "AgNO₃", name: "Silver nitrate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Ag⁺", count: 1 }, { ion: "nitrate", count: 1 }], polarMolecule: null, notes: "Tests for halides: white AgCl, cream AgBr, yellow AgI. Darkens in light on skin." }),
  inorganic({ id: "agcl", formula: "AgCl", name: "Silver chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Ag⁺", count: 1 }, { ion: "Cl⁻", count: 1 }], polarMolecule: null, notes: "The white, light-sensitive precipitate from Ag⁺ and Cl⁻; dissolves in ammonia." }),
  inorganic({ id: "kno3", formula: "KNO₃", name: "Potassium nitrate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 1 }, { ion: "nitrate", count: 1 }], polarMolecule: null, notes: "Saltpetre: the oxidiser in gunpowder; fertiliser; the usual salt-bridge electrolyte." }),
  inorganic({ id: "nh4cl", formula: "NH₄Cl", name: "Ammonium chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "ammonium", count: 1 }, { ion: "Cl⁻", count: 1 }], polarMolecule: null, notes: "Sublimes when heated (really decomposes to NH₃ and HCl and re-forms). Slightly acidic in solution; dry cells." }),
  inorganic({ id: "nh4no3", formula: "NH₄NO₃", name: "Ammonium nitrate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "ammonium", count: 1 }, { ion: "nitrate", count: 1 }], polarMolecule: null, notes: "Fertiliser and explosive; dissolving it in water is strongly endothermic (cold packs)." }),
  inorganic({ id: "fecl3", formula: "FeCl₃", name: "Iron(III) chloride", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Fe³⁺", count: 1 }, { ion: "Cl⁻", count: 3 }], polarMolecule: null, notes: "Yellow-brown solutions; etches copper circuit boards; acidic by hydrolysis." }),
  inorganic({ id: "feso4", formula: "FeSO₄", name: "Iron(II) sulfate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Fe²⁺", count: 1 }, { ion: "sulfate", count: 1 }], polarMolecule: null, notes: "Pale green; a reducing agent titrated against permanganate; iron supplements." }),
  inorganic({ id: "znso4", formula: "ZnSO₄", name: "Zinc sulfate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Zn²⁺", count: 1 }, { ion: "sulfate", count: 1 }], polarMolecule: null, notes: "The colourless electrolyte of the zinc half-cell." }),
  inorganic({ id: "pbi2", formula: "PbI₂", name: "Lead(II) iodide", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "Pb²⁺", count: 1 }, { ion: "I⁻", count: 2 }], polarMolecule: null, notes: "The bright yellow precipitate of the 'golden rain' demonstration." }),
  inorganic({ id: "kmno4", formula: "KMnO₄", name: "Potassium permanganate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 1 }, { ion: "permanganate", count: 1 }], polarMolecule: null, notes: "Deep purple crystals; the classic oxidising agent for redox titrations and for testing alkenes." }),
  inorganic({ id: "k2cr2o7", formula: "K₂Cr₂O₇", name: "Potassium dichromate", group: "Salt", state: "solid", bonding: "ionic", ions: [{ ion: "K⁺", count: 2 }, { ion: "dichromate", count: 1 }], polarMolecule: null, notes: "Orange crystals; oxidises alcohols (turns green) — the breathalyser reaction. Toxic and carcinogenic." }),

  // ---- Organic: alkanes
  organic({ id: "methane", formula: "CH₄", name: "Methane", group: "Alkanes", state: "gas", structure: "CH4", condensed: "CH₄", functionalGroup: "C–C and C–H single bonds only (saturated)", boiling: -162, polarMolecule: false, notes: "Natural gas. Tetrahedral and non-polar: only London forces, so a gas. Burns to CO₂ and water." }),
  organic({ id: "ethane", formula: "C₂H₆", name: "Ethane", group: "Alkanes", state: "gas", structure: "CH3-CH3", condensed: "CH₃CH₃", functionalGroup: "C–C and C–H single bonds only (saturated)", boiling: -89, polarMolecule: false, notes: "Second alkane; from natural gas; cracked to ethene." }),
  organic({ id: "propane", formula: "C₃H₈", name: "Propane", group: "Alkanes", state: "gas", structure: "CH3-CH2-CH3", condensed: "CH₃CH₂CH₃", functionalGroup: "C–C and C–H single bonds only (saturated)", boiling: -42, polarMolecule: false, notes: "LPG; boiling point rises along the series as London forces grow with chain length." }),
  // ---- Alkenes
  organic({ id: "ethene", formula: "C₂H₄", name: "Ethene", group: "Alkenes", state: "gas", structure: "CH2=CH2", condensed: "CH₂=CH₂", functionalGroup: "C=C double bond (unsaturated)", boiling: -104, polarMolecule: false, notes: "Planar; the C=C (614) is less than two C–C (694), so the π bond opens easily: addition reactions, polymerisation to polythene. Decolourises bromine water. Ripens fruit." }),
  organic({ id: "propene", formula: "C₃H₆", name: "Propene", group: "Alkenes", state: "gas", structure: "CH2=CH-CH3", condensed: "CH₂=CHCH₃", functionalGroup: "C=C double bond (unsaturated)", boiling: -48, polarMolecule: false, notes: "Polymerised to polypropene; adds HBr by Markovnikov's rule to 2-bromopropane." }),
  // ---- Alkynes
  organic({ id: "ethyne", formula: "C₂H₂", name: "Ethyne (acetylene)", group: "Alkynes", state: "gas", structure: "CH≡CH", condensed: "CH≡CH", functionalGroup: "C≡C triple bond (unsaturated)", boiling: -84, polarMolecule: false, notes: "Linear; welding gas (very hot flame). Made from calcium carbide and water." }),
  organic({ id: "propyne", formula: "C₃H₄", name: "Propyne", group: "Alkynes", state: "gas", structure: "CH≡C-CH3", condensed: "CH≡CCH₃", functionalGroup: "C≡C triple bond (unsaturated)", boiling: -23, polarMolecule: false, notes: "Second alkyne; adds two moles of Br₂ or H₂ across the triple bond." }),
  // ---- Alcohols
  organic({ id: "methanol", formula: "CH₃OH", name: "Methanol", group: "Alcohols", state: "liquid", structure: "CH3-OH", condensed: "CH₃OH", functionalGroup: "Hydroxyl –OH", boiling: 65, notes: "Toxic (blindness); solvent, fuel, methylated spirits. The –OH gives hydrogen bonding, so a liquid." }),
  organic({ id: "ethanol", formula: "C₂H₅OH", name: "Ethanol", group: "Alcohols", state: "liquid", structure: "CH3-CH2-OH", condensed: "CH₃CH₂OH", functionalGroup: "Hydroxyl –OH", boiling: 78, notes: "Alcohol in drinks, from fermentation of sugars; hydration of ethene industrially. Oxidised by dichromate to ethanal then ethanoic acid." }),
  organic({ id: "propan-1-ol", formula: "C₃H₇OH", name: "Propan-1-ol", group: "Alcohols", state: "liquid", structure: "CH3-CH2-CH2-OH", condensed: "CH₃CH₂CH₂OH", functionalGroup: "Hydroxyl –OH (primary)", boiling: 97, notes: "Primary alcohol: the –OH is on an end carbon. Oxidised to propanal, then propanoic acid." }),
  organic({ id: "propan-2-ol", formula: "C₃H₇OH", name: "Propan-2-ol", group: "Alcohols", state: "liquid", structure: "CH3-CH(-OH)-CH3", condensed: "CH₃CH(OH)CH₃", functionalGroup: "Hydroxyl –OH (secondary)", boiling: 82, notes: "Secondary alcohol, a positional isomer of propan-1-ol; rubbing alcohol. Oxidised to propanone (a ketone), no further." }),
  // ---- Carboxylic acids
  organic({ id: "methanoic-acid", formula: "HCOOH", name: "Methanoic acid", group: "Carboxylic acids", state: "liquid", structure: "H-C(=O)-OH", condensed: "HCOOH", functionalGroup: "Carboxyl –COOH", boiling: 101, notes: "Formic acid: ant and nettle stings. A weak acid (Ka = 1,8 × 10⁻⁴)." }),
  organic({ id: "ethanoic-acid", formula: "CH₃COOH", name: "Ethanoic acid", group: "Carboxylic acids", state: "liquid", structure: "CH3-C(=O)-OH", condensed: "CH₃COOH", functionalGroup: "Carboxyl –COOH", boiling: 118, notes: "Vinegar. Weak acid (Ka = 1,8 × 10⁻⁵). Esterified with ethanol to ethyl ethanoate. Hydrogen-bonded dimers raise its boiling point." }),
  organic({ id: "propanoic-acid", formula: "C₂H₅COOH", name: "Propanoic acid", group: "Carboxylic acids", state: "liquid", structure: "CH3-CH2-C(=O)-OH", condensed: "CH₃CH₂COOH", functionalGroup: "Carboxyl –COOH", boiling: 141, notes: "Preservative (calcium propanoate in bread). From oxidising propan-1-ol." }),
  // ---- Esters
  organic({ id: "methyl-methanoate", formula: "HCOOCH₃", name: "Methyl methanoate", group: "Esters", state: "liquid", structure: "H-C(=O)-O-CH3", condensed: "HCOOCH₃", functionalGroup: "Ester –COO–", boiling: 32, notes: "From methanoic acid and methanol. The alcohol part names the alkyl group, the acid part the -oate." }),
  organic({ id: "methyl-ethanoate", formula: "CH₃COOCH₃", name: "Methyl ethanoate", group: "Esters", state: "liquid", structure: "CH3-C(=O)-O-CH3", condensed: "CH₃COOCH₃", functionalGroup: "Ester –COO–", boiling: 57, notes: "From ethanoic acid and methanol; glue and nail-varnish solvent." }),
  organic({ id: "ethyl-methanoate", formula: "HCOOC₂H₅", name: "Ethyl methanoate", group: "Esters", state: "liquid", structure: "H-C(=O)-O-CH2-CH3", condensed: "HCOOCH₂CH₃", functionalGroup: "Ester –COO–", boiling: 54, notes: "Rum and raspberry smell; an isomer of methyl ethanoate and of propanoic acid." }),
  organic({ id: "ethyl-ethanoate", formula: "CH₃COOC₂H₅", name: "Ethyl ethanoate", group: "Esters", state: "liquid", structure: "CH3-C(=O)-O-CH2-CH3", condensed: "CH₃COOCH₂CH₃", functionalGroup: "Ester –COO–", boiling: 77, notes: "The textbook ester: ethanoic acid + ethanol with concentrated H₂SO₄, warmed. Pear-drop smell; nail-varnish remover." }),
  organic({ id: "propyl-ethanoate", formula: "CH₃COOC₃H₇", name: "Propyl ethanoate", group: "Esters", state: "liquid", structure: "CH3-C(=O)-O-CH2-CH2-CH3", condensed: "CH₃COOCH₂CH₂CH₃", functionalGroup: "Ester –COO–", boiling: 102, notes: "Pear smell; from ethanoic acid and propan-1-ol." }),
  organic({ id: "ethyl-propanoate", formula: "C₂H₅COOC₂H₅", name: "Ethyl propanoate", group: "Esters", state: "liquid", structure: "CH3-CH2-C(=O)-O-CH2-CH3", condensed: "CH₃CH₂COOCH₂CH₃", functionalGroup: "Ester –COO–", boiling: 99, notes: "Pineapple smell; from propanoic acid and ethanol." }),
];

export function substanceById(id: string): Substance | undefined {
  return SUBSTANCES.find((s) => s.id === id);
}

export const INORGANIC_GROUPS = ["Element", "Oxide", "Acid", "Base", "Salt", "Other molecule"];
export const ORGANIC_GROUPS = ["Alkanes", "Alkenes", "Alkynes", "Alcohols", "Carboxylic acids", "Esters"];

/** "Na⁺" → { symbol: "Na", charge: 1 }, "O²⁻" → { symbol: "O", charge: -2 }. */
export function parseMonatomicIon(text: string): { symbol: string; charge: number } | null {
  const m = /^([A-Z][a-z]?)([²³]?)([⁺⁻])$/.exec(text);
  if (!m) return null;
  const magnitude = m[2] === "²" ? 2 : m[2] === "³" ? 3 : 1;
  return { symbol: m[1], charge: m[3] === "⁺" ? magnitude : -magnitude };
}
