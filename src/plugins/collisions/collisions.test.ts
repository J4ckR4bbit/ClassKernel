import { describe, expect, it } from "vitest";
import { CollParams, DEFAULT_PARAMS, EXAMPLES, forceAt, outcome, plan, squeeze, stateAt } from "./collisions";

const P = (patch: Partial<CollParams> = {}): CollParams => ({ ...DEFAULT_PARAMS, ...patch });

describe("the outcome", () => {
  it("stuck together: one common velocity from conservation of momentum", () => {
    // (2)(4) + (3)(1) = (5)v → v = 2,2 m·s⁻¹
    const o = outcome(P({ kind: "stick", massA: 2, massB: 3, uA: 4, uB: 1 }));
    expect(o.vA).toBeCloseTo(2.2, 12);
    expect(o.vB).toBeCloseTo(2.2, 12);
    expect(o.pAfter).toBeCloseTo(o.pBefore, 12);
    expect(o.verdict).toBe("inelastic");
    expect(o.ekBefore).toBeCloseTo(17.5, 12);
    expect(o.ekAfter).toBeCloseTo(12.1, 12);
  });

  it("elastic: momentum and kinetic energy both conserved; equal masses swap velocities", () => {
    const swap = outcome(P({ kind: "elastic", massA: 1, massB: 1, uA: 2, uB: 0 }));
    expect(swap.vA).toBeCloseTo(0, 12);
    expect(swap.vB).toBeCloseTo(2, 12);
    for (const [mA, mB, uA, uB] of [
      [0.5, 2, 4, 0],
      [3, 1, 2, -1],
      [2, 5, 1, -3],
    ]) {
      const o = outcome(P({ kind: "elastic", massA: mA, massB: mB, uA, uB }));
      expect(o.pAfter).toBeCloseTo(o.pBefore, 12);
      expect(o.ekAfter).toBeCloseTo(o.ekBefore, 12);
      expect(o.verdict).toBe("elastic");
      // They separate as fast as they approached.
      expect(o.vB - o.vA).toBeCloseTo(uA - uB, 12);
    }
    // A light ball off a heavy one at rest bounces back: −2,4 and 1,6 m·s⁻¹.
    const bounce = outcome(P({ kind: "elastic", massA: 0.5, massB: 2, uA: 4, uB: 0 }));
    expect(bounce.vA).toBeCloseTo(-2.4, 12);
    expect(bounce.vB).toBeCloseTo(1.6, 12);
  });

  it("A's velocity given: B's from Σp before = Σp after, and the Eₖ test classifies it", () => {
    // (0,4)(5) + 0 = (0,4)(−1) + 1,2 v_B → v_B = 2 m·s⁻¹; Eₖ 5 J → 2,6 J: inelastic.
    const o = outcome(P({ kind: "given", massA: 0.4, massB: 1.2, uA: 5, uB: 0, vAGiven: -1 }));
    expect(o.vB).toBeCloseTo(2, 12);
    expect(o.ekBefore).toBeCloseTo(5, 12);
    expect(o.ekAfter).toBeCloseTo(2.6, 12);
    expect(o.verdict).toBe("inelastic");
    expect(o.possible).toBe(true);
    expect(o.problem).toBe("");
  });

  it("Δp of A and B are equal and opposite, and so are the average forces (Newton's third law)", () => {
    for (const ex of EXAMPLES) {
      const o = outcome(ex.params);
      expect(o.dpA).toBeCloseTo(-o.dpB, 9);
      expect(o.forceA).toBeCloseTo(-o.forceB, 6);
      expect(o.forceA).toBeCloseTo(o.dpA / ex.params.contactTime, 9);
    }
  });

  it("an explosion: from rest, momenta equal and opposite, kinetic energy gained", () => {
    const o = outcome(P({ kind: "explosion", massA: 1, massB: 2, uA: 0, vAGiven: -2 }));
    expect(o.vB).toBeCloseTo(1, 12);
    expect(o.pAfter).toBeCloseTo(0, 12);
    expect(o.ekAfter).toBeCloseTo(3, 12);
    expect(o.verdict).toBe("explosion");
  });

  it("says when they never meet, and refuses a result where A passes through B", () => {
    expect(outcome(P({ uA: 1, uB: 2 })).collides).toBe(false);
    expect(outcome(P({ uA: 1, uB: 2 })).problem).toMatch(/never collide/);
    const through = outcome(P({ kind: "given", massA: 1, massB: 1, uA: 4, uB: 0, vAGiven: 3 }));
    expect(through.possible).toBe(false);
    expect(through.problem).toMatch(/passing through/);
    // Momentum fine, but Eₖ gained: flagged, still possible to draw.
    const gain = outcome(P({ kind: "given", massA: 1, massB: 1, uA: 2, uB: 0, vAGiven: -3 }));
    expect(gain.vB).toBeCloseTo(5, 12);
    expect(gain.possible).toBe(true);
    expect(gain.problem).toMatch(/can't increase/);
  });
});

describe("the run", () => {
  it("they touch exactly when the contact starts, in the middle of the track", () => {
    for (const ex of EXAMPLES) {
      const pl = plan(ex.params);
      const s = stateAt(pl, pl.tc);
      expect(s.xB - s.xA).toBeCloseTo(pl.width, 9);
      expect((s.xA + s.xB) / 2).toBeCloseTo(pl.track / 2, 9);
      // Both start on the track.
      const s0 = stateAt(pl, 0);
      expect(s0.xA - pl.width / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(s0.xB + pl.width / 2).toBeLessThanOrEqual(pl.track + 1e-9);
    }
  });

  it("the total momentum is the same at every instant, through the contact too", () => {
    for (const ex of EXAMPLES) {
      const pl = plan(ex.params);
      const { massA, massB } = ex.params;
      const p0 = pl.out.pBefore;
      for (let k = 0; k <= 50; k++) {
        const s = stateAt(pl, pl.tc - 0.1 + ((pl.dt + 0.2) * k) / 50);
        expect(massA * s.vA + massB * s.vB).toBeCloseTo(p0, 6);
        // And the forces on the two are equal and opposite throughout.
        expect(s.fA).toBeCloseTo(-s.fB, 6);
      }
    }
  });

  it("the velocity after the contact is the outcome's, and the force is its rate of change of momentum", () => {
    const ex = EXAMPLES.find((e) => e.id === "given-bounce")!;
    const pl = plan(ex.params);
    const after = stateAt(pl, pl.tc + pl.dt + 0.01);
    expect(after.vA).toBeCloseTo(pl.out.vA, 12);
    expect(after.vB).toBeCloseTo(pl.out.vB, 12);
    // F = Δp/Δt numerically, mid-contact.
    const t = pl.tc + pl.dt * 0.37;
    const h = 1e-6;
    const dpdt = (ex.params.massA * (stateAt(pl, t + h).vA - stateAt(pl, t - h).vA)) / (2 * h);
    expect(stateAt(pl, t).fA).toBeCloseTo(dpdt, 3);
    // Position is the integral of velocity.
    const dxdt = (stateAt(pl, t + h).xA - stateAt(pl, t - h).xA) / (2 * h);
    expect(dxdt).toBeCloseTo(stateAt(pl, t).vA, 5);
  });

  it("the area under F–t is the impulse, Δp; double the contact time halves the peak force", () => {
    const dp = 6;
    for (const dt of [0.05, 0.1, 0.4]) {
      let area = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) area += forceAt(dp, dt, ((i + 0.5) * dt) / n) * (dt / n);
      expect(area).toBeCloseTo(dp, 5);
    }
    expect(forceAt(dp, 0.2, 0.1)).toBeCloseTo(forceAt(dp, 0.1, 0.05) / 2, 9);
  });

  it("the bumpers are squeezed during an elastic contact and spring back after it", () => {
    const pl = plan(P({ kind: "elastic", massA: 1, massB: 1, uA: 2, uB: 0, contactTime: 0.1 }));
    const mid = stateAt(pl, pl.tc + pl.dt / 2);
    // Most squeezed half-way: (u_rel)(Δt)/π.
    expect(squeeze(pl, mid)).toBeCloseTo((2 * 0.1) / Math.PI, 9);
    expect(squeeze(pl, stateAt(pl, pl.tc + pl.dt + 0.05))).toBeCloseTo(0, 9);
  });

  it("the run ends after the contact, or sooner if one leaves the track", () => {
    for (const ex of EXAMPLES) {
      const pl = plan(ex.params);
      expect(pl.tEnd).toBeGreaterThan(pl.tc + pl.dt);
      const s = stateAt(pl, pl.tEnd);
      expect(s.xA - pl.width / 2).toBeGreaterThan(-0.02 * pl.track);
      expect(s.xB + pl.width / 2).toBeLessThan(pl.track * 1.02);
    }
  });
});
