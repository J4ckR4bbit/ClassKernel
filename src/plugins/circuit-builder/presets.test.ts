import { describe, expect, it } from "vitest";
import { Circuit, Part, junctions, looseEnds, terminals, updatePart, inGrid, fits } from "./circuit";
import { PRESETS, presetById } from "./presets";
import { cellFigures, meterValue, solve } from "./solve";

// Every example circuit against the answers worked by hand, so the readings a
// teacher copies into a memo are right.

const load = (id: string) => presetById(id)!.make();
const byLabel = (c: Circuit, label: string): Part => {
  const p = c.parts.find((q) => q.label === label);
  if (!p) throw new Error(`no part labelled ${label}`);
  return p;
};
const meter = (c: Circuit, label: string) => meterValue(byLabel(c, label), solve(c).parts[byLabel(c, label).id]);
const power = (c: Circuit, label: string) => solve(c).parts[byLabel(c, label).id].P;
const toggle = (c: Circuit, label: string) => updatePart(c, byLabel(c, label).id, { closed: !byLabel(c, label).closed });

describe("every example", () => {
  it.each(PRESETS.map((p) => [p.id, p] as const))("%s is complete: no loose ends, everything on the grid, nothing overlapping", (_, preset) => {
    const c = preset.make();
    expect(looseEnds(c)).toEqual([]);
    for (const p of c.parts) {
      const t = terminals(p);
      expect(inGrid(t.a) && inGrid(t.b)).toBe(true);
      expect(fits(c, p, p.id)).toBe(true);
    }
    expect(solve(c).settled).toBe(true);
    expect(c.glowAt).toBeGreaterThan(0);
  });

  it("have unique ids", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe("the examples' readings", () => {
  it("series: 3 V across two 6 Ω lamps — 0,25 A, 1,5 V across each", () => {
    const c = load("series");
    expect(meter(c, "A")).toBeCloseTo(0.25, 9);
    expect(meter(c, "V")).toBeCloseTo(1.5, 9);
    // Open the switch: nothing flows and the lamps go out.
    const open = toggle(c, "S");
    expect(meter(open, "A")).toBe(0);
    expect(power(open, "L1")).toBe(0);
  });

  it("series–parallel lamps: lamp 1 takes the whole 1 A (4 W), lamps 2 and 3 take 0,5 A each (1 W)", () => {
    const c = load("series-parallel-lamps");
    expect(meter(c, "A")).toBeCloseTo(1, 9);
    expect(power(c, "1")).toBeCloseTo(4, 9);
    expect(power(c, "2")).toBeCloseTo(1, 9);
    expect(power(c, "3")).toBeCloseTo(1, 9);
    // Lamp 1 is at full glow, lamps 2 and 3 at a quarter.
    expect(c.glowAt).toBeCloseTo(4, 9);
    // Open S: 6 V across 8 Ω, 0,75 A through lamps 1 and 3 (2,25 W each); lamp 2 out.
    const open = toggle(c, "S");
    expect(meter(open, "A")).toBeCloseTo(0.75, 9);
    expect(power(open, "1")).toBeCloseTo(2.25, 9);
    expect(power(open, "3")).toBeCloseTo(2.25, 9);
    expect(power(open, "2")).toBe(0);
  });

  it("parallel resistors: 3 A through 4 Ω and 2 A through 6 Ω add to 5 A; 12 V across each", () => {
    const c = load("parallel-ammeters");
    expect(meter(c, "A1")).toBeCloseTo(5, 9);
    expect(meter(c, "A2")).toBeCloseTo(3, 9);
    expect(meter(c, "A3")).toBeCloseTo(2, 9);
    expect(meter(c, "V")).toBeCloseTo(12, 9);
  });

  it("internal resistance: 12 V, r = 1 Ω, 3 Ω + (6 Ω ∥ 12 Ω) — 1,5 A, 10,5 V terminal, 6 V across the parallel pair", () => {
    const c = load("internal-resistance");
    expect(meter(c, "A")).toBeCloseTo(1.5, 9);
    expect(meter(c, "V1")).toBeCloseTo(10.5, 9);
    expect(meter(c, "V2")).toBeCloseTo(6, 9);
    const s = solve(c);
    expect(Math.abs(s.parts[byLabel(c, "R2").id].I)).toBeCloseTo(1, 9);
    expect(Math.abs(s.parts[byLabel(c, "R3").id].I)).toBeCloseTo(0.5, 9);
    const cell = c.parts.find((p) => p.type === "cell")!;
    const f = cellFigures(cell, s.parts[cell.id]);
    expect(f.lost).toBeCloseTo(1.5, 9);
    expect(f.external).toBeCloseTo(7, 9);
    // Open: no current, so no lost volts — V1 reads the emf.
    const open = toggle(c, "S");
    expect(meter(open, "A")).toBe(0);
    expect(meter(open, "V1")).toBeCloseTo(12, 9);
  });

  it("two switches: 1 A with S2 open; 1,5 A with it closed, V1 up from 4 V to 6 V, V2 down from 6 V to 3 V", () => {
    const c = load("two-switches");
    expect(meter(c, "A")).toBeCloseTo(1, 9);
    expect(meter(c, "V1")).toBeCloseTo(4, 9);
    expect(meter(c, "V2")).toBeCloseTo(6, 9);
    const closed = toggle(c, "S2");
    expect(meter(closed, "A")).toBeCloseTo(1.5, 9);
    expect(meter(closed, "V1")).toBeCloseTo(6, 9);
    expect(meter(closed, "V2")).toBeCloseTo(3, 9);
  });

  it("rheostat: 6 Ω gives 0,5 A and 5,5 V across the cell; 24 Ω gives 0,2 A and 5,8 V", () => {
    const c = load("rheostat");
    expect(meter(c, "A")).toBeCloseTo(0.5, 9);
    expect(meter(c, "V")).toBeCloseTo(5.5, 9);
    const rheostat = c.parts.find((p) => p.type === "rheostat")!;
    const up = updatePart(c, rheostat.id, { R: 24 });
    expect(meter(up, "A")).toBeCloseTo(0.2, 9);
    expect(meter(up, "V")).toBeCloseTo(5.8, 9);
  });

  it("diodes: lamp A lights (6 W), lamp B doesn't; turn the cell round and they swap", () => {
    const c = load("diodes");
    expect(power(c, "A")).toBeCloseTo(6, 9);
    expect(power(c, "B")).toBe(0);
    const cell = c.parts.find((p) => p.type === "cell")!;
    const turned = updatePart(c, cell.id, { rot: 2 });
    expect(power(turned, "A")).toBe(0);
    expect(power(turned, "B")).toBeCloseTo(6, 9);
  });

  it("fuse: two 1 A lamps are within its 2 A; a third blows it and everything goes out", () => {
    const c = load("fuse");
    expect(solve(c).blown).toEqual([]);
    expect(power(c, "L1")).toBeCloseTo(6, 9);
    const third = toggle(c, "S3");
    const s = solve(third);
    expect(s.blown).toEqual([byLabel(c, "F").id]);
    for (const l of ["L1", "L2", "L3"]) expect(s.parts[byLabel(c, l).id].P).toBe(0);
  });

  it("meter mistakes: the voltmeter in series reads the emf; the ammeter across the lamp reads 6 V / 10 Ω", () => {
    const c = load("meter-mistakes");
    expect(meter(c, "V")).toBeCloseTo(6, 9);
    expect(power(c, "L1")).toBe(0);
    expect(meter(c, "A")).toBeCloseTo(0.6, 9);
    expect(power(c, "L2")).toBe(0);
  });

  it("draw junction dots where branches meet", () => {
    // The parallel example has its junctions at the four corners of the branches.
    expect(junctions(load("parallel-ammeters")).length).toBeGreaterThanOrEqual(4);
  });
});
