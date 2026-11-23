import { describe, expect, it } from "vitest";
import {
  ELEMENTS,
  EV,
  H,
  METALS,
  allTransitions,
  band,
  colourName,
  electronsPerSecond,
  emission,
  frequencyOf,
  photocurrent,
  thresholdFrequency,
  thresholdWavelength,
  transition,
  wavelengthColour,
  wavelengthOf,
} from "./photons";

describe("light", () => {
  it("f = c/λ and back, with c = 3 × 10⁸ m·s⁻¹", () => {
    expect(frequencyOf(500)).toBeCloseTo(6e14, -8);
    expect(wavelengthOf(6e14)).toBeCloseTo(500, 9);
    expect(wavelengthOf(frequencyOf(437))).toBeCloseTo(437, 9);
  });

  it("names the band and the colour (visible 400–700 nm)", () => {
    expect(band(350)).toBe("ultraviolet");
    expect(band(400)).toBe("visible");
    expect(band(701)).toBe("infrared");
    expect(colourName(650)).toBe("red");
    expect(colourName(530)).toBe("green");
    expect(colourName(470)).toBe("blue");
    expect(colourName(250)).toBe("ultraviolet");
  });

  it("draws red light red, green light green and UV as a grey", () => {
    const rgb = (s: string) => s.match(/\d+/g)!.map(Number);
    const [r1, g1, b1] = rgb(wavelengthColour(650));
    expect(r1).toBeGreaterThan(200);
    expect(g1).toBeLessThan(40);
    expect(b1).toBe(0);
    const [r2, g2, b2] = rgb(wavelengthColour(530));
    expect(g2).toBeGreaterThan(200);
    expect(g2).toBeGreaterThan(r2);
    expect(g2).toBeGreaterThan(b2);
    expect(wavelengthColour(200)).toBe("#9e8fb8");
  });
});

describe("the photoelectric effect", () => {
  it("works the 2022 memo's way: 450 nm on W₀ = 3,40 × 10⁻¹⁹ J leaves Eₖ(max) = 1 × 10⁻¹⁹ J", () => {
    // (6,6 × 10⁻³⁴)(3 × 10⁸)/(450 × 10⁻⁹) = 3,40 × 10⁻¹⁹ + Eₖ(max)
    const e = emission(frequencyOf(450), 3.4e-19 / EV);
    expect(e.energy).toBeCloseTo(4.4e-19, 30);
    expect(e.emitted).toBe(true);
    expect(e.ekMax).toBeCloseTo(1.0e-19, 30);
  });

  it("E = W₀ + Eₖ(max), and v_max from Eₖ(max) = ½mv² with mₑ = 9,1 × 10⁻³¹ kg", () => {
    // 420 nm on W₀ = 2,3 eV: ½(9,1 × 10⁻³¹)v² = 4,71 × 10⁻¹⁹ − 3,68 × 10⁻¹⁹.
    const e = emission(frequencyOf(420), 2.3);
    expect(e.energy).toBeCloseTo(4.714e-19, 22);
    expect(e.workFunction).toBeCloseTo(3.68e-19, 30);
    expect(e.energy).toBeCloseTo(e.workFunction + e.ekMax, 30);
    expect(0.5 * 9.1e-31 * e.vMax ** 2).toBeCloseTo(e.ekMax, 30);
    expect(e.vMax).toBeCloseTo(4.77e5, -3);
  });

  it("below the threshold frequency nothing is emitted, however intense the light", () => {
    const zinc = METALS.find((m) => m.id === "zinc")!;
    const f0 = thresholdFrequency(zinc.workFunction);
    expect(f0).toBeCloseTo((4.3 * 1.6e-19) / 6.6e-34, -6);
    const below = emission(f0 * 0.98, zinc.workFunction);
    expect(below.emitted).toBe(false);
    expect(below.ekMax).toBe(0);
    expect(below.vMax).toBe(0);
    expect(electronsPerSecond(100, below)).toBe(0);
    expect(photocurrent(100, below)).toBe(0);
    // At the threshold itself: emitted, with nothing to spare.
    const at = emission(f0, zinc.workFunction);
    expect(at.emitted).toBe(true);
    expect(at.ekMax).toBeCloseTo(0, 30);
  });

  it("λ₀ is the longest wavelength that still ejects electrons", () => {
    const l0 = thresholdWavelength(2.3);
    expect(emission(frequencyOf(l0 - 1), 2.3).emitted).toBe(true);
    expect(emission(frequencyOf(l0 + 1), 2.3).emitted).toBe(false);
  });

  it("intensity changes how many electrons a second, not their Eₖ(max)", () => {
    const e = emission(frequencyOf(300), 2.1);
    expect(electronsPerSecond(50, e)).toBeCloseTo(electronsPerSecond(100, e) / 2, 0);
    // 100 % is 10 µA.
    expect(photocurrent(100, e)).toBeCloseTo(10e-6, 12);
  });

  it("the Eₖ(max)–f line has gradient h and meets the axes at f₀ and −W₀ for every metal", () => {
    for (const m of METALS) {
      const f1 = thresholdFrequency(m.workFunction) * 1.2;
      const f2 = f1 * 1.5;
      const e1 = emission(f1, m.workFunction).ekMax;
      const e2 = emission(f2, m.workFunction).ekMax;
      expect((e2 - e1) / (f2 - f1)).toBeCloseTo(H, 40);
      // Extended back to f = 0, the line gives −W₀.
      expect(e1 - H * f1).toBeCloseTo(-m.workFunction * EV, 30);
    }
  });

  it("the metals are in order of work function, all distinct", () => {
    const w = METALS.map((m) => m.workFunction);
    expect([...w].sort((a, b) => a - b)).toEqual(w);
    expect(new Set(w).size).toBe(w.length);
  });
});

