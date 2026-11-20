import { describe, expect, it } from "vitest";
import { EXAMPLES, exampleById } from "./examples";
import { memo, subscriptRuns } from "./memo";
import { G, cutString, forces, slipAngle, startMotion, step, stopping } from "./slope";

// Every example against its hand-worked answer (g = 9,8 m·s⁻², up the slope positive).

const deg = (d: number) => (d * Math.PI) / 180;
const ex = (id: string) => exampleById(id)!.params;
const atStart = (id: string) => forces(ex(id), startMotion(ex(id)));
const memoText = (id: string, m = startMotion(ex(id))) =>
  memo(ex(id), forces(ex(id), m), m)
    .flatMap((s) => [s.head, ...s.lines])
    .join("\n");

describe("the examples", () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s runs for 3 s without leaving the slope", (_, e) => {
    let m = startMotion(e.params);
    for (let i = 0; i < 180; i++) m = step(e.params, m, 1 / 60);
    expect(m.x).toBeGreaterThan(0);
    expect(m.x).toBeLessThan(e.params.length);
    expect(Number.isFinite(m.v)).toBe(true);
  });

  it("have unique ids", () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
  });

  it("at rest: 6 kg on 25°, μₛ = 0,6 — static friction 24,85 N up the slope, less than μₛFN = 31,97 N", () => {
    const f = atStart("rest");
    expect(f.state).toBe("rest");
    expect(f.friction).toBeCloseTo(6 * G * Math.sin(deg(25)), 9);
    expect(f.friction).toBeCloseTo(24.85, 2);
    expect(f.staticMax).toBeCloseTo(31.97, 2);
  });

  it("slides: 3 kg on 35°, μₖ = 0,35 — a = 2,81 m·s⁻² down the slope", () => {
    const f = atStart("slides");
    expect(f.state).toBe("starting");
    expect(f.a).toBeCloseTo(-G * (Math.sin(deg(35)) - 0.35 * Math.cos(deg(35))), 9);
    expect(f.a).toBeCloseTo(-2.81, 2);
  });

  it("frictionless 30°: a = g sin 30° = 4,9 m·s⁻² down the slope", () => {
    expect(atStart("frictionless").a).toBeCloseTo(-4.9, 9);
  });

  it("tilt: μₛ = 0,45 slips at 24,2°", () => {
    expect(slipAngle(ex("tilt"), ex("tilt").angle)).toBeCloseTo((Math.atan(0.45) * 180) / Math.PI, 6);
    expect(slipAngle(ex("tilt"), ex("tilt").angle)).toBeCloseTo(24.23, 2);
  });

  it("pushed up at 4 m·s⁻¹ on 30°, μₖ = 0,2: a = −6,60 m·s⁻², it stops after 1,21 m", () => {
    const f = atStart("pushed-up");
    expect(f.a).toBeCloseTo(-(G * Math.sin(deg(30)) + 0.2 * G * Math.cos(deg(30))), 9);
    expect(stopping(4, f.a)!.distance).toBeCloseTo(1.21, 2);
  });

  it("pulled at 20° to a 25° slope with 40 N: FN = 21,85 N and a = 3,07 m·s⁻² up the slope", () => {
    const f = atStart("pulled-angle");
    expect(f.normal).toBeCloseTo(4 * G * Math.cos(deg(25)) - 40 * Math.sin(deg(20)), 9);
    expect(f.normal).toBeCloseTo(21.85, 2);
    expect(f.state).toBe("starting");
    expect(f.a).toBeCloseTo(3.07, 2);
  });

  it("pushed up at constant velocity: F_net = 0 while it moves", () => {
    const f = atStart("constant-velocity");
    expect(f.state).toBe("up");
    expect(Math.abs(f.a)).toBeLessThan(1e-5);
  });

  it("hanging mass: a = 3,80 m·s⁻², T = 17,99 N; held by friction: T = m₂g = 24,5 N", () => {
    const f = atStart("pulley");
    expect(f.a).toBeCloseTo(3.80, 2);
    expect(f.tension).toBeCloseTo(17.99, 2);
    const held = atStart("pulley-rest");
    expect(held.state).toBe("rest");
    expect(held.tension).toBeCloseTo(2.5 * G, 9);
  });

  it("cut the string: no tension any more, and the block slows at g sin θ + μₖg cos θ", () => {
    const p = ex("cut");
    let m = startMotion(p);
    for (let i = 0; i < 30; i++) m = step(p, m, 1 / 60);
    m = cutString(p, m);
    const f = forces(p, m);
    expect(f.tension).toBe(0);
    expect(f.a).toBeCloseTo(-G * (Math.sin(deg(20)) + 0.2 * Math.cos(deg(20))), 9);
  });
});

describe("the memo", () => {
  it("works the components, the normal force and static friction for a block at rest", () => {
    const text = memoText("rest");
    expect(text).toContain("F_g = mg = (6)(9,8) = 58,80 N");
    expect(text).toContain("F_{g∥} = F_g sin θ = (58,80)(sin 25°) = 24,85 N down the slope");
    expect(text).toContain("F_N = F_{g⊥} = 53,29 N");
    expect(text).toContain("F_{fs}(max) = μₛF_N = (0,6)(53,29) = 31,97 N");
    expect(text).toContain("static friction holds the block: F_f = 24,85 N up the slope");
    expect(text).toContain("θ = tan⁻¹(0,6) = 31,0°");
  });

  it("gives Fnet and a for a block that slides", () => {
    const text = memoText("slides");
    expect(text).toContain("kinetic friction acts up the slope");
    expect(text).toContain("a = F_{net} / m = −8,43 / 3 = −2,81 m·s⁻², i.e. 2,81 m·s⁻² down the slope");
  });

  it("treats each body over a pulley on its own, and gives the tension", () => {
    const text = memoText("pulley");
    expect(text).toContain("m₂g − T = m₂a");
    expect(text).toContain("T = m₂(g − a) = (3)(9,8 − 3,80) = 17,99 N");
  });

  it("says where a block pushed up the slope comes to rest", () => {
    expect(memoText("pushed-up")).toContain("comes to rest after Δx = v² / 2a = (4,00)² / (2 × 6,60) = 1,21 m");
  });

  it("prints subscripts from _x and _{…}", () => {
    expect(subscriptRuns("F_{g∥} = F_g sin θ")).toEqual([
      ["F", false],
      ["g∥", true],
      [" = F", false],
      ["g", true],
      [" sin θ", false],
    ]);
  });
});
