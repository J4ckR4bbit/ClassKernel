import { describe, expect, it } from "vitest";
import { Circuit, edgeKey, updatePart } from "./circuit";
import { build } from "./presets";
import { cellFigures, meterValue, solve, solveLinear } from "./solve";

// The circuits here are drawn on the grid the way a teacher would draw them,
// and every expected value is worked by hand, the way the memo would.

/** A loop: a cell at the top (+ on the right), parts down the right-hand side, wire back along the bottom and left. */
function loop(cell: { emf: number; r?: number }, ...right: Array<{ t: "resistor" | "lamp" | "ammeter" | "voltmeter" | "switch" | "fuse" | "diode"; R?: number; closed?: boolean; rating?: number; rev?: boolean }>): Circuit {
  // Cell centred at (4,2): terminals (3,2) − and (5,2) +. Parts stacked vertically on x = 8 from y = 3.
  const specs = [{ t: "cell" as const, at: [4, 2] as [number, number], emf: cell.emf, r: cell.r ?? 0 }];
  const paths: Array<Array<[number, number]>> = [[[5, 2], [8, 2], [8, 3]]];
  right.forEach((p, i) => {
    const y = 4 + 2 * i;
    specs.push({ ...p, at: [8, y], v: true } as never);
  });
  const bottom = 3 + 2 * right.length;
  paths.push([[8, bottom], [8, bottom + 1], [1, bottom + 1], [1, 2], [3, 2]]);
  return build(specs, paths, 1);
}

const part = (c: Circuit, i: number) => c.parts[i];
const reading = (c: Circuit, i: number) => solve(c).parts[c.parts[i].id];