describe("emission spectra", () => {
  it("n = 3 → n = 2 gives the red Balmer line: ΔE = 1,89 eV, λ ≈ 655 nm with the data sheet's h", () => {
    const t = transition(3, 2);
    expect(t.energyEv).toBeCloseTo(1.89, 10);
    expect(t.energyJ).toBeCloseTo(3.024e-19, 30);
    expect(t.wavelength).toBeCloseTo(654.8, 0);
    expect(colourName(t.wavelength)).toBe("red");
  });

  it("matches the memo: [−3,4 − (−13,6)](1,6 × 10⁻¹⁹)/(6,6 × 10⁻³⁴) = 2,47 × 10¹⁵ Hz", () => {
    expect(transition(2, 1).frequency).toBeCloseTo(2.473e15, -12);
    expect(band(transition(2, 1).wavelength)).toBe("ultraviolet");
  });

  it("falls to n = 1 are ultraviolet, to n = 2 mostly visible, to n = 3 infrared", () => {
    for (const t of allTransitions()) {
      if (t.to === 1) expect(band(t.wavelength)).toBe("ultraviolet");
      if (t.to >= 3) expect(band(t.wavelength)).toBe("infrared");
    }
    const visible = allTransitions().filter((t) => band(t.wavelength) === "visible");
    expect(visible.map((t) => `${t.from}→${t.to}`)).toEqual(["3→2", "4→2", "5→2", "6→2"]);
    expect(allTransitions()).toHaveLength(15);
  });

  it("a bigger fall means a more energetic photon, a higher frequency and a shorter wavelength", () => {
    const a = transition(4, 2);
    const b = transition(3, 2);
    expect(a.energyEv).toBeGreaterThan(b.energyEv);
    expect(a.frequency).toBeGreaterThan(b.frequency);
    expect(a.wavelength).toBeLessThan(b.wavelength);
  });

  it("every element's lines are visible and its brightest is 1", () => {
    for (const el of ELEMENTS) {
      for (const [l, s] of el.lines) {
        expect(band(l)).toBe(l > 700 ? "infrared" : "visible");
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...el.lines.map(([, s]) => s))).toBe(1);
    }
  });
});
