import { describe, expect, it } from "vitest";
import {
  EMPTY,
  addPart,
  addWire,
  edgeKey,
  fits,
  fromFile,
  junctions,
  labelRuns,
  looseEnds,
  movePart,
  nextLabel,
  partAt,
  removePart,
  rotatePart,
  shift,
  stepsBetween,
  terminals,
  toFile,
  wireAt,
  wireRun,
} from "./circuit";
import { PRESETS } from "./presets";

const straight = (x1: number, x2: number, y: number) => addWire(EMPTY, stepsBetween({ x: x1, y }, { x: x2, y }).reduce((path, p) => [...path, p], [{ x: x1, y }]));

describe("placing parts", () => {
  it("puts the terminals one step either side of the centre", () => {
    expect(terminals({ x: 5, y: 5, rot: 0 })).toEqual({ a: { x: 4, y: 5 }, b: { x: 6, y: 5 } });
    expect(terminals({ x: 5, y: 5, rot: 1 })).toEqual({ a: { x: 5, y: 4 }, b: { x: 5, y: 6 } });
    expect(terminals({ x: 5, y: 5, rot: 2 })).toEqual({ a: { x: 6, y: 5 }, b: { x: 4, y: 5 } });
  });

  it("numbers the labels: R1, R2…, and leaves cells unlabelled", () => {
    const one = addPart(EMPTY, "resistor", 5, 5, 0)!;
    expect(one.circuit.parts[0].label).toBe("R1");
    expect(nextLabel(one.circuit, "resistor")).toBe("R2");
    expect(nextLabel(one.circuit, "ammeter")).toBe("A1");
    expect(nextLabel(one.circuit, "cell")).toBe("");
  });

  it("lets parts meet end to end, but not overlap or sit on another's centre", () => {
    const c = addPart(EMPTY, "resistor", 5, 5, 0)!.circuit;
    expect(fits(c, { x: 7, y: 5, rot: 0 })).toBe(true); // shares the terminal at (6,5)
    expect(fits(c, { x: 6, y: 5, rot: 0 })).toBe(false); // overlaps
    expect(fits(c, { x: 5, y: 5, rot: 1 })).toBe(false); // same centre, crossed
    expect(fits(c, { x: 5, y: 6, rot: 1 })).toBe(false); // its terminal on the resistor's centre
    expect(fits(c, { x: 1, y: 5, rot: 0 })).toBe(false); // off the grid
  });

  it("cuts itself into a wire it is dropped on", () => {
    const wire = straight(2, 8, 5);
    expect(wire.wires.length).toBe(6);
    const c = addPart(wire, "lamp", 5, 5, 0)!.circuit;
    expect(c.wires).not.toContain(edgeKey(4, 5, 5, 5));
    expect(c.wires).not.toContain(edgeKey(5, 5, 6, 5));
    expect(c.wires.length).toBe(4);
    expect(looseEnds(c).map((p) => `${p.x},${p.y}`).sort()).toEqual(["2,5", "8,5"]);
  });

  it("moves and rotates only to places it fits", () => {
    let c = addPart(EMPTY, "resistor", 5, 5, 0)!.circuit;
    c = addPart(c, "lamp", 9, 5, 0)!.circuit;
    const r = c.parts[0].id;
    expect(movePart(c, r, 8, 5)).toBeNull();
    expect(movePart(c, r, 5, 8)!.parts[0]).toMatchObject({ x: 5, y: 8 });
    expect(rotatePart(c, r)!.parts[0].rot).toBe(1);
    expect(removePart(c, r).parts.length).toBe(1);
  });
});

describe("wires", () => {
  it("follows the pointer one grid step at a time, the longer way first", () => {
    expect(stepsBetween({ x: 1, y: 1 }, { x: 3, y: 2 })).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ]);
  });

  it("won't run into a part's centre", () => {
    const c = addPart(EMPTY, "resistor", 5, 5, 0)!.circuit;
    const crossed = addWire(c, [
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);
    expect(crossed.wires).toEqual([edgeKey(5, 3, 5, 4)]);
  });

  it("a tap picks the run of wire between junctions and terminals, round corners", () => {
    let c = addPart(EMPTY, "cell", 5, 2, 0)!.circuit;
    c = addWire(c, [
      { x: 6, y: 2 },
      { x: 7, y: 2 },
      { x: 7, y: 3 },
      { x: 7, y: 4 },
    ]);
    c = addWire(c, [
      { x: 7, y: 3 },
      { x: 8, y: 3 },
    ]);
    // (7,3) is a junction: the run from the terminal stops there.
    expect(junctions(c)).toEqual([{ x: 7, y: 3 }]);
    expect(wireRun(c, edgeKey(6, 2, 7, 2)).sort()).toEqual([edgeKey(6, 2, 7, 2), edgeKey(7, 2, 7, 3)].sort());
    expect(wireRun(c, edgeKey(7, 3, 8, 3))).toEqual([edgeKey(7, 3, 8, 3)]);
  });

  it("finds what is under the pointer", () => {
    const c = addPart(straight(2, 4, 8), "resistor", 6, 8, 0)!.circuit;
    expect(partAt(c, 6.3, 8.2)?.type).toBe("resistor");
    expect(partAt(c, 6, 9)).toBeNull();
    expect(wireAt(c, 2.5, 8.1, 0.3)).toBe(edgeKey(2, 8, 3, 8));
    expect(wireAt(c, 2.5, 8.5, 0.3)).toBeNull();
  });

  it("shifts the whole circuit while it stays on the grid", () => {
    const c = addPart(EMPTY, "resistor", 5, 5, 0)!.circuit;
    expect(shift(c, 1, 0)!.parts[0].x).toBe(6);
    expect(shift(c, -10, 0)).toBeNull();
  });
});

describe("labels", () => {
  it("draws digits after a letter as a subscript", () => {
    expect(labelRuns("R12")).toEqual([
      ["R", false],
      ["12", true],
    ]);
    expect(labelRuns("12")).toEqual([["12", false]]);
    expect(labelRuns("A")).toEqual([["A", false]]);
    expect(labelRuns("R1 R2")).toEqual([
      ["R", false],
      ["1", true],
      [" R", false],
      ["2", true],
    ]);
  });
});

describe("files", () => {
  it("round-trips every example", () => {
    for (const p of PRESETS) {
      const c = p.make();
      const back = fromFile(toFile(c))!;
      expect(back.parts.map(({ id: _, ...rest }) => rest)).toEqual(c.parts.map(({ id: _, ...rest }) => rest));
      expect(new Set(back.wires)).toEqual(new Set(c.wires));
      expect(back.glowAt).toBe(c.glowAt);
    }
  });

  it("refuses what isn't a circuit file, and drops parts that don't fit", () => {
    expect(fromFile("not json")).toBeNull();
    expect(fromFile(JSON.stringify({ parts: [], wires: [] }))).toBeNull();
    const odd = fromFile(
      JSON.stringify({
        kind: "classkernel-circuit",
        parts: [
          { type: "resistor", x: 5, y: 5, rot: 0, R: 5 },
          { type: "resistor", x: 6, y: 5, rot: 0 },
          { type: "warp-drive", x: 9, y: 9 },
          { type: "lamp", x: 0, y: 0, rot: 0 },
        ],
        wires: ["1,1,h", "bad", 3],
        glowAt: "lots",
      }),
    )!;
    expect(odd.parts.map((p) => p.type)).toEqual(["resistor"]);
    expect(odd.parts[0].R).toBe(5);
    expect(odd.wires).toEqual(["1,1,h"]);
    expect(odd.glowAt).toBe(1);
  });
});
