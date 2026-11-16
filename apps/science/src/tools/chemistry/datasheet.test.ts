import { describe, expect, it } from "vitest";
import { CONSTANTS, FORMULAE, REDUCTION_POTENTIALS, cellFromTable, halfReactionById } from "./datasheet";
import { HALF_CELLS } from "../galvanic-cell/cell";

describe("the data sheet", () => {
  it("lists the reduction potentials in decreasing order, with unique ids", () => {
    expect(new Set(REDUCTION_POTENTIALS.map((r) => r.id)).size).toBe(REDUCTION_POTENTIALS.length);
    for (let i = 1; i < REDUCTION_POTENTIALS.length; i++) expect(REDUCTION_POTENTIALS[i].E).toBeLessThanOrEqual(REDUCTION_POTENTIALS[i - 1].E);
    expect(halfReactionById("h").E).toBe(0);
    expect(halfReactionById("f2").E).toBe(2.87);
    expect(halfReactionById("li").E).toBe(-3.05);
  });

  it("agrees with the galvanic cell tool's table where they overlap", () => {
    const byId: Record<string, string> = { zn: "zn", cu: "cu2", ag: "ag", mg: "mg", al: "al", fe: "fe", ni: "ni", sn: "sn", pb: "pb", h: "h", fe3: "fe3" };
    for (const cell of HALF_CELLS) {
      const sheet = halfReactionById(byId[cell.id]);
      expect(sheet.E, cell.label).toBeCloseTo(cell.E0, 10);
      expect(sheet.electrons, cell.label).toBe(cell.n);
    }
  });

  it("makes a cell from two rows", () => {
    const cell = cellFromTable(halfReactionById("zn"), halfReactionById("cu2"));
    expect(cell.cathode.id).toBe("cu2");
    expect(cell.E0cell).toBeCloseTo(1.1, 10);
    expect(cell.oxidationText).toBe("Zn → Zn²⁺ + 2e⁻");
    expect(cell.reductionText).toBe("Cu²⁺ + 2e⁻ → Cu");
    expect(cell.agents).toBe("Cu²⁺ is the stronger oxidising agent; Zn is the stronger reducing agent.");
    const alAg = cellFromTable(halfReactionById("ag"), halfReactionById("al"));
    expect(alAg.cathodeTimes).toBe(3);
    expect(alAg.anodeTimes).toBe(1);
    expect(alAg.reductionText).toBe("3 × (Ag⁺ + e⁻ → Ag)");
    expect(alAg.E0cell).toBeCloseTo(2.46, 10);
    const perm = cellFromTable(halfReactionById("fe3"), halfReactionById("mno4"));
    expect(perm.cathode.id).toBe("mno4");
    expect(perm.anodeTimes).toBe(5);
    expect(perm.agents).toMatch(/^MnO₄⁻ \+ 8H⁺ is the stronger oxidising agent; Fe²⁺/);
  });

  it("has the constants and formulae a paper needs", () => {
    expect(CONSTANTS.find((c) => c.symbol === "R")?.value).toBe("8,31");
    expect(CONSTANTS.find((c) => c.symbol === "Vₘ")?.value).toBe("22,4");
    expect(FORMULAE.some((f) => f.formula.startsWith("pH"))).toBe(true);
    expect(FORMULAE.some((f) => f.formula.startsWith("E°cell"))).toBe(true);
  });
});
