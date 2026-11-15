// Polyatomic ions — the table the IEB SAG and the DBE data sheet expect
// learners to know, plus the ones that keep turning up (dichromate,
// permanganate, thiosulfate, oxalate, cyanide). Salts in substances.ts are
// built from these; the Polyatomic ions module lists them.
//
// The structure is for drawing the bonds within the ion; charges and
// resonance are not drawn, so nitrate shows one N=O and two N–O.

export interface PolyatomicIon {
  id: string;
  formula: string;
  name: string;
  charge: number;
  /** A structural formula bonds.ts can parse (no charges). */
  structure: string;
  shape?: "bent";
  notes: string;
}

export const POLYATOMIC_IONS: PolyatomicIon[] = [
  { id: "ammonium", formula: "NH₄⁺", name: "Ammonium", charge: 1, structure: "NH4", notes: "The only common polyatomic cation. Ammonium salts are soluble; they give off NH₃ with a base (the test for NH₄⁺)." },
  { id: "hydronium", formula: "H₃O⁺", name: "Hydronium (oxonium)", charge: 1, structure: "OH3", notes: "A proton on water: what an acid really puts into solution." },
  { id: "hydroxide", formula: "OH⁻", name: "Hydroxide", charge: -1, structure: "O-H", notes: "The ion a base gives in water. Soluble hydroxides: group 1, Ba(OH)₂; sparingly: Ca(OH)₂; most others precipitate." },
  { id: "nitrate", formula: "NO₃⁻", name: "Nitrate", charge: -1, structure: "O-N(=O)-O", notes: "All nitrates are soluble. Fertilisers, explosives; HNO₃ is its acid." },
  { id: "nitrite", formula: "NO₂⁻", name: "Nitrite", charge: -1, structure: "O-N=O", shape: "bent", notes: "Cured meats; HNO₂ is a weak acid." },
  { id: "sulfate", formula: "SO₄²⁻", name: "Sulfate", charge: -2, structure: "O-S(=O)(=O)-O", notes: "Soluble except BaSO₄, PbSO₄, CaSO₄ (sparingly): the test for sulfate is a white precipitate with Ba²⁺." },
  { id: "hydrogen-sulfate", formula: "HSO₄⁻", name: "Hydrogen sulfate", charge: -1, structure: "HO-S(=O)(=O)-O", notes: "Amphiprotic; the second-stage ion of sulfuric acid, itself a weak acid (Ka = 1,0 × 10⁻²)." },
  { id: "sulfite", formula: "SO₃²⁻", name: "Sulfite", charge: -2, structure: "O-S(=O)-O", notes: "From SO₂ in water; a preservative (wine, dried fruit) and a reducing agent." },
  { id: "thiosulfate", formula: "S₂O₃²⁻", name: "Thiosulfate", charge: -2, structure: "O-S(=O)(=S)-O", notes: "Sodium thiosulfate ('hypo') in iodine titrations and photographic fixing; the sulfur clock reaction with acid." },
  { id: "carbonate", formula: "CO₃²⁻", name: "Carbonate", charge: -2, structure: "O-C(=O)-O", notes: "Soluble only for group 1 and ammonium. Fizzes CO₂ with acid (the test for carbonate). Limestone, washing soda." },
  { id: "hydrogen-carbonate", formula: "HCO₃⁻", name: "Hydrogen carbonate (bicarbonate)", charge: -1, structure: "HO-C(=O)-O", notes: "Amphiprotic; baking soda, blood buffer, temporary hardness of water." },
  { id: "phosphate", formula: "PO₄³⁻", name: "Phosphate", charge: -3, structure: "O-P(=O)(-O)-O", notes: "Fertilisers, bones and teeth, DNA's backbone. Most phosphates are insoluble except group 1 and ammonium." },
  { id: "hydrogen-phosphate", formula: "HPO₄²⁻", name: "Hydrogen phosphate", charge: -2, structure: "HO-P(=O)(-O)-O", notes: "Phosphate buffer in cells; second-stage ion of phosphoric acid." },
  { id: "dihydrogen-phosphate", formula: "H₂PO₄⁻", name: "Dihydrogen phosphate", charge: -1, structure: "HO-P(=O)(-OH)-O", notes: "First-stage ion of phosphoric acid; fertiliser salts." },
  { id: "ethanoate", formula: "CH₃COO⁻", name: "Ethanoate (acetate)", charge: -1, structure: "CH3-C(=O)-O", notes: "The conjugate base of ethanoic acid; a weak base in solution, so sodium ethanoate is slightly alkaline." },
  { id: "oxalate", formula: "C₂O₄²⁻", name: "Oxalate (ethanedioate)", charge: -2, structure: "O-C(=O)-C(=O)-O", notes: "From oxalic acid; titrated against permanganate. Calcium oxalate is kidney stones; rhubarb leaves." },
  { id: "permanganate", formula: "MnO₄⁻", name: "Permanganate", charge: -1, structure: "O-Mn(=O)(=O)=O", notes: "Deep purple, a strong oxidising agent in acid, reduced to colourless Mn²⁺: redox titrations need no indicator." },
  { id: "dichromate", formula: "Cr₂O₇²⁻", name: "Dichromate", charge: -2, structure: "O-Cr(=O)(=O)-O-Cr(=O)(=O)-O", notes: "Orange; a strong oxidising agent in acid, reduced to green Cr³⁺: the old breathalyser, oxidising alcohols." },
  { id: "chromate", formula: "CrO₄²⁻", name: "Chromate", charge: -2, structure: "O-Cr(=O)(=O)-O", notes: "Yellow; in equilibrium with orange dichromate as the pH changes (a Le Chatelier demonstration)." },
  { id: "cyanide", formula: "CN⁻", name: "Cyanide", charge: -1, structure: "C#N", notes: "Highly toxic; gold extraction, electroplating. HCN is a weak acid." },
  { id: "hypochlorite", formula: "ClO⁻", name: "Hypochlorite", charge: -1, structure: "Cl-O", notes: "Household bleach (NaClO) and pool chlorine; an oxidising agent." },
  { id: "chlorate", formula: "ClO₃⁻", name: "Chlorate", charge: -1, structure: "O-Cl(=O)=O", notes: "Oxidising agent in matches and weedkiller; KClO₃ gives oxygen when heated with MnO₂." },
  { id: "perchlorate", formula: "ClO₄⁻", name: "Perchlorate", charge: -1, structure: "O-Cl(=O)(=O)=O", notes: "Rocket oxidiser; a strong oxidising agent, though stable in solution." },
  { id: "peroxide", formula: "O₂²⁻", name: "Peroxide", charge: -2, structure: "O-O", notes: "Oxygen at −1: hydrogen peroxide and the metal peroxides; the O–O bond is weak." },
];

export function ionById(id: string): PolyatomicIon {
  const ion = POLYATOMIC_IONS.find((i) => i.id === id);
  if (!ion) throw new Error(`No polyatomic ion "${id}"`);
  return ion;
}
