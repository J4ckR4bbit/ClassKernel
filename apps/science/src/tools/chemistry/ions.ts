// Polyatomic ions — the table the IEB SAG expects learners to know, plus the
// ones that keep turning up. Salts in substanceData.ts are built from these;
// the Polyatomic ions module lists them.
//
// `syllabus` marks the ions in the SAG's table of common polyatomic ions as
// best I have it; confirm against your copy and correct the flag here.
// The structure is for drawing: charges and resonance are not drawn, so
// nitrate shows one N=O and two N–O; the Lewis diagram puts the formal
// charges on those two oxygens, and the notes mention the resonance.
//
// SOURCES: solubility rules as the CAPS / IEB course states them; colours
// and uses from the CRC Handbook and standard school texts.

export interface PolyatomicIon {
  id: string;
  formula: string;
  name: string;
  charge: number;
  /** A structural formula bonds.ts can parse (no charges). */
  structure: string;
  shape?: "bent";
  /** In the SAG's table of common polyatomic ions. */
  syllabus: boolean;
  /** The acid (or base) it comes from. */
  parent?: string;
  /** Where it turns up: common salts and compounds. */
  occurs: string[];
  /** The solubility rule for its salts. */
  solubility?: string;
  /** Its colour in solution, if any. */
  colour?: string;
  /** How it is tested for, if the course has a test. */
  test?: string;
  notes: string;
}

