import { describe, expect, it } from "vitest";
import {
  Analysis,
  CellState,
  DEFAULT_STATE,
  F,
  HALF_CELLS,
  R,
  advance,
  analyse,
  cellNotation,
  halfCellById,
  halfPotential,
  logCoefficient,
  overallText,
  oxidationText,
  quotientText,
  reductionText,
  sideFor,
  standardAmounts,
  talkingPoints,
  voltsText,
} from "./cell";

const cell = (left: string, right: string, patch: Partial<CellState> = {}): CellState => ({
  ...DEFAULT_STATE,
  left: sideFor(left),
  right: sideFor(right),
  ...patch,
});

const withAmounts = (state: CellState, side: "left" | "right", amounts: Record<string, number>): CellState => ({
  ...state,
  [side]: { ...state[side], amounts: { ...state[side].amounts, ...amounts } },
});

describe("the half-cell table", () => {
  it("is the data sheet's, in order of E°, with unique ids", () => {
    const ids = HALF_CELLS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < HALF_CELLS.length; i++) expect(HALF_CELLS[i].E0).toBeGreaterThanOrEqual(HALF_CELLS[i - 1].E0);
    expect(halfCellById("zn").E0).toBe(-0.76);
    expect(halfCellById("cu").E0).toBe(0.34);
    expect(halfCellById("h").E0).toBe(0);
  });

  it("starts every half-cell at standard conditions", () => {
    expect(standardAmounts(halfCellById("zn"))).toEqual({ "Zn²⁺": 1 });
    expect(standardAmounts(halfCellById("h"))).toEqual({ "H⁺": 1, "H₂": 101.3 });
    expect(standardAmounts(halfCellById("fe3"))).toEqual({ "Fe³⁺": 1, "Fe²⁺": 1 });
  });

  it("gives E° back at standard conditions, whatever the temperature", () => {
    for (const c of HALF_CELLS) {
      expect(halfPotential(c, standardAmounts(c), 298)).toBeCloseTo(c.E0, 10);
      expect(halfPotential(c, standardAmounts(c), 350)).toBeCloseTo(c.E0, 10);
    }
  });
});

describe("the standard Zn / Cu cell", () => {
  const a = analyse(DEFAULT_STATE);

  it("puts copper at the cathode and gives 1,10 V", () => {
    expect(a.cathodeSide).toBe("right");
    expect(a.anode.id).toBe("zn");
    expect(a.cathode.id).toBe("cu");
    expect(a.E0cell).toBeCloseTo(1.1, 10);
    expect(a.E).toBeCloseTo(1.1, 10);
    expect(a.Q).toBeCloseTo(1, 10);
    expect(a.n).toBe(2);
    expect(a.reading).toBeCloseTo(1.1, 10);
    expect(a.polarityReversed).toBe(false);
    expect(a.concentrationCell).toBe(false);
  });

  it("writes the half-reactions, the net equation, Q and the notation as on the board", () => {
    expect(oxidationText(a.anode, a.anodeFactor)).toBe("Zn(s) → Zn²⁺(aq) + 2e⁻");
    expect(reductionText(a.cathode, a.cathodeFactor)).toBe("Cu²⁺(aq) + 2e⁻ → Cu(s)");
    expect(overallText(a, DEFAULT_STATE)).toBe("Cu²⁺(aq) + Zn(s) → Cu(s) + Zn²⁺(aq)");
    expect(quotientText(a)).toBe("[Zn²⁺] / [Cu²⁺]");
    expect(cellNotation(a, DEFAULT_STATE)).toBe("Zn(s) | Zn²⁺(aq) (1 mol·dm⁻³) || Cu²⁺(aq) (1 mol·dm⁻³) | Cu(s)");
    expect(cellNotation(a, DEFAULT_STATE, false)).toBe("Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s)");
  });

  it("keeps the same chemistry when the beakers are swapped", () => {
    const swapped = analyse(cell("cu", "zn"));
    expect(swapped.cathodeSide).toBe("left");
    expect(swapped.E).toBeCloseTo(1.1, 10);
    expect(cellNotation(swapped, cell("cu", "zn"), false)).toBe("Zn(s) | Zn²⁺(aq) || Cu²⁺(aq) | Cu(s)");
  });

  it("reads 0 V without a salt bridge, though the EMF is unchanged", () => {
    const a2 = analyse({ ...DEFAULT_STATE, saltBridge: false });
    expect(a2.E).toBeCloseTo(1.1, 10);
    expect(a2.reading).toBe(0);
    expect(a2.running).toBe(false);
    expect(a2.flow).toBe(0);
  });
});

