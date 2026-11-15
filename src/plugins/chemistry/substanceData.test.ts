import { describe, expect, it } from "vitest";
import { composition, layoutMolecule, lewisStructure, molarMass, parseStructure, structureComposition, summariseBonds } from "./bonds";
import { elementBySymbol } from "./elements";
import { POLYATOMIC_IONS, ionById } from "./ions";
import { INORGANIC_GROUPS, ORGANIC_GROUPS, SUBSTANCES, parseMonatomicIon } from "./substanceData";

const same = (a: Map<string, number>, b: Map<string, number>) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of keys) if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) return false;
  return true;
};

describe("the substances", () => {
  it("have unique ids and known groups", () => {
    expect(new Set(SUBSTANCES.map((s) => s.id)).size).toBe(SUBSTANCES.length);
    for (const s of SUBSTANCES) {
      const groups = s.section === "inorganic" ? INORGANIC_GROUPS : ORGANIC_GROUPS;
      expect(groups, `${s.id}: group ${s.group}`).toContain(s.group);
      expect(s.notes.length).toBeGreaterThan(20);
    }
  });

  it("have a structure that matches the formula, for every molecule", () => {
    for (const s of SUBSTANCES.filter((x) => x.structure)) {
      const tree = parseStructure(s.structure!);
      expect(same(structureComposition(tree), composition(s.formula)), `${s.id}: ${s.structure} vs ${s.formula}`).toBe(true);
      const m = layoutMolecule(tree, s.shape);
      const spots = new Set(m.atoms.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}`));
      expect(spots.size, `${s.id} draws two atoms on one spot`).toBe(m.atoms.length);
      // Every bond in the syllabus molecules has an enthalpy.
      for (const b of summariseBonds(m)) expect(b.enthalpy, `${s.id}: no enthalpy for ${b.key}`).toBeDefined();
    }
  });

  it("build every ionic substance from ions that add up and balance", () => {
    for (const s of SUBSTANCES.filter((x) => x.ions)) {
      const total = new Map<string, number>();
      let charge = 0;
      for (const part of s.ions!) {
        const mono = parseMonatomicIon(part.ion);
        if (mono) {
          expect(elementBySymbol(mono.symbol), `${s.id}: ${part.ion}`).toBeDefined();
          total.set(mono.symbol, (total.get(mono.symbol) ?? 0) + part.count);
          charge += mono.charge * part.count;
        } else {
          const ion = ionById(part.ion);
          for (const [sym, n] of composition(ion.formula)) total.set(sym, (total.get(sym) ?? 0) + n * part.count);
          charge += ion.charge * part.count;
        }
      }
      expect(same(total, composition(s.formula)), `${s.id}: ions vs ${s.formula}`).toBe(true);
      expect(charge, `${s.id} is not neutral`).toBe(0);
    }
  });

  it("have a molar mass from the data sheet", () => {
    expect(molarMass(SUBSTANCES.find((s) => s.id === "ethanol")!.formula)).toBe(46);
    expect(molarMass(SUBSTANCES.find((s) => s.id === "caco3")!.formula)).toBe(100.1);
    expect(molarMass(SUBSTANCES.find((s) => s.id === "h2so4")!.formula)).toBe(98.1);
  });

  it("cover the series the syllabus asks for", () => {
    const organic = SUBSTANCES.filter((s) => s.section === "organic");
    for (const g of ORGANIC_GROUPS) expect(organic.filter((s) => s.group === g).length, g).toBeGreaterThanOrEqual(2);
    expect(organic.map((s) => s.id)).toEqual(expect.arrayContaining(["methane", "ethane", "propane", "ethene", "propene", "ethyne", "propyne", "propan-1-ol", "propanoic-acid", "ethyl-ethanoate"]));
    // Boiling points rise along each saturated series.
    const bp = (id: string) => organic.find((s) => s.id === id)!.boiling!;
    expect(bp("ethane")).toBeGreaterThan(bp("methane"));
    expect(bp("propane")).toBeGreaterThan(bp("ethane"));
    expect(bp("ethanol")).toBeGreaterThan(bp("methanol"));
    expect(bp("ethanoic-acid")).toBeGreaterThan(bp("ethanol")); // acid above alcohol, same carbons
  });
});

describe("the polyatomic ions", () => {
  it("parse and match their formulas", () => {
    expect(new Set(POLYATOMIC_IONS.map((i) => i.id)).size).toBe(POLYATOMIC_IONS.length);
    for (const ion of POLYATOMIC_IONS) {
      const tree = parseStructure(ion.structure);
      expect(same(structureComposition(tree), composition(ion.formula)), `${ion.id}: ${ion.structure} vs ${ion.formula}`).toBe(true);
      expect(ion.charge).not.toBe(0);
    }
    expect(ionById("sulfate").charge).toBe(-2);
  });

  it("have Lewis diagrams whose formal charges add up to the ion's charge, and the fields the pop-up shows", () => {
    for (const ion of POLYATOMIC_IONS) {
      const m = layoutMolecule(parseStructure(ion.structure), ion.shape);
      const l = lewisStructure(m, ion.charge);
      expect(l.formalCharges.reduce((a, b) => a + b, 0), `${ion.id}: formal charges`).toBe(ion.charge);
      expect(l.lonePairs.every((p) => p >= 0)).toBe(true);
      expect(ion.occurs.length, `${ion.id}: where it occurs`).toBeGreaterThan(0);
      expect(ion.notes.length).toBeGreaterThan(20);
    }
    expect(POLYATOMIC_IONS.filter((i) => i.syllabus).length).toBeGreaterThanOrEqual(20);
    expect(parseMonatomicIon("Fe³⁺")).toEqual({ symbol: "Fe", charge: 3 });
    expect(parseMonatomicIon("O²⁻")).toEqual({ symbol: "O", charge: -2 });
    expect(parseMonatomicIon("sulfate")).toBeNull();
  });
});
