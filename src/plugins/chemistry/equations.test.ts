import { describe, expect, it } from "vitest";
import { EXAMPLES, balance, classify, equationText, inventory, oxidationNumbers, oxidationText, parseEquation, parseSpecies } from "./equations";

const bal = (text: string) => balance(parseEquation(text));
const coeffs = (text: string) => bal(text).coefficients;

describe("reading equations", () => {
  it("reads formulas with digits, subscripts, charges and states", () => {
    expect(parseSpecies("H2O").formula).toBe("H₂O");
    expect(parseSpecies("Ca(OH)2").formula).toBe("Ca(OH)₂");
    expect(parseSpecies("Cu2+")).toMatchObject({ formula: "Cu²⁺", charge: 2 });
    expect(parseSpecies("Cu^2+")).toMatchObject({ formula: "Cu²⁺", charge: 2 });
    expect(parseSpecies("SO₄²⁻")).toMatchObject({ formula: "SO₄²⁻", charge: -2 });
    expect(parseSpecies("Ag+").charge).toBe(1);
    expect(parseSpecies("NH4+")).toMatchObject({ formula: "NH₄⁺", charge: 1 });
    expect(parseSpecies("Fe3+")).toMatchObject({ formula: "Fe³⁺", charge: 3 });
    expect(parseSpecies("PO4^3-")).toMatchObject({ formula: "PO₄³⁻", charge: -3 });
    expect(parseEquation("H+ + OH- -> H2O").reactants.map((s) => s.formula)).toEqual(["H⁺", "OH⁻"]);
    expect(parseEquation("Ag++Cu->Ag+Cu2+").reactants.map((s) => s.formula)).toEqual(["Ag⁺", "Cu"]);
    expect(parseSpecies("Zn(s)")).toMatchObject({ formula: "Zn", state: "s" });
    expect(parseSpecies("e-")).toMatchObject({ formula: "e⁻", charge: -1 });
    expect(() => parseSpecies("Xx2")).toThrow();
    expect(() => parseEquation("H2 + O2")).toThrow();
  });

  it("drops coefficients the teacher typed", () => {
    expect(coeffs("2H2 + O2 -> 2H2O")).toEqual([2, 1, 2]);
    expect(coeffs("4H2 + O2 -> H2O")).toEqual([2, 1, 2]);
  });
});

describe("balancing", () => {
  it("balances the textbook set", () => {
    expect(coeffs("Al + O2 -> Al2O3")).toEqual([4, 3, 2]);
    expect(coeffs("C3H8 + O2 -> CO2 + H2O")).toEqual([1, 5, 3, 4]);
    expect(coeffs("CO2 + H2O -> C6H12O6 + O2")).toEqual([6, 6, 1, 6]);
    expect(coeffs("N2 + H2 -> NH3")).toEqual([1, 3, 2]);
    expect(coeffs("Fe2O3 + Al -> Al2O3 + Fe")).toEqual([1, 2, 1, 2]);
    expect(coeffs("CaCO3 + HCl -> CaCl2 + H2O + CO2")).toEqual([1, 2, 1, 1, 1]);
    expect(coeffs("KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2")).toEqual([2, 16, 2, 2, 8, 5]);
    expect(coeffs("Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O")).toEqual([3, 2, 1, 6]);
    expect(coeffs("H2O2 -> H2O + O2")).toEqual([2, 2, 1]);
  });

  it("balances charge in ionic equations", () => {
    expect(coeffs("Ag+ + Cu -> Ag + Cu2+")).toEqual([2, 1, 2, 1]);
    expect(coeffs("MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O")).toEqual([1, 5, 8, 1, 5, 4]);
    expect(coeffs("Cr2O7^2- + Fe2+ + H+ -> Cr3+ + Fe3+ + H2O")).toEqual([1, 6, 14, 2, 6, 7]);
    expect(coeffs("Zn -> Zn2+ + e-")).toEqual([1, 1, 2]);
  });

  it("writes the result and the atom inventory", () => {
    const b = bal("Zn(s) + HCl(aq) -> ZnCl2(aq) + H2(g)");
    expect(equationText(b)).toBe("Zn(s) + 2HCl(aq) → ZnCl₂(aq) + H₂(g)");
    expect(equationText(b, false)).toBe("Zn + 2HCl → ZnCl₂ + H₂");
    expect(inventory(b)).toEqual([
      { element: "Zn", left: 1, right: 1 },
      { element: "H", left: 2, right: 2 },
      { element: "Cl", left: 2, right: 2 },
    ]);
    expect(inventory(bal("Ag+ + Cu -> Ag + Cu2+")).find((r) => r.element === "charge")).toEqual({ element: "charge", left: 2, right: 2 });
  });

  it("refuses what cannot be balanced, and says why", () => {
    expect(() => bal("H2 + O2 -> H2O + Cl2")).toThrow(/can't be balanced|other side/);
    expect(() => bal("H2O -> H2O2")).toThrow();
  });

  it("balances every example", () => {
    for (const ex of EXAMPLES) expect(() => bal(ex.text), ex.label).not.toThrow();
  });
});

describe("oxidation numbers and reaction types", () => {
  const ox = (text: string, el: string) => oxidationNumbers(parseSpecies(text))!.get(el);

  it("follows the school rules", () => {
    expect(ox("KMnO4", "Mn")).toBe(7);
    expect(ox("Cr2O7^2-", "Cr")).toBe(6);
    expect(ox("H2O2", "O")).toBe(-1);
    expect(ox("NaH", "H")).toBe(-1);
    expect(ox("H2SO4", "S")).toBe(6);
    expect(ox("NH4+", "N")).toBe(-3);
    expect(ox("Fe3O4", "Fe")).toBeCloseTo(8 / 3, 10);
    expect(oxidationText(8 / 3)).toBe("+8/3");
    expect(ox("O2", "O")).toBe(0);
    expect(ox("Cl2", "Cl")).toBe(0);
    expect(ox("ClO3-", "Cl")).toBe(5);
    expect(ox("OF2", "O")).toBe(2);
    expect(oxidationNumbers(parseSpecies("CuFeS2"))).toBeNull();
  });

  it("names the reaction type", () => {
    expect(classify(bal("N2 + H2 -> NH3")).types).toEqual(["synthesis", "redox"]);
    expect(classify(bal("H2O2 -> H2O + O2")).types).toEqual(["decomposition", "redox"]);
    expect(classify(bal("C3H8 + O2 -> CO2 + H2O")).types).toEqual(["combustion", "redox"]);
    expect(classify(bal("Zn(s) + HCl(aq) -> ZnCl2(aq) + H2(g)")).types).toEqual(["single displacement", "redox"]);
    expect(classify(bal("H2SO4 + NaOH -> Na2SO4 + H2O")).types).toEqual(["neutralisation"]);
    expect(classify(bal("AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq)")).types).toEqual(["double displacement", "precipitation"]);
    const redox = classify(bal("MnO4- + Fe2+ + H+ -> Mn2+ + Fe3+ + H2O"));
    expect(redox.types).toContain("redox");
    expect(redox.oxidised).toEqual([{ element: "Fe", from: 2, to: 3 }]);
    expect(redox.reduced).toEqual([{ element: "Mn", from: 7, to: 2 }]);
  });
});