describe("the Nernst equation", () => {
  it("lowers the EMF when the cathode ion is diluted, by (0,059/n) log Q", () => {
    const state = withAmounts(DEFAULT_STATE, "right", { "Cu²⁺": 0.1 });
    const a = analyse(state);
    const k = logCoefficient(298, 2);
    expect(k).toBeCloseTo(0.0295, 3);
    expect(a.Q).toBeCloseTo(10, 10);
    expect(a.E).toBeCloseTo(1.1 - k * Math.log10(10), 10);
    expect(a.E).toBeLessThan(1.1);
  });

  it("raises the EMF when the anode ion is diluted", () => {
    const a = analyse(withAmounts(DEFAULT_STATE, "left", { "Zn²⁺": 0.01 }));
    expect(a.E).toBeGreaterThan(1.1);
    expect(a.Q).toBeCloseTo(0.01, 10);
  });

  it("agrees with the two half-cell potentials and follows the temperature", () => {
    for (const T of [273, 298, 350]) {
      const state = withAmounts(withAmounts(cell("al", "cu", { temperature: T }), "left", { "Al³⁺": 0.2 }), "right", { "Cu²⁺": 0.05 });
      const a = analyse(state);
      expect(a.n).toBe(6);
      expect(a.E).toBeCloseTo(a.rightPotential - a.leftPotential, 10);
      expect(a.E).toBeCloseTo(a.E0cell - ((R * T) / (a.n * F)) * Math.log(a.Q), 10);
    }
    // Here Q > 1, so a warmer cell has a lower EMF.
    const cold = analyse(withAmounts(cell("zn", "cu", { temperature: 273 }), "right", { "Cu²⁺": 0.01 }));
    const warm = analyse(withAmounts(cell("zn", "cu", { temperature: 350 }), "right", { "Cu²⁺": 0.01 }));
    expect(warm.E).toBeLessThan(cold.E);
  });

  it("balances electrons for Al / Cu: 2Al + 3Cu²⁺", () => {
    const state = cell("al", "cu");
    const a = analyse(state);
    expect(a.anodeFactor).toBe(2);
    expect(a.cathodeFactor).toBe(3);
    expect(overallText(a, state)).toBe("3Cu²⁺(aq) + 2Al(s) → 3Cu(s) + 2Al³⁺(aq)");
    expect(oxidationText(a.anode, a.anodeFactor)).toBe("2Al(s) → 2Al³⁺(aq) + 6e⁻");
    expect(quotientText(a)).toBe("[Al³⁺]² / [Cu²⁺]³");
    expect(a.E0cell).toBeCloseTo(2.0, 10);
  });

  it("handles a concentration cell: E° = 0, the concentrated side is the cathode", () => {
    const state = withAmounts(cell("cu", "cu"), "left", { "Cu²⁺": 0.01 });
    const a = analyse(state);
    expect(a.concentrationCell).toBe(true);
    expect(a.E0cell).toBe(0);
    expect(a.cathodeSide).toBe("right");
    expect(a.E).toBeCloseTo(logCoefficient(298, 2) * 2, 10);
    expect(overallText(a, state)).toBe("Cu²⁺(aq, 1 mol·dm⁻³) → Cu²⁺(aq, 0,01 mol·dm⁻³)");
    expect(quotientText(a)).toBe("[Cu²⁺]anode / [Cu²⁺]cathode");
    expect(talkingPoints(a, state)[0]).toMatch(/concentration/);
  });

  it("notices when concentrations turn a cell round", () => {
    // Sn / Pb are only 0,01 V apart: a dilute Pb²⁺ solution flips them.
    const state = withAmounts(cell("sn", "pb"), "right", { "Pb²⁺": 0.001 });
    const a = analyse(state);
    expect(a.standardCathodeSide).toBe("right");
    expect(a.cathodeSide).toBe("left");
    expect(a.polarityReversed).toBe(true);
    expect(a.E).toBeGreaterThan(0);
    expect(a.E0cell).toBeCloseTo(-0.01, 10);
    expect(talkingPoints(a, state).some((p) => /other way round/.test(p))).toBe(true);
  });
});

describe("the standard hydrogen electrode and platinum couples", () => {
  it("writes the SHE with its gas and electrode in the notation and Q", () => {
    const state = cell("zn", "h");
    const a = analyse(state);
    expect(a.E).toBeCloseTo(0.76, 10);
    expect(cellNotation(a, state, false)).toBe("Zn(s) | Zn²⁺(aq) || H⁺(aq) | H₂(g) | Pt(s)");
    expect(quotientText(a)).toBe("[Zn²⁺] × (p(H₂)/p°) / [H⁺]²");
    expect(reductionText(a.cathode)).toBe("2H⁺(aq) + 2e⁻ → H₂(g)");
    expect(talkingPoints(a, state).some((p) => /inert/.test(p))).toBe(true);
  });

  it("puts the SHE on the anode side against copper, and follows pH", () => {
    const state = cell("h", "cu");
    const a = analyse(state);
    expect(a.anode.id).toBe("h");
    expect(cellNotation(a, state, false)).toBe("Pt(s) | H₂(g) | H⁺(aq) || Cu²⁺(aq) | Cu(s)");
    // Less H⁺ at the anode: oxidising H₂ is easier, so the EMF rises.
    const dilute = analyse(withAmounts(state, "left", { "H⁺": 0.01 }));
    expect(dilute.E).toBeGreaterThan(a.E);
    // More hydrogen pressure at the anode pushes the same way.
    const pressed = analyse(withAmounts(state, "left", { "H₂": 202.6 }));
    expect(pressed.E).toBeGreaterThan(a.E);
  });

  it("writes the Fe³⁺ / Fe²⁺ couple with a comma, both ions in the same phase", () => {
    const state = cell("zn", "fe3");
    const a = analyse(state);
    expect(a.n).toBe(2);
    expect(a.cathodeFactor).toBe(2);
    expect(cellNotation(a, state, false)).toBe("Zn(s) | Zn²⁺(aq) || Fe³⁺(aq), Fe²⁺(aq) | Pt(s)");
    expect(overallText(a, state)).toBe("2Fe³⁺(aq) + Zn(s) → 2Fe²⁺(aq) + Zn²⁺(aq)");
    const asAnode = cell("fe3", "ag");
    expect(cellNotation(analyse(asAnode), asAnode, false)).toBe("Pt(s) | Fe²⁺(aq), Fe³⁺(aq) || Ag⁺(aq) | Ag(s)");
  });
});

