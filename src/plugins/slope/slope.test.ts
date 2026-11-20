import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, G, SlopeParams, hangMax, hangStart, cutString, forces, slipAngle, startMotion, stateText, step, stopping } from "./slope";

// Every expected value worked by hand, the way the memo would, with g = 9,8 m·s⁻².

const P = (patch: Partial<SlopeParams>): SlopeParams => ({ ...DEFAULT_PARAMS, ...patch });
const atRest = { v: 0, cut: false };
const deg = (d: number) => (d * Math.PI) / 180;

/** Run the motion for a while in small steps, as the screen does. */
function run(p: SlopeParams, seconds: number, dt = 1 / 60) {
  let m = startMotion(p);
  for (let t = 0; t < seconds - 1e-9; t += dt) m = step(p, m, dt);
  return m;
}

describe("forces on a block on a slope", () => {
  it("resolves the weight: 5 kg on 20° — Fg = 49 N, Fg∥ = 16,76 N, Fg⊥ = 46,04 N, and FN = Fg⊥", () => {
    const f = forces(P({ mass: 5, angle: 20 }), atRest);
    expect(f.weight).toBeCloseTo(49, 9);
    expect(f.weightPar).toBeCloseTo(49 * Math.sin(deg(20)), 9);
    expect(f.weightPar).toBeCloseTo(16.759, 3);
    expect(f.weightPerp).toBeCloseTo(46.045, 3);
    expect(f.normal).toBeCloseTo(f.weightPerp, 12);
  });

  it("stays at rest when Fg∥ is less than μₛFN, with static friction equal to Fg∥ up the slope", () => {
    const f = forces(P({ mass: 5, angle: 20, muS: 0.5, muK: 0.4 }), atRest);
    expect(f.state).toBe("rest");
    expect(f.isStatic).toBe(true);
    expect(f.staticMax).toBeCloseTo(23.022, 3);
    expect(f.friction).toBeCloseTo(16.759, 3); // up the slope
    expect(f.a).toBe(0);
    expect(f.net).toBe(0);
  });

  it("slides when Fg∥ beats μₛFN: 2 kg on 30°, μₖ = 0,3 — a = 2,35 m·s⁻² down the slope", () => {
    const f = forces(P({ mass: 2, angle: 30, muS: 0.4, muK: 0.3 }), atRest);
    expect(f.state).toBe("starting");
    // Fg∥ = 9,8 N; FN = 16,97 N; Ffk = 5,09 N; a = (9,8 − 5,09) / 2.
    expect(f.friction).toBeCloseTo(0.3 * 2 * G * Math.cos(deg(30)), 9);
    expect(f.a).toBeCloseTo(-(9.8 - 0.3 * 2 * G * Math.cos(deg(30))) / 2, 9);
    expect(f.a).toBeCloseTo(-2.354, 3);
  });

  it("on a frictionless slope, a = g sin θ down the slope", () => {
    const f = forces(P({ angle: 25, frictionless: true }), atRest);
    expect(f.a).toBeCloseTo(-G * Math.sin(deg(25)), 12);
    expect(f.friction).toBe(0);
  });

  it("an applied force at an angle to the slope: its perpendicular part lightens FN, and static friction can still hold", () => {
    // 4 kg on 25°, 30 N pulling up the slope at 20° above it; μₛ = 0,5.
    const f = forces(P({ mass: 4, angle: 25, force: 30, forceAngle: 20, forceDir: "up", muS: 0.5, muK: 0.4 }), atRest);
    expect(f.forcePar).toBeCloseTo(30 * Math.cos(deg(20)), 9); // 28,19 N
    expect(f.forcePerp).toBeCloseTo(30 * Math.sin(deg(20)), 9); // 10,26 N
    expect(f.normal).toBeCloseTo(4 * G * Math.cos(deg(25)) - 30 * Math.sin(deg(20)), 9); // 25,27 N
    expect(f.drive).toBeCloseTo(28.191 - 16.567, 2); // 11,62 N up the slope
    expect(f.state).toBe("rest"); // 11,62 N < μₛFN = 12,63 N
    expect(f.friction).toBeCloseTo(-f.drive, 12); // down the slope
  });

  it("a push into the slope (a negative angle) presses the block harder onto it", () => {
    const f = forces(P({ mass: 4, angle: 25, force: 30, forceAngle: -25 }), atRest);
    expect(f.normal).toBeGreaterThan(f.weightPerp);
  });

  it("a big enough pull away from the surface lifts the block off", () => {
    const f = forces(P({ mass: 1, angle: 30, force: 50, forceAngle: 80 }), atRest);
    expect(f.state).toBe("lifted");
  });
});

