import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOURS,
  CATEGORY_NAMES,
  ELEMENTS,
  SIMPLIFIED_EXTRAS,
  elementBySymbol,
  elementByZ,
  gridPosition,
  inSimplifiedTable,
  massInBrackets,
  metalCharacter,
} from "./elements";

describe("the element table", () => {
  it("has all 118 elements in order, with unique symbols and names", () => {
    expect(ELEMENTS.length).toBe(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.name)).size).toBe(118);
    expect(elementByZ(26).symbol).toBe("Fe");
    expect(elementBySymbol("Cu")?.name).toBe("Copper");
  });

  it("carries the data sheet's masses and electronegativities", () => {
    expect(elementBySymbol("Cl")?.mass).toBe(35.5);
    expect(elementBySymbol("Cu")?.mass).toBe(63.5);
    expect(elementBySymbol("K")?.mass).toBe(39.1);
    expect(elementBySymbol("F")?.en).toBe(4.0);
    expect(elementBySymbol("Cs")?.en).toBe(0.7);
    expect(elementBySymbol("Ne")?.en).toBeUndefined();
    // South African spelling.
    expect(elementBySymbol("Al")?.name).toBe("Aluminium");
    expect(elementBySymbol("S")?.name).toBe("Sulfur");
    expect(elementBySymbol("Cs")?.name).toBe("Caesium");
  });

  it("brackets the mass of the elements without a stable isotope, but not Th, Pa or U", () => {
    expect(massInBrackets(elementBySymbol("Tc")!)).toBe(true);
    expect(massInBrackets(elementBySymbol("Rn")!)).toBe(true);
    expect(massInBrackets(elementBySymbol("U")!)).toBe(false);
    expect(massInBrackets(elementBySymbol("Pb")!)).toBe(false);
  });

  it("puts every element in its own cell of the grid", () => {
    const seen = new Set<string>();
    for (const e of ELEMENTS) {
      const { column, row } = gridPosition(e);
      expect(column).toBeGreaterThanOrEqual(1);
      expect(column).toBeLessThanOrEqual(18);
      expect([1, 2, 3, 4, 5, 6, 7, 9, 10]).toContain(row);
      const key = `${column},${row}`;
      expect(seen.has(key), `${e.symbol} shares a cell`).toBe(false);
      seen.add(key);
    }
    expect(gridPosition(elementBySymbol("H")!)).toEqual({ column: 1, row: 1 });
    expect(gridPosition(elementBySymbol("He")!)).toEqual({ column: 18, row: 1 });
    expect(gridPosition(elementBySymbol("La")!)).toEqual({ column: 4, row: 9 });
    expect(gridPosition(elementBySymbol("Lu")!)).toEqual({ column: 18, row: 9 });
    expect(gridPosition(elementBySymbol("U")!)).toEqual({ column: 7, row: 10 });
  });

  it("sorts the categories as the legend expects", () => {
    const count = (c: string) => ELEMENTS.filter((e) => e.category === c).length;
    expect(count("alkali")).toBe(6);
    expect(count("alkaline")).toBe(6);
    expect(count("halogen")).toBe(6);
    expect(count("noble")).toBe(7);
    expect(count("lanthanide")).toBe(15);
    expect(count("actinide")).toBe(15);
    expect(count("metalloid")).toBe(6);
    for (const c of Object.keys(CATEGORY_NAMES)) expect(CATEGORY_COLOURS[c as keyof typeof CATEGORY_COLOURS]).toMatch(/^#/);
    expect(metalCharacter(elementBySymbol("Si")!)).toBe("metalloid");
    expect(metalCharacter(elementBySymbol("Cl")!)).toBe("non-metal");
    expect(metalCharacter(elementBySymbol("Al")!)).toBe("metal");
    expect(metalCharacter(elementBySymbol("H")!)).toBe("non-metal");
  });

  it("marks the diatomic, ferromagnetic and radioactive elements", () => {
    expect(ELEMENTS.filter((e) => e.diatomic).map((e) => e.symbol)).toEqual(["H", "N", "O", "F", "Cl", "Br", "I"]);
    expect(ELEMENTS.filter((e) => e.ferromagnetic).map((e) => e.symbol)).toEqual(["Fe", "Co", "Ni", "Gd"]);
    expect(elementBySymbol("Tc")?.radioactive).toBe(true);
    expect(elementBySymbol("Pb")?.radioactive).toBeUndefined();
    expect(elementBySymbol("Br")?.state).toBe("liquid");
    expect(elementBySymbol("Hg")?.state).toBe("liquid");
    expect(ELEMENTS.filter((e) => e.state === "gas").length).toBe(11);
  });

  it("gives the first 20 and the extras their full detail", () => {
    const simplified = ELEMENTS.filter(inSimplifiedTable);
    expect(simplified.length).toBe(20 + SIMPLIFIED_EXTRAS.length);
    for (const e of ELEMENTS) {
      if (e.z <= 56 || SIMPLIFIED_EXTRAS.includes(e.symbol)) {
        expect(e.detail, `${e.symbol} has no detail`).toBeDefined();
        const d = e.detail!;
        expect(d.ionisation.length).toBeGreaterThanOrEqual(Math.min(3, e.z));
        for (let i = 1; i < d.ionisation.length; i++) expect(d.ionisation[i]).toBeGreaterThan(d.ionisation[i - 1]);
        if (d.melting !== null && d.boiling !== null) expect(d.boiling).toBeGreaterThan(d.melting);
        expect(d.oxidation.length).toBeGreaterThan(0);
        expect(d.notes.length).toBeGreaterThan(20);
      }
    }
    // A few landmarks a teacher would spot at once.
    expect(elementBySymbol("H")?.detail?.ionisation[0]).toBe(1312);
    expect(elementBySymbol("Na")?.detail?.ionisation).toEqual([496, 4562, 6910]);
    expect(elementBySymbol("Fe")?.detail?.melting).toBe(1538);
    expect(elementBySymbol("Hg")?.detail?.melting).toBe(-39);
  });
});