describe("running the cell", () => {
  const runUntilFlat = (state: CellState, maxSeconds: number, speed = 1) => {
    let a: Analysis = analyse(state);
    const emfs: number[] = [a.E];
    let t = 0;
    while (a.running && t < maxSeconds) {
      state = advance(state, a, 0.05, speed);
      a = analyse(state);
      emfs.push(a.E);
      t += 0.05;
    }
    return { state, a, emfs, t };
  };

  it("uses the reactants in the ratio of the net equation, and the EMF only falls", () => {
    const state = cell("al", "cu");
    const a = analyse(state);
    const next = advance(state, a, 1, 1);
    const used = 1 - next.right.amounts["Cu²⁺"];
    const made = next.left.amounts["Al³⁺"] - 1;
    expect(used).toBeGreaterThan(0);
    expect(made / used).toBeCloseTo(2 / 3, 10);
    expect(analyse(next).E).toBeLessThan(a.E);
    // The original state is untouched.
    expect(state.right.amounts["Cu²⁺"]).toBe(1);
  });

  it("runs the Zn / Cu cell flat: Cu²⁺ used up, E at zero, in a classroom-sized time", () => {
    const { state, a, emfs, t } = runUntilFlat(DEFAULT_STATE, 600);
    expect(a.flat).toBe(true);
    expect(a.E).toBeLessThan(0.0005);
    expect(state.right.amounts["Cu²⁺"]).toBeLessThan(1e-6);
    expect(state.left.amounts["Zn²⁺"]).toBeCloseTo(2, 3);
    for (let i = 1; i < emfs.length; i++) expect(emfs[i]).toBeLessThanOrEqual(emfs[i - 1] + 1e-12);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(240);
  });

  it("stops a concentration cell when the two sides are equal", () => {
    const start = withAmounts(cell("cu", "cu"), "left", { "Cu²⁺": 0.01 });
    const { state, a, t } = runUntilFlat(start, 600, 10);
    expect(a.flat).toBe(true);
    // Flat means E under half a millivolt: the two concentrations within a few %.
    expect(state.left.amounts["Cu²⁺"] / state.right.amounts["Cu²⁺"]).toBeGreaterThan(0.95);
    expect(state.left.amounts["Cu²⁺"] / state.right.amounts["Cu²⁺"]).toBeLessThan(1);
    expect(t).toBeLessThan(120);
  });

  it("does nothing without a salt bridge, or when flat, or at a speed of zero", () => {
    const open = { ...DEFAULT_STATE, saltBridge: false };
    expect(advance(open, analyse(open), 1)).toBe(open);
    expect(advance(DEFAULT_STATE, analyse(DEFAULT_STATE), 1, 0)).toBe(DEFAULT_STATE);
    const { state, a } = runUntilFlat(DEFAULT_STATE, 600);
    expect(advance(state, a, 1)).toBe(state);
  });

  it("runs faster at a higher speed", () => {
    const a = analyse(DEFAULT_STATE);
    const slow = advance(DEFAULT_STATE, a, 1, 1);
    const fast = advance(DEFAULT_STATE, a, 1, 5);
    expect(1 - fast.right.amounts["Cu²⁺"]).toBeCloseTo(5 * (1 - slow.right.amounts["Cu²⁺"]), 10);
  });
});

describe("words", () => {
  it("writes volts with a sign and a decimal comma", () => {
    expect(voltsText(1.1)).toBe("+1,10 V");
    expect(voltsText(-0.76)).toBe("−0,76 V");
    expect(voltsText(0)).toBe("0,00 V");
    expect(voltsText(1.0704, 3)).toBe("+1,070 V");
  });

  it("gives the exam points for Zn / Cu", () => {
    const points = talkingPoints(analyse(DEFAULT_STATE), DEFAULT_STATE).join("\n");
    expect(points).toMatch(/Cu²⁺ is the stronger oxidising agent/);
    expect(points).toMatch(/from the Zn electrode \(anode\) to the Cu electrode \(cathode\)/);
    expect(points).toMatch(/K⁺ ions move towards the cathode/);
    expect(points).toMatch(/Zn anode loses mass/);
    expect(points).toMatch(/blue colour of the Cu²⁺ solution fades/);
    expect(points).toMatch(/Bigger electrodes or more solution leave the reading/);
  });
});
