import { describe, expect, it } from "vitest";
import { seededRandom } from "../shared/canvas";
import {
  DEFAULT_PARAMS,
  EA,
  EA_CATALYSED,
  RateParams,
  createSim,
  erfc,
  exposedAtoms,
  fractionAbove,
  kT,
  limiting,
  mbDensity,
  metalAtoms,
  metalLeft,
  recentRate,
  sampleEnergy,
  setTemperature,
  stepSim,
} from "./rates";

const P = (patch: Partial<RateParams> = {}): RateParams => ({ ...DEFAULT_PARAMS, ...patch });

describe("the Maxwell–Boltzmann distribution", () => {
  it("erfc matches known values", () => {
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(0.5)).toBeCloseTo(0.4795, 4);
    expect(erfc(1)).toBeCloseTo(0.1573, 4);
    expect(erfc(2)).toBeCloseTo(0.004678, 5);
  });

  it("the curve's area is 1 at every temperature, and the tail is the area beyond Eₐ", () => {
    for (const c of [0, 25, 80]) {
      const t = kT(c);
      let total = 0;
      let tail = 0;
      const dE = 0.001;
      for (let E = dE / 2; E < 40; E += dE) {
        const f = mbDensity(E, t) * dE;
        total += f;
        if (E >= EA) tail += f;
      }
      expect(total).toBeCloseTo(1, 4);
      expect(tail).toBeCloseTo(fractionAbove(EA, t), 3);
    }
  });

  it("hotter: the peak moves to higher energy and drops, and more particles have Eₖ ≥ Eₐ", () => {
    const peak = (t: number) => {
      let best = 0;
      let at = 0;
      for (let E = 0.01; E < 10; E += 0.01) if (mbDensity(E, t) > best) [best, at] = [mbDensity(E, t), E];
      return { best, at };
    };
    const cold = peak(kT(25));
    const hot = peak(kT(75));
    expect(hot.at).toBeGreaterThan(cold.at);
    expect(hot.best).toBeLessThan(cold.best);
    // The peak of f(E) is at E = kT/2.
    expect(cold.at).toBeCloseTo(kT(25) / 2, 1);
    expect(fractionAbove(EA, kT(75))).toBeGreaterThan(1.4 * fractionAbove(EA, kT(25)));
  });

  it("a catalyst's lower Eₐ puts more of the same curve beyond it", () => {
    expect(fractionAbove(EA_CATALYSED, 1)).toBeGreaterThan(2.5 * fractionAbove(EA, 1));
  });

  it("sampled energies follow the curve: mean 3kT/2, and the right fraction above Eₐ", () => {
    const rand = seededRandom(7);
    const n = 200_000;
    let sum = 0;
    let above = 0;
    for (let i = 0; i < n; i++) {
      const E = sampleEnergy(rand, 1);
      sum += E;
      if (E >= EA) above++;
    }
    expect(sum / n).toBeCloseTo(1.5, 1);
    expect(above / n).toBeCloseTo(fractionAbove(EA, 1), 2);
  });
});

describe("the metal", () => {
  it("the same number of atoms however it is divided, but more of them exposed", () => {
    const lump = metalAtoms("lump");
    const pieces = metalAtoms("pieces");
    const powder = metalAtoms("powder");
    expect(lump).toHaveLength(96);
    expect(pieces).toHaveLength(96);
    expect(powder).toHaveLength(96);
    expect(exposedAtoms(lump)).toBe(12 + 7 + 7);
    expect(exposedAtoms(pieces)).toBe(6 * (4 + 3 + 3));
    expect(exposedAtoms(powder)).toBe(96);
  });

  it("the limiting reagent sets how much gas there will be", () => {
    expect(limiting(P({ concentration: 1 }))).toEqual({ reagent: "acid", finalGas: 60 });
    expect(limiting(P({ concentration: 2 }))).toEqual({ reagent: "metal", finalGas: 96 });
  });
});