describe("linear solver", () => {
  it("solves a small system", () => {
    const x = solveLinear(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });
});

describe("series circuits", () => {
  it("Ohm's law: 12 V across 4 Ω drives 3 A", () => {
    const c = loop({ emf: 12 }, { t: "resistor", R: 4 });
    const r = reading(c, 1);
    expect(Math.abs(r.I)).toBeCloseTo(3, 6);
    expect(Math.abs(r.V)).toBeCloseTo(12, 5);
    expect(r.P).toBeCloseTo(36, 4);
  });

  it("the same current everywhere, and every wire step carries it", () => {
    const c = loop({ emf: 6 }, { t: "ammeter" }, { t: "resistor", R: 2 }, { t: "lamp", R: 4 });
    const s = solve(c);
    expect(meterValue(part(c, 1), s.parts[part(c, 1).id])).toBeCloseTo(1, 6);
    expect(Math.abs(s.parts[part(c, 2).id].I)).toBeCloseTo(1, 6);
    expect(Math.abs(s.parts[part(c, 3).id].V)).toBeCloseTo(4, 5);
    for (const w of c.wires) expect(Math.abs(s.wires[w])).toBeCloseTo(1, 6);
  });

  it("internal resistance: emf 12 V, r = 2 Ω, R = 4 Ω gives 2 A, a terminal voltage of 8 V and 4 V lost", () => {
    const c = loop({ emf: 12, r: 2 }, { t: "resistor", R: 4 });
    const s = solve(c);
    const f = cellFigures(part(c, 0), s.parts[part(c, 0).id]);
    expect(f.current).toBeCloseTo(2, 9);
    expect(f.terminal).toBeCloseTo(8, 9);
    expect(f.lost).toBeCloseTo(4, 9);
    expect(f.external).toBeCloseTo(4, 9);
    expect(s.parts[part(c, 0).id].P).toBeCloseTo(16, 9); // delivered: V × I
  });

  it("an open switch stops the current, and a voltmeter across it reads the emf", () => {
    const c = loop({ emf: 9, r: 1 }, { t: "switch", closed: false }, { t: "lamp", R: 3 });
    // A voltmeter across the switch's terminals (8,3) and (8,5), out to the side.
    const withMeter = build(
      [
        ...c.parts.map((p) => ({ ...p, t: p.type, at: [p.x, p.y] as [number, number], v: p.rot % 2 === 1 })),
        { t: "voltmeter", at: [10, 4], v: true },
      ],
      [[[8, 3], [10, 3]], [[8, 5], [10, 5]], ...c.wires.map((w) => wirePath(w))],
      1,
    );
    const s = solve(withMeter);
    expect(s.parts[withMeter.parts[2].id].I).toBe(0);
    expect(meterValue(withMeter.parts[3], s.parts[withMeter.parts[3].id])).toBeCloseTo(9, 9);
    // Close it: 9 / (1 + 3) = 2,25 A, and the voltmeter across a closed switch reads 0.
    const closed = updatePart(withMeter, withMeter.parts[1].id, { closed: true });
    const t = solve(closed);
    expect(Math.abs(t.parts[closed.parts[2].id].I)).toBeCloseTo(2.25, 9);
    expect(meterValue(closed.parts[3], t.parts[closed.parts[3].id])).toBe(0);
  });

  it("a voltmeter in series reads the emf and lets no current through", () => {
    const c = loop({ emf: 6 }, { t: "voltmeter" }, { t: "lamp", R: 6 });
    const s = solve(c);
    expect(meterValue(part(c, 1), s.parts[part(c, 1).id])).toBeCloseTo(6, 9);
    expect(s.parts[part(c, 2).id].P).toBe(0);
  });
});

/** An edge key back to a two-point path, for rebuilding a circuit. */
function wirePath(key: string): Array<[number, number]> {
  const [x, y, o] = key.split(",");
  const p: [number, number] = [Number(x), Number(y)];
  return [p, o === "h" ? [p[0] + 1, p[1]] : [p[0], p[1] + 1]];
}

describe("parallel circuits", () => {
  const parallel = (R1: number, R2: number, emf = 6) =>
    build(
      [
        { t: "cell", at: [4, 2], emf },
        { t: "ammeter", at: [8, 2] },
        { t: "resistor", at: [6, 5], R: R1 },
        { t: "resistor", at: [6, 8], R: R2 },
      ],
      [
        [[5, 2], [7, 2]],
        [[9, 2], [10, 2], [10, 8], [7, 8]],
        [[10, 5], [7, 5]],
        [[3, 2], [2, 2], [2, 8], [5, 8]],
        [[2, 5], [5, 5]],
      ],
      1,
    );

  it("3 Ω and 6 Ω in parallel across 6 V: 2 A and 1 A, 3 A in the main line (2 Ω)", () => {
    const c = parallel(3, 6);
    const s = solve(c);
    expect(Math.abs(s.parts[c.parts[2].id].I)).toBeCloseTo(2, 6);
    expect(Math.abs(s.parts[c.parts[3].id].I)).toBeCloseTo(1, 6);
    expect(meterValue(c.parts[1], s.parts[c.parts[1].id])).toBeCloseTo(3, 6);
    expect(cellFigures(c.parts[0], s.parts[c.parts[0].id]).external).toBeCloseTo(2, 5);
  });

  it("the current divides at a junction: the wire steps on each side add up", () => {
    const c = parallel(3, 6);
    const s = solve(c);
    // At (10,5): 3 A comes down from above, 2 A leaves left into R1's wire, 1 A carries on down.
    expect(Math.abs(s.wires[edgeKey(10, 4, 10, 5)])).toBeCloseTo(3, 6);
    expect(Math.abs(s.wires[edgeKey(9, 5, 10, 5)])).toBeCloseTo(2, 6);
    expect(Math.abs(s.wires[edgeKey(10, 5, 10, 6)])).toBeCloseTo(1, 6);
  });

  it("a wire across a resistor shorts it out: no current through it, and the wire takes it all", () => {
    let c = parallel(3, 6);
    // A wire straight across R2's ends, below it.
    c = build(
      [...c.parts.map((p) => ({ ...p, t: p.type, at: [p.x, p.y] as [number, number] }))],
      [...c.wires.map(wirePath), [[5, 8], [5, 9], [7, 9], [7, 8]]],
      1,
    );
    const s = solve(c);
    expect(s.parts[c.parts[3].id].I).toBe(0);
    // The cell is now shorted, by wire alone.
    expect(s.shorted).toEqual([c.parts[0].id]);
  });

  it("an ammeter across a lamp takes all the current and the lamp goes out", () => {
    const c = build(
      [
        { t: "cell", at: [4, 2], emf: 6 },
        { t: "resistor", at: [8, 4], v: true, R: 10 },
        { t: "lamp", at: [5, 6], R: 6 },
        { t: "ammeter", at: [5, 8] },
      ],
      [
        [[5, 2], [8, 2], [8, 3]],
        [[8, 5], [8, 6], [6, 6]],
        [[3, 2], [2, 2], [2, 6], [4, 6]],
        [[4, 6], [4, 8]],
        [[6, 6], [6, 8]],
      ],
      1,
    );
    const s = solve(c);
    expect(meterValue(c.parts[3], s.parts[c.parts[3].id])).toBeCloseTo(0.6, 6);
    expect(s.parts[c.parts[2].id].P).toBe(0);
  });

  it("an ammeter with a bare wire beside it reads nothing: the wire takes the current", () => {
    const c = build(
      [
        { t: "cell", at: [4, 2], emf: 6 },
        { t: "resistor", at: [8, 4], v: true, R: 3 },
        { t: "ammeter", at: [5, 6] },
      ],
      [
        [[5, 2], [8, 2], [8, 3]],
        [[8, 5], [8, 6], [6, 6]],
        [[3, 2], [2, 2], [2, 6], [4, 6]],
        [[4, 6], [4, 7], [6, 7], [6, 6]],
      ],
      1,
    );
    const s = solve(c);
    expect(meterValue(c.parts[2], s.parts[c.parts[2].id])).toBeLessThan(1e-3);
    expect(Math.abs(s.parts[c.parts[1].id].I)).toBeCloseTo(2, 6);
  });
});

describe("cells", () => {
  it("cells in series add their emfs; turned round, they cancel", () => {
    const aiding = build(
      [
        { t: "cell", at: [4, 2], emf: 1.5 },
        { t: "cell", at: [7, 2], emf: 1.5 },
        { t: "resistor", at: [10, 4], v: true, R: 3 },
      ],
      [[[5, 2], [6, 2]], [[8, 2], [10, 2], [10, 3]], [[10, 5], [10, 6], [2, 6], [2, 2], [3, 2]]],
      1,
    );
    expect(Math.abs(reading(aiding, 2).I)).toBeCloseTo(1, 6);
    const opposing = build(
      [
        { t: "cell", at: [4, 2], emf: 1.5 },
        { t: "cell", at: [7, 2], emf: 1.5, rev: true } as never,
        { t: "resistor", at: [10, 4], v: true, R: 3 },
      ],
      [[[5, 2], [6, 2]], [[8, 2], [10, 2], [10, 3]], [[10, 5], [10, 6], [2, 6], [2, 2], [3, 2]]],
      1,
    );
    expect(Math.abs(reading(opposing, 2).I)).toBeLessThan(1e-9);
  });

  it("a cell with no internal resistance shorted by a wire is reported, not solved to a number", () => {
    const c = build([{ t: "cell", at: [4, 2], emf: 6 }], [[[3, 2], [3, 4], [5, 4], [5, 2]]], 1);
    const s = solve(c);
    expect(s.shorted).toEqual([c.parts[0].id]);
  });

  it("a real cell shorted by a wire drives emf / r", () => {
    const c = build([{ t: "cell", at: [4, 2], emf: 6, r: 0.5 }], [[[3, 2], [3, 4], [5, 4], [5, 2]]], 1);
    const s = solve(c);
    expect(s.shorted).toEqual([c.parts[0].id]);
    expect(s.parts[c.parts[0].id].I).toBeCloseTo(12, 9);
  });
});

describe("diodes", () => {
  it("conducts along its arrow and blocks against it", () => {
    // Current leaves the + terminal (right), goes down the right side through the parts.
    const forward = loop({ emf: 6 }, { t: "diode" }, { t: "lamp", R: 6 });
    const s = solve(forward);
    expect(s.parts[forward.parts[1].id].on).toBe(true);
    expect(s.parts[forward.parts[2].id].P).toBeCloseTo(6, 6);
    const backward = loop({ emf: 6 }, { t: "diode", rev: true }, { t: "lamp", R: 6 });
    const t = solve(backward);
    expect(t.parts[backward.parts[1].id].on).toBe(false);
    expect(t.parts[backward.parts[2].id].P).toBe(0);
    // The blocking diode has the whole emf across it.
    expect(Math.abs(t.parts[backward.parts[1].id].V)).toBeCloseTo(6, 6);
  });
});

describe("fuses", () => {
  it("blows when the current is over its rating, and the circuit goes dead", () => {
    const c = loop({ emf: 6 }, { t: "fuse", rating: 2 }, { t: "resistor", R: 2 });
    const s = solve(c);
    expect(s.blown).toEqual([c.parts[1].id]);
    expect(s.parts[c.parts[2].id].I).toBe(0);
  });

  it("holds at or under its rating", () => {
    const c = loop({ emf: 6 }, { t: "fuse", rating: 3 }, { t: "resistor", R: 2 });
    const s = solve(c);
    expect(s.blown).toEqual([]);
    expect(Math.abs(s.parts[c.parts[2].id].I)).toBeCloseTo(3, 5);
  });

  it("stays blown until replaced", () => {
    const c = loop({ emf: 6 }, { t: "fuse", rating: 9 }, { t: "resistor", R: 2 });
    const blown = updatePart(c, c.parts[1].id, { blown: true });
    expect(solve(blown).parts[c.parts[2].id].I).toBe(0);
    expect(solve(blown).blown).toEqual([]);
  });
});

describe("lamps", () => {
  it("glow in proportion to their power, against the circuit's full-glow power", () => {
    const c = { ...loop({ emf: 6 }, { t: "lamp", R: 6 }, { t: "lamp", R: 6 }), glowAt: 3 };
    const s = solve(c);
    // 0,5 A each: 1,5 W, half of full glow.
    expect(s.parts[c.parts[1].id].glow).toBeCloseTo(0.5, 6);
  });
});
