import { describe, expect, it } from "vitest";
import {
  bondEnthalpy,
  bondKey,
  composition,
  layoutMolecule,
  molarMass,
  parseStructure,
  polarity,
  structureComposition,
  summariseBonds,
  totalBondEnthalpy,
} from "./bonds";

const comp = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort());

describe("structural formulas", () => {
  it("reads implicit hydrogens, chains, branches and bond orders", () => {
    expect(comp(structureComposition(parseStructure("CH4")))).toEqual({ C: 1, H: 4 });
    expect(comp(structureComposition(parseStructure("CH3-CH2-OH")))).toEqual({ C: 2, H: 6, O: 1 });
    expect(comp(structureComposition(parseStructure("CH3-C(=O)-OH")))).toEqual({ C: 2, H: 4, O: 2 });
    expect(comp(structureComposition(parseStructure("HO-S(=O)(=O)-OH")))).toEqual({ H: 2, O: 4, S: 1 });
    expect(comp(structureComposition(parseStructure("O=C=O")))).toEqual({ C: 1, O: 2 });
    expect(comp(structureComposition(parseStructure("CH≡CH")))).toEqual({ C: 2, H: 2 });
    expect(comp(structureComposition(parseStructure("H-Cl")))).toEqual({ Cl: 1, H: 1 });
    // "Hg" is mercury, not an H on a nonexistent element.
    expect(comp(structureComposition(parseStructure("Cl-Hg-Cl")))).toEqual({ Cl: 2, Hg: 1 });
    expect(() => parseStructure("C(H")).toThrow();
  });

  it("lists the bonds with their orders", () => {
    const ethanoic = summariseBonds(layoutMolecule(parseStructure("CH3-C(=O)-OH")));
    const byKey = Object.fromEntries(ethanoic.map((b) => [b.key, b.count]));
    expect(byKey).toEqual({ "C–H": 3, "C–C": 1, "C=O": 1, "C–O": 1, "O–H": 1 });
    expect(totalBondEnthalpy(ethanoic)).toBe(3 * 413 + 347 + 745 + 358 + 464);
    const ethyne = summariseBonds(layoutMolecule(parseStructure("CH≡CH")));
    expect(ethyne.find((b) => b.key === "C≡C")?.enthalpy).toBe(839);
  });

  it("lays a chain out left to right with branches at right angles", () => {
    const m = layoutMolecule(parseStructure("CH3-CH2-OH"));
    const carbons = m.atoms.filter((a) => a.element === "C");
    const oxygen = m.atoms.find((a) => a.element === "O")!;
    expect(carbons[1].x).toBeCloseTo(carbons[0].x + 1, 6);
    expect(carbons[1].y).toBeCloseTo(carbons[0].y, 6);
    expect(oxygen.x).toBeCloseTo(carbons[1].x + 1, 6);
    // The methyl's hydrogens sit up, left and down.
    const methylHs = m.bonds.filter((b) => b.from === carbons[0].id).map((b) => m.atoms[b.to]).filter((a) => a.element === "H");
    expect(methylHs.length).toBe(3);
    expect(methylHs.some((h) => h.y < -0.9)).toBe(true);
    expect(methylHs.some((h) => h.y > 0.9)).toBe(true);
    expect(methylHs.some((h) => h.x < -0.9)).toBe(true);
    // No two atoms land on the same spot.
    const spots = new Set(m.atoms.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}`));
    expect(spots.size).toBe(m.atoms.length);
  });

  it("spreads a terminal pair at 60° and bends water when asked", () => {
    const ethene = layoutMolecule(parseStructure("CH2=CH2"));
    const c2 = ethene.atoms.filter((a) => a.element === "C")[1];
    const hs = ethene.bonds.filter((b) => b.from === c2.id).map((b) => ethene.atoms[b.to]);
    expect(hs.length).toBe(2);
    expect(Math.abs(hs[0].y - hs[1].y)).toBeCloseTo(2 * Math.sin(Math.PI / 3), 6);
    const water = layoutMolecule(parseStructure("OH2"), "bent");
    const [h1, h2] = water.atoms.filter((a) => a.element === "H");
    expect(h1.y).not.toBeCloseTo(h2.y, 3);
    expect(h1.x).toBeCloseTo(h2.x, 6);
  });
});

describe("bond enthalpies and polarity", () => {
  it("finds a bond in either order", () => {
    expect(bondKey("H", "C", 1)).toBe("C–H");
    expect(bondEnthalpy("Cl", "H", 1)).toBe(431);
    expect(bondEnthalpy("O", "C", 2)).toBe(745);
    expect(bondEnthalpy("N", "N", 3)).toBe(945);
    expect(bondEnthalpy("Xe", "F", 1)).toBeUndefined();
  });

  it("classifies polarity from the data sheet's electronegativities", () => {
    expect(polarity("H", "H")).toMatchObject({ difference: 0, type: "non-polar covalent", negative: null });
    expect(polarity("C", "H")).toMatchObject({ type: "non-polar covalent" }); // 0,4
    expect(polarity("H", "Cl")).toMatchObject({ type: "polar covalent", negative: "Cl", positive: "H" });
    expect(polarity("O", "H").difference).toBeCloseTo(1.4, 6);
    expect(polarity("Na", "Cl")).toMatchObject({ type: "polar covalent", negative: "Cl" }); // 2,1 is the limit
    expect(polarity("Na", "F")).toMatchObject({ type: "ionic", negative: "F" });
  });
});

describe("formulas", () => {
  it("counts atoms through brackets and subscripts", () => {
    expect(comp(composition("H₂O"))).toEqual({ H: 2, O: 1 });
    expect(comp(composition("Ca(OH)₂"))).toEqual({ Ca: 1, H: 2, O: 2 });
    expect(comp(composition("Al₂(SO₄)₃"))).toEqual({ Al: 2, O: 12, S: 3 });
    expect(comp(composition("NH₄⁺"))).toEqual({ H: 4, N: 1 });
    expect(comp(composition("CuSO₄·5H₂O"))).toEqual({ Cu: 1, O: 4, S: 1 });
  });

  it("gives molar masses from the data sheet", () => {
    expect(molarMass("H₂O")).toBe(18);
    expect(molarMass("NaCl")).toBe(58.5);
    expect(molarMass("CuSO₄")).toBe(159.6);
    expect(molarMass("Ca(OH)₂")).toBe(74.1);
    expect(molarMass("CH₃COOH")).toBe(60);
  });
});