export const POLYATOMIC_IONS: PolyatomicIon[] = [
  { id: "ammonium", formula: "NH₄⁺", name: "Ammonium", charge: 1, structure: "NH4", syllabus: true, parent: "Ammonia, NH₃ (its conjugate base)", occurs: ["NH₄Cl", "NH₄NO₃ (fertiliser, cold packs)", "(NH₄)₂SO₄"], solubility: "All ammonium salts are soluble.", test: "Warm with NaOH: ammonia gas turns damp red litmus blue.", notes: "The only common polyatomic cation: tetrahedral, like methane, with the formal charge on N. A weak acid in solution (Ka = 5,6 × 10⁻¹⁰), so ammonium salts are slightly acidic." },
  { id: "hydronium", formula: "H₃O⁺", name: "Hydronium (oxonium)", charge: 1, structure: "OH3", syllabus: true, parent: "Water, H₂O", occurs: ["Every acidic solution"], notes: "A proton on a water molecule: what an acid really puts into solution. Trigonal pyramidal, one lone pair on O. pH = −log[H₃O⁺]." },
  { id: "mercury-i", formula: "Hg₂²⁺", name: "Mercury(I) (dimercury)", charge: 2, structure: "Hg-Hg", syllabus: false, occurs: ["Hg₂Cl₂ (calomel)"], solubility: "Hg₂Cl₂ is insoluble.", notes: "The one common polyatomic metal cation: two mercury atoms bonded together, each +1. Hg²⁺ is mercury(II)." },
  { id: "hydroxide", formula: "OH⁻", name: "Hydroxide", charge: -1, structure: "O-H", syllabus: true, parent: "Water (its conjugate acid)", occurs: ["NaOH, KOH (strong bases)", "Ca(OH)₂ (limewater)", "Mg(OH)₂ (milk of magnesia)", "Al(OH)₃, Fe(OH)₃ (precipitates)"], solubility: "Group 1 and Ba(OH)₂ soluble; Ca(OH)₂ sparingly; the rest insoluble.", test: "Turns red litmus blue; phenolphthalein pink.", notes: "The ion every base gives in water; three lone pairs on O carry the charge. Precipitates most metal ions as coloured hydroxides (Cu(OH)₂ blue, Fe(OH)₃ rust brown)." },
  { id: "nitrate", formula: "NO₃⁻", name: "Nitrate", charge: -1, structure: "O-N(=O)-O", syllabus: true, parent: "Nitric acid, HNO₃", occurs: ["KNO₃ (saltpetre, salt bridges)", "NH₄NO₃", "AgNO₃", "Pb(NO₃)₂"], solubility: "All nitrates are soluble.", test: "Brown ring test (with FeSO₄ and concentrated H₂SO₄), or NO₂ fumes on heating.", notes: "Trigonal planar; the three N–O bonds are equal by resonance (each 1⅓), though the diagram shows one double bond. Fertilisers; eutrophication when it runs off." },
  { id: "nitrite", formula: "NO₂⁻", name: "Nitrite", charge: -1, structure: "O-N=O", shape: "bent", syllabus: true, parent: "Nitrous acid, HNO₂ (weak)", occurs: ["NaNO₂ (cured meats)"], solubility: "Soluble.", notes: "Bent, with a lone pair on N; two resonance forms. Preservative in bacon and ham." },
  { id: "sulfate", formula: "SO₄²⁻", name: "Sulfate", charge: -2, structure: "O-S(=O)(=O)-O", syllabus: true, parent: "Sulfuric acid, H₂SO₄", occurs: ["CuSO₄ (blue)", "Na₂SO₄", "MgSO₄ (Epsom salts)", "CaSO₄ (gypsum, plaster)", "BaSO₄"], solubility: "Soluble except BaSO₄, PbSO₄ (insoluble) and CaSO₄, Ag₂SO₄ (sparingly).", test: "Add Ba²⁺ (barium chloride or nitrate) in acid: a white precipitate of BaSO₄.", notes: "Tetrahedral; S has an expanded octet, so its formal charge is zero and the two single-bonded oxygens carry the charge. Colourless." },
  { id: "hydrogen-sulfate", formula: "HSO₄⁻", name: "Hydrogen sulfate", charge: -1, structure: "HO-S(=O)(=O)-O", syllabus: true, parent: "Sulfuric acid, H₂SO₄ (first proton gone)", occurs: ["NaHSO₄ (pool pH-minus)"], solubility: "Soluble.", notes: "Amphiprotic: a weak acid in its own right (Ka = 1,0 × 10⁻²) and the conjugate base of H₂SO₄." },
  { id: "sulfite", formula: "SO₃²⁻", name: "Sulfite", charge: -2, structure: "O-S(=O)-O", syllabus: true, parent: "Sulfurous acid, H₂SO₃ (SO₂ in water)", occurs: ["Na₂SO₃ (preservative in wine and dried fruit)"], solubility: "Group 1 and ammonium soluble; most others insoluble.", test: "Acid gives SO₂, which turns acidified dichromate paper green.", notes: "Trigonal pyramidal with a lone pair on S. A reducing agent; oxidised to sulfate by air or by oxidising agents." },
  { id: "hydrogen-sulfite", formula: "HSO₃⁻", name: "Hydrogen sulfite", charge: -1, structure: "HO-S(=O)-O", syllabus: false, parent: "Sulfurous acid, H₂SO₃", occurs: ["NaHSO₃, Ca(HSO₃)₂ (paper making)"], solubility: "Soluble.", notes: "Amphiprotic, like hydrogen carbonate. Bisulfite in older books." },
  { id: "thiosulfate", formula: "S₂O₃²⁻", name: "Thiosulfate", charge: -2, structure: "O-S(=O)(=S)-O", syllabus: true, parent: "Thiosulfuric acid (unstable)", occurs: ["Na₂S₂O₃ (hypo)"], solubility: "Soluble.", notes: "A sulfate with one O swapped for S. Iodine titrations (2S₂O₃²⁻ + I₂ → S₄O₆²⁻ + 2I⁻), photographic fixing, and the sulfur clock: with acid it slowly gives a milky precipitate of sulfur." },
  { id: "carbonate", formula: "CO₃²⁻", name: "Carbonate", charge: -2, structure: "O-C(=O)-O", syllabus: true, parent: "Carbonic acid, H₂CO₃", occurs: ["CaCO₃ (limestone, marble, chalk, shells)", "Na₂CO₃ (washing soda)", "CuCO₃ (green patina)"], solubility: "Only group 1 and ammonium carbonates are soluble.", test: "Add dilute acid: fizzing; the gas turns limewater milky.", notes: "Trigonal planar with three equal bonds by resonance (shown as one C=O). A weak base: carbonate solutions are alkaline. Decomposes to the oxide and CO₂ on strong heating (lime kilns)." },
  { id: "hydrogen-carbonate", formula: "HCO₃⁻", name: "Hydrogen carbonate (bicarbonate)", charge: -1, structure: "HO-C(=O)-O", syllabus: true, parent: "Carbonic acid, H₂CO₃", occurs: ["NaHCO₃ (baking soda)", "Ca(HCO₃)₂ (temporary hard water)"], solubility: "Soluble (group 1); the calcium and magnesium salts exist only in solution.", test: "Fizzes with acid, like carbonate; decomposes on gentle heating to the carbonate.", notes: "Amphiprotic: the blood's main buffer (H₂CO₃ / HCO₃⁻). Baking soda gives CO₂ with acid or heat." },
  { id: "phosphate", formula: "PO₄³⁻", name: "Phosphate", charge: -3, structure: "O-P(=O)(-O)-O", syllabus: true, parent: "Phosphoric acid, H₃PO₄", occurs: ["Ca₃(PO₄)₂ (rock phosphate, bone)", "Na₃PO₄", "DNA's backbone, ATP"], solubility: "Only group 1 and ammonium phosphates are soluble.", notes: "Tetrahedral, like sulfate, with P's expanded octet. Fertilisers (superphosphate); detergents (banned in places because of eutrophication)." },
  { id: "hydrogen-phosphate", formula: "HPO₄²⁻", name: "Hydrogen phosphate", charge: -2, structure: "HO-P(=O)(-O)-O", syllabus: true, parent: "Phosphoric acid, H₃PO₄ (two protons gone)", occurs: ["Na₂HPO₄", "the phosphate buffer in cells"], solubility: "Group 1 and ammonium soluble.", notes: "Amphiprotic; with H₂PO₄⁻ it buffers the inside of cells near pH 7,2." },
  { id: "dihydrogen-phosphate", formula: "H₂PO₄⁻", name: "Dihydrogen phosphate", charge: -1, structure: "HO-P(=O)(-OH)-O", syllabus: true, parent: "Phosphoric acid, H₃PO₄ (one proton gone)", occurs: ["NaH₂PO₄", "Ca(H₂PO₄)₂ (superphosphate fertiliser)"], solubility: "Soluble.", notes: "The first-stage ion of phosphoric acid; slightly acidic in solution." },
  { id: "ethanoate", formula: "CH₃COO⁻", name: "Ethanoate (acetate)", charge: -1, structure: "CH3-C(=O)-O", syllabus: true, parent: "Ethanoic acid, CH₃COOH", occurs: ["CH₃COONa (sodium ethanoate)", "Pb(CH₃COO)₂", "cellulose acetate"], solubility: "All ethanoates are soluble.", notes: "The two C–O bonds in the carboxylate are equal by resonance. The conjugate base of a weak acid, so a weak base: sodium ethanoate solution is slightly alkaline; the ethanoic acid / ethanoate buffer." },
  { id: "oxalate", formula: "C₂O₄²⁻", name: "Oxalate (ethanedioate)", charge: -2, structure: "O-C(=O)-C(=O)-O", syllabus: true, parent: "Oxalic acid, H₂C₂O₄", occurs: ["Na₂C₂O₄, K₂C₂O₄", "CaC₂O₄ (kidney stones)", "rhubarb leaves, spinach"], solubility: "Group 1 and ammonium soluble; most others, including calcium oxalate, insoluble.", notes: "Two carboxylates joined: a reducing agent, titrated against warm acidified permanganate (5C₂O₄²⁻ + 2MnO₄⁻ + 16H⁺ → 10CO₂ + 2Mn²⁺ + 8H₂O)." },
  { id: "permanganate", formula: "MnO₄⁻", name: "Permanganate (manganate(VII))", charge: -1, structure: "O-Mn(=O)(=O)=O", syllabus: true, parent: "Permanganic acid, HMnO₄ (not isolated)", occurs: ["KMnO₄ (Condy's crystals)"], solubility: "Soluble.", colour: "Deep purple", test: "Its own colour: decolourised by a reducing agent (an alkene, Fe²⁺, oxalate, sulfite).", notes: "Tetrahedral; manganese in its +7 state. A strong oxidising agent in acid, reduced to colourless Mn²⁺, so redox titrations with it need no indicator." },
  { id: "manganate", formula: "MnO₄²⁻", name: "Manganate (manganate(VI))", charge: -2, structure: "O-Mn(=O)(=O)-O", syllabus: false, occurs: ["K₂MnO₄"], colour: "Green", notes: "Manganese in its +6 state; the green seen when permanganate is reduced in alkali. Disproportionates in acid to MnO₄⁻ and MnO₂." },
  { id: "dichromate", formula: "Cr₂O₇²⁻", name: "Dichromate (dichromate(VI))", charge: -2, structure: "O-Cr(=O)(=O)-O-Cr(=O)(=O)-O", syllabus: true, parent: "Chromic acid, H₂Cr₂O₇ (not isolated)", occurs: ["K₂Cr₂O₇"], solubility: "Soluble.", colour: "Orange", test: "Its colour: turns green (Cr³⁺) with a reducing agent, such as an alcohol or SO₂.", notes: "Two CrO₄ tetrahedra sharing an oxygen, chromium +6. A strong oxidising agent in acid, reduced to green Cr³⁺: the old breathalyser; oxidising primary alcohols to acids. Toxic and carcinogenic." },
  { id: "chromate", formula: "CrO₄²⁻", name: "Chromate (chromate(VI))", charge: -2, structure: "O-Cr(=O)(=O)-O", syllabus: true, parent: "Chromic acid", occurs: ["K₂CrO₄", "PbCrO₄ (chrome yellow pigment)", "BaCrO₄"], solubility: "Group 1 and ammonium soluble; Pb, Ba, Ag chromates insoluble.", colour: "Yellow", notes: "Tetrahedral; in equilibrium with orange dichromate: 2CrO₄²⁻ + 2H⁺ ⇌ Cr₂O₇²⁻ + H₂O, so acid turns it orange and base turns it back — a Le Chatelier demonstration." },
  { id: "cyanide", formula: "CN⁻", name: "Cyanide", charge: -1, structure: "C#N", syllabus: true, parent: "Hydrogen cyanide, HCN (weak acid)", occurs: ["NaCN, KCN (gold extraction)", "cyanide in bitter almonds, cassava"], solubility: "Group 1 soluble; AgCN insoluble.", notes: "Triple bond, the charge on carbon. Highly toxic: binds the iron of the respiratory enzymes. Dissolves gold as [Au(CN)₂]⁻ in the cyanide process." },
  { id: "thiocyanate", formula: "SCN⁻", name: "Thiocyanate", charge: -1, structure: "S=C=N", syllabus: false, parent: "Thiocyanic acid, HSCN", occurs: ["KSCN, NH₄SCN"], colour: "Blood-red with Fe³⁺", test: "A sensitive test for Fe³⁺: the deep red FeSCN²⁺ complex.", notes: "Linear. The Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ equilibrium is the standard Le Chatelier demonstration." },
  { id: "hypochlorite", formula: "ClO⁻", name: "Hypochlorite (chlorate(I))", charge: -1, structure: "Cl-O", syllabus: true, parent: "Hypochlorous acid, HOCl (weak)", occurs: ["NaClO (household bleach)", "Ca(ClO)₂ (pool chlorine)"], solubility: "Soluble.", notes: "A strong oxidising agent: bleaches dyes, kills microbes. Made by passing chlorine into cold NaOH. Never mix bleach with acid (chlorine) or ammonia (chloramines)." },
  { id: "chlorite", formula: "ClO₂⁻", name: "Chlorite (chlorate(III))", charge: -1, structure: "O-Cl=O", shape: "bent", syllabus: false, parent: "Chlorous acid, HClO₂", occurs: ["NaClO₂ (textile bleaching, water treatment)"], notes: "Bent, like nitrite. Oxidising agent; chlorine dioxide is made from it." },
  { id: "chlorate", formula: "ClO₃⁻", name: "Chlorate (chlorate(V))", charge: -1, structure: "O-Cl(=O)=O", syllabus: true, parent: "Chloric acid, HClO₃", occurs: ["KClO₃ (matches, oxygen in the lab)", "NaClO₃ (weedkiller)"], solubility: "Soluble.", notes: "Trigonal pyramidal with a lone pair on Cl. Heated with MnO₂ it gives oxygen: 2KClO₃ → 2KCl + 3O₂. Explosive with sugar or sulfur." },
  { id: "perchlorate", formula: "ClO₄⁻", name: "Perchlorate (chlorate(VII))", charge: -1, structure: "O-Cl(=O)(=O)=O", syllabus: true, parent: "Perchloric acid, HClO₄ (the strongest common acid)", occurs: ["NH₄ClO₄ (rocket oxidiser)", "KClO₄"], solubility: "Soluble, except KClO₄ (sparingly).", notes: "Tetrahedral; chlorine +7. The solid-fuel booster oxidiser, though stable in cold solution." },
  { id: "bromate", formula: "BrO₃⁻", name: "Bromate (bromate(V))", charge: -1, structure: "O-Br(=O)=O", syllabus: false, parent: "Bromic acid, HBrO₃", occurs: ["KBrO₃ (clock reactions)"], notes: "Like chlorate. The bromate–bromide clock and the oscillating Belousov–Zhabotinsky reaction." },
  { id: "iodate", formula: "IO₃⁻", name: "Iodate (iodate(V))", charge: -1, structure: "O-I(=O)=O", syllabus: false, parent: "Iodic acid, HIO₃", occurs: ["KIO₃ (iodised salt, a primary standard for thiosulfate)"], notes: "With iodide in acid it gives iodine: IO₃⁻ + 5I⁻ + 6H⁺ → 3I₂ + 3H₂O (the iodine clock)." },
  { id: "peroxide", formula: "O₂²⁻", name: "Peroxide", charge: -2, structure: "O-O", syllabus: true, parent: "Hydrogen peroxide, H₂O₂", occurs: ["Na₂O₂, BaO₂", "H₂O₂ (hair bleach, antiseptic)"], notes: "Oxygen at −1, each O with three lone pairs. The weak O–O bond makes peroxides oxidising agents that decompose to oxygen (MnO₂ catalyses H₂O₂)." },
  { id: "silicate", formula: "SiO₃²⁻", name: "Silicate (metasilicate)", charge: -2, structure: "O-Si(=O)-O", syllabus: false, parent: "Silicic acid", occurs: ["Na₂SiO₃ (water glass)", "rocks: most of the Earth's crust"], solubility: "Group 1 silicates soluble; the rest insoluble.", notes: "The simplest formula for the chains and sheets of SiO₄ tetrahedra that make up rock, clay and glass. Chemical gardens grow in water glass." },
];

export function ionById(id: string): PolyatomicIon {
  const ion = POLYATOMIC_IONS.find((i) => i.id === id);
  if (!ion) throw new Error(`No polyatomic ion "${id}"`);
  return ion;
}

/** "2−", "+", "3−" the way a charge is written as a superscript. */
export function chargeText(charge: number): string {
  const magnitude = Math.abs(charge) === 1 ? "" : String(Math.abs(charge));
  return `${magnitude}${charge > 0 ? "+" : "−"}`;
}