describe("the box", () => {
  /** Gas formed in the first `seconds`, totalled over several seeds so chance evens out. */
  const gasAfter = (p: RateParams, seconds: number) => {
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = createSim(p, seed);
      stepSim(sim, seconds);
      total += sim.effective;
    }
    return total;
  };

  it("starts with the acid particles clear of the metal", () => {
    const sim = createSim(P({ concentration: 2 }), 5);
    expect(sim.particles).toHaveLength(120);
    expect(metalLeft(sim)).toBe(96);
  });

  it("each effective collision uses one acid particle and one metal atom and makes one bubble", () => {
    const sim = createSim(P({ temperature: 60 }), 3);
    stepSim(sim, 20);
    expect(sim.effective).toBeGreaterThan(0);
    expect(sim.particles.length + sim.effective).toBe(sim.startAcid);
    expect(metalLeft(sim) + sim.effective).toBe(sim.startMetal);
    expect(sim.collisions).toBeGreaterThan(sim.effective);
    expect(sim.gas[sim.gas.length - 1][1]).toBe(sim.effective);
  });

  it("only collisions with Eₖ ≥ Eₐ and the right orientation react", () => {
    const sim = createSim(P(), 9);
    stepSim(sim, 10);
    // Most collisions don't have the energy; of those that do, about half face the wrong way.
    expect(sim.effective / sim.collisions).toBeLessThan(0.2);
  });

  it("faster when hotter, more concentrated, more finely divided, or with a catalyst", () => {
    const base = gasAfter(P(), 12);
    expect(gasAfter(P({ temperature: 75 }), 12)).toBeGreaterThan(base * 1.25);
    expect(gasAfter(P({ concentration: 2 }), 12)).toBeGreaterThan(base * 1.5);
    expect(gasAfter(P({ surface: "powder" }), 12)).toBeGreaterThan(base * 1.5);
    expect(gasAfter(P({ catalyst: true }), 12)).toBeGreaterThan(base * 2);
  });

  it("runs until the limiting reagent is used up: the final amount doesn't depend on the rate", () => {
    const slow = createSim(P({ surface: "powder", catalyst: true }), 4);
    stepSim(slow, 600);
    expect(slow.done).toBe(true);
    expect(slow.effective).toBe(60);
    expect(slow.particles).toHaveLength(0);
    const metalLimited = createSim(P({ surface: "powder", catalyst: true, concentration: 2 }), 4);
    stepSim(metalLimited, 600);
    expect(metalLimited.effective).toBe(96);
    expect(metalLeft(metalLimited)).toBe(0);
  });

  it("warming the solution scales every particle's energy with T", () => {
    const sim = createSim(P(), 2);
    const before = sim.particles.map((p) => p.ke);
    setTemperature(sim, 75);
    sim.particles.forEach((p, i) => expect(p.ke).toBeCloseTo((before[i] * kT(75)) / kT(25), 12));
  });

  it("the rate falls as the acid is used up", () => {
    const sim = createSim(P({ surface: "powder", catalyst: true }), 6);
    stepSim(sim, 5);
    const early = recentRate(sim, 5);
    stepSim(sim, 40);
    expect(recentRate(sim, 5)).toBeLessThan(early);
  });
});

describe("the explanations", () => {
  it("names each changed condition, the right way round, in collision-theory terms", async () => {
    const { conditionsLabel, explainChange } = await import("./explain");
    expect(conditionsLabel(P({ temperature: 40, concentration: 1.5, surface: "powder", catalyst: true }))).toBe("40 °C, 1,5 mol·dm⁻³, powder, catalyst");
    expect(explainChange(P(), P())).toEqual([]);
    const hotter = explainChange(P(), P({ temperature: 60 }));
    expect(hotter).toHaveLength(1);
    expect(hotter[0]).toMatch(/^Higher temperature/);
    expect(hotter[0]).toMatch(/effective collisions per unit time/);
    expect(explainChange(P({ surface: "powder" }), P({ surface: "lump" }))[0]).toMatch(/^Smaller surface area/);
    expect(explainChange(P(), P({ catalyst: true }))[0]).toMatch(/lower activation energy/);
    expect(explainChange(P(), P({ concentration: 2, temperature: 10 }))).toHaveLength(2);
  });
});