describe("motion", () => {
  it("a block pushed up a rough slope stops where v² = u² + 2aΔx says, then slides back if friction can't hold it", () => {
    // 30°, μₖ = 0,2, μₛ = 0,3, u = 4 m·s⁻¹ up: a = −(g sin 30° + μₖ g cos 30°) = −6,597 m·s⁻².
    const p = P({ angle: 30, muS: 0.3, muK: 0.2, v0: 4, start: 0.5, length: 6 });
    const a = -(G * Math.sin(deg(30)) + 0.2 * G * Math.cos(deg(30)));
    expect(forces(p, { v: 4, cut: false }).a).toBeCloseTo(a, 12);
    const stop = stopping(4, a)!;
    expect(stop.distance).toBeCloseTo(16 / (2 * -a), 12); // 1,213 m
    expect(stop.time).toBeCloseTo(4 / -a, 12); // 0,606 s
    // Step straight to the stopping time in uneven steps: exactly at rest there, at the top of its path.
    let m = startMotion(p);
    for (const dt of [0.1, 0.237, 0.05]) m = step(p, m, dt);
    m = step(p, m, stop.time - m.t);
    expect(m.v).toBeCloseTo(0, 9);
    expect(m.x - 0.5).toBeCloseTo(stop.distance, 9);
    // μₛ = 0,3 < tan 30°: it slides back down, at (g sin 30° − μₖ g cos 30°).
    m = step(p, m, 0.5);
    expect(m.v).toBeCloseTo(-(G * Math.sin(deg(30)) - 0.2 * G * Math.cos(deg(30))) * 0.5, 9);
  });

  it("a block pushed up a slope that can hold it stops and stays", () => {
    const p = P({ angle: 15, muS: 0.5, muK: 0.4, v0: 2, start: 0.5 });
    const m = run(p, 3);
    expect(m.v).toBe(0);
    expect(stateText(forces(p, m), m, p)).toMatch(/^At rest/);
  });

  it("speeds up steadily down a rough slope: v = at after t", () => {
    const p = P({ mass: 2, angle: 30, muS: 0.4, muK: 0.3, start: 3.7, length: 4 });
    const m = run(p, 1);
    expect(m.v).toBeCloseTo(-2.354 * 1, 2);
    expect(m.x).toBeCloseTo(3.7 - 0.5 * 2.354 * 1, 2);
  });

  it("stops at the bottom of the slope", () => {
    const m = run(P({ angle: 40, frictionless: true, start: 1 }), 5);
    expect(m.ended).toMatch(/bottom/);
    expect(m.v).toBe(0);
  });
});

describe("a hanging mass over a pulley", () => {
  // 2 kg on a 20° slope, 3 kg hanging, μₖ = 0,2.
  const p = P({ setup: "pulley", mass: 2, hangingMass: 3, angle: 20, muS: 0.3, muK: 0.2, start: 1 });

  it("a = (m₂g − m₁g sin θ − μₖm₁g cos θ) / (m₁ + m₂) = 3,80 m·s⁻², and FT = m₂(g − a) = 17,99 N", () => {
    const f = forces(p, atRest);
    const a = (3 * G - 2 * G * Math.sin(deg(20)) - 0.2 * 2 * G * Math.cos(deg(20))) / 5;
    expect(f.state).toBe("starting");
    expect(f.a).toBeCloseTo(a, 12);
    expect(f.a).toBeCloseTo(3.8025, 3);
    expect(f.tension).toBeCloseTo(3 * (G - a), 12);
    expect(f.tension).toBeCloseTo(17.99, 2);
    // Both bodies obey Fnet = ma.
    expect(f.tension - f.weightPar + f.friction).toBeCloseTo(2 * f.a, 9);
    expect(f.hangingWeight - f.tension).toBeCloseTo(3 * f.a, 9);
  });

  it("holds at rest when friction can, with the tension equal to the hanging weight", () => {
    const q = { ...p, hangingMass: 1, muS: 0.6 };
    const f = forces(q, atRest);
    // Drive = 9,8 − 6,70 = 3,10 N up; μₛFN = 0,6 × 18,42 = 11,05 N.
    expect(f.state).toBe("rest");
    expect(f.tension).toBeCloseTo(9.8, 12);
  });

  it("the hanging mass moves down as the block moves up, until it reaches the floor", () => {
    const m = run(p, 0.5);
    expect(m.hang - hangStart(p)).toBeCloseTo(m.x - 1, 12);
    const later = run(p, 5);
    expect(later.ended).toMatch(/floor|pulley/);
    expect(later.hang).toBeLessThanOrEqual(hangMax(p) + 1e-9);
  });

  it("cut the string while it moves up: the block carries on up, slowing at g sin θ + μₖ g cos θ, and the mass falls freely", () => {
    let m = run(p, 0.4);
    const v = m.v;
    m = cutString(p, m);
    const f = forces(p, m);
    expect(f.tension).toBe(0);
    expect(f.a).toBeCloseTo(-(G * Math.sin(deg(20)) + 0.2 * G * Math.cos(deg(20))), 12);
    const hang = m.hang;
    const after = step(p, m, 0.1);
    expect(after.v).toBeCloseTo(v + f.a * 0.1, 9);
    expect(after.hang - hang).toBeCloseTo(v * 0.1 + 0.5 * G * 0.01, 9);
  });
});

describe("tilting the slope", () => {
  it("a block slips when tan θ = μₛ", () => {
    expect(slipAngle(P({ muS: 0.5 }), 0)).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 6); // 26,57°
    expect(slipAngle(P({ muS: 0.8 }), 10)).toBeCloseTo((Math.atan(0.8) * 180) / Math.PI, 6); // 38,66°
  });

  it("the slip angle doesn't depend on the mass", () => {
    expect(slipAngle(P({ mass: 1, muS: 0.4 }))).toBeCloseTo(slipAngle(P({ mass: 50, muS: 0.4 }))!, 9);
  });

  it("a frictionless block slips at once", () => {
    expect(slipAngle(P({ frictionless: true }), 0)).toBeCloseTo(0, 6);
  });

  it("starting already past it: it slips straight away", () => {
    expect(slipAngle(P({ muS: 0.2 }), 30)).toBe(30);
  });
});
