import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS,
  GenParams,
  angleStep,
  coilEmf,
  connection,
  crossings,
  degrees,
  drive,
  driveOmega,
  flux,
  fluxRate,
  outputEmf,
  peakEmf,
  position,
  startAngle,
} from "./generator";

const P = (patch: Partial<GenParams> = {}): GenParams => ({ ...DEFAULT_PARAMS, ...patch });
const deg = (d: number) => (d * Math.PI) / 180;

describe("flux, its rate of change and the emf", () => {
  // N = 100, B = 0,5 T, A = 0,02 m²: BA = 0,01 Wb, NBA = 1.
  const p = P();

  it("Φ = BA cos θ: largest with the coil's plane perpendicular to B (θ = 0), zero with it parallel (θ = 90°)", () => {
    expect(flux(p, 0)).toBeCloseTo(0.01, 12);
    expect(flux(p, deg(90))).toBeCloseTo(0, 12);
    expect(flux(p, deg(60))).toBeCloseTo(0.005, 12);
    expect(flux(p, deg(180))).toBeCloseTo(-0.01, 12);
  });

  it("ΔΦ/Δt is zero where Φ is largest and largest where Φ is zero", () => {
    const w = 2 * Math.PI;
    expect(fluxRate(p, 0, w)).toBeCloseTo(0, 12);
    expect(Math.abs(fluxRate(p, deg(90), w))).toBeCloseTo(0.01 * w, 12);
  });

  it("emf = −N ΔΦ/Δt = NBAω sin θ, and the rate is the true derivative of Φ", () => {
    const w = 3;
    for (const d of [10, 45, 100, 200, 330]) {
      const th = deg(d);
      expect(coilEmf(p, th, w)).toBeCloseTo(-100 * fluxRate(p, th, w), 12);
      expect(coilEmf(p, th, w)).toBeCloseTo(1 * w * Math.sin(th), 12);
      // Numerical derivative of Φ along θ = θ0 + ωt.
      const h = 1e-6;
      const numeric = (flux(p, th + w * h) - flux(p, th - w * h)) / (2 * h);
      expect(fluxRate(p, th, w)).toBeCloseTo(numeric, 6);
    }
  });

  it("the peak emf is NBAω: 2π V at 1 revolution a second, half that at half the speed", () => {
    expect(peakEmf(p)).toBeCloseTo(2 * Math.PI, 12);
    expect(peakEmf(P({ speed: 0.5 }))).toBeCloseTo(Math.PI, 12);
  });

  it("turned clockwise from the plane along the field, the emf starts at its negative peak (as in the 2023 memo)", () => {
    const q = P({ start: "parallel", clockwise: true });
    const th = startAngle(q);
    expect(flux(q, th)).toBeCloseTo(0, 12);
    expect(outputEmf(q, th, driveOmega(q))).toBeCloseTo(-peakEmf(q), 12);
  });
});

describe("slip rings and the commutator", () => {
  it("slip rings pass the coil's emf straight out: it alternates", () => {
    const p = P({ kind: "ac" });
    const w = driveOmega(p);
    const values = [30, 120, 210, 300].map((d) => outputEmf(p, deg(d), w));
    expect(values.some((v) => v > 0) && values.some((v) => v < 0)).toBe(true);
  });

  it("the commutator swaps the connection each half-turn, so the output never reverses: |NBAω sin θ|", () => {
    const p = P({ kind: "dc" });
    const w = driveOmega(p);
    for (let d = 1; d < 360; d += 7) {
      const out = outputEmf(p, deg(d), w);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeCloseTo(Math.abs(coilEmf(p, deg(d), w)), 12);
    }
  });

  it("the commutator swaps where the coil's plane is perpendicular to the field, where the emf is zero", () => {
    const p = P({ kind: "dc" });
    expect(connection(p, deg(-1))).not.toBe(connection(p, deg(1)));
    expect(coilEmf(p, 0, driveOmega(p))).toBeCloseTo(0, 12);
  });

  it("turned the other way, the DC output reverses", () => {
    const p = P({ kind: "dc", clockwise: false });
    expect(outputEmf(p, deg(70), driveOmega(p))).toBeLessThan(0);
  });
});

describe("turning", () => {
  it("driving advances θ by ωΔt and samples at least every 1/240 s", () => {
    const p = P({ speed: 2 });
    const { theta, samples } = drive(p, 0, 0, 0.1);
    expect(theta).toBeCloseTo(driveOmega(p) * 0.1, 12);
    expect(samples.length).toBeGreaterThanOrEqual(24);
    expect(samples[samples.length - 1].t).toBeCloseTo(0.1, 12);
  });

  it("follows a hand on the crank the short way round", () => {
    expect(angleStep(deg(350), deg(10))).toBeCloseTo(deg(20), 12);
    expect(angleStep(deg(10), deg(350))).toBeCloseTo(deg(-20), 12);
    expect(degrees(deg(-90))).toBeCloseTo(270, 9);
  });

  it("names the coil's position", () => {
    expect(position(0)).toBe("perpendicular");
    expect(position(deg(181))).toBe("perpendicular");
    expect(position(deg(90))).toBe("parallel");
    expect(position(deg(45))).toBe("between");
  });

  it("finds where the coil passed perpendicular and parallel to the field: four times a turn", () => {
    const p = P({ speed: 1, start: "parallel" });
    const { samples } = drive(p, 0, startAngle(p), 1);
    const c = crossings(samples);
    // Clockwise from 90°: perpendicular at 0,25 s and 0,75 s, parallel at 0,5 s (and 1 s at the end).
    const perp = c.filter((x) => x.kind === "perpendicular").map((x) => x.t);
    const par = c.filter((x) => x.kind === "parallel").map((x) => x.t);
    expect(perp[0]).toBeCloseTo(0.25, 3);
    expect(perp[1]).toBeCloseTo(0.75, 3);
    expect(par[0]).toBeCloseTo(0.5, 3);
  });
});
