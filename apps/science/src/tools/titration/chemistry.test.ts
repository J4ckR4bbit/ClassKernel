import { describe, expect, it } from "vitest";
import {
  Setup,
  concentrationFromPH,
  curve,
  equivalencePoints,
  equivalenceRelation,
  fractions,
  indicatorColour,
  mix,
  pHAfter,
  pHOf,
  soluteById,
  suitableIndicators,
  volumeText,
} from "./chemistry";

const solution = (id: string, concentration: number, volume: number) => ({ solute: soluteById(id), concentration, volume });
const setup = (flask: string, burette: string, cFlask = 0.1, cBurette = 0.1, vFlask = 25): Setup => ({
  flask: { solute: soluteById(flask), concentration: cFlask, volume: vFlask },
  burette: { solute: soluteById(burette), concentration: cBurette },
});

describe("pH of single solutions", () => {
  const pH = (id: string, c: number) => pHOf(mix([solution(id, c, 25)]));

  it("gets the textbook strong acids and bases", () => {
    expect(pH("hcl", 0.1)).toBeCloseTo(1.0, 2);
    expect(pH("hno3", 0.01)).toBeCloseTo(2.0, 2);
    expect(pH("naoh", 0.1)).toBeCloseTo(13.0, 2);
    expect(pH("koh", 0.001)).toBeCloseTo(11.0, 2);
    expect(pH("baoh2", 0.05)).toBeCloseTo(13.0, 2); // two OH⁻ per unit
    expect(pH("h2o", 0)).toBeCloseTo(7.0, 6);
    // Very dilute acid: water's own ions matter, pH stays under 7.
    expect(pH("hcl", 1e-8)).toBeGreaterThan(6.9);
    expect(pH("hcl", 1e-8)).toBeLessThan(7.0);
  });

  it("gets the weak ones from their Ka and Kb", () => {
    expect(pH("ch3cooh", 0.1)).toBeCloseTo(2.88, 1);
    expect(pH("hf", 0.1)).toBeCloseTo(2.1, 1);
    expect(pH("nh3", 0.1)).toBeCloseTo(11.13, 1);
    expect(pH("na2co3", 0.1)).toBeCloseTo(11.66, 1);
    expect(pH("h2so4", 0.1)).toBeLessThan(1.0); // the second proton adds a little
    expect(pH("h2so4", 0.1)).toBeGreaterThan(0.9);
    expect(pH("h3po4", 0.1)).toBeCloseTo(1.6, 1);
  });

  it("gives the fractions of a diprotic acid's forms", () => {
    const carbonic = soluteById("h2co3").systems[0];
    const atSeven = fractions(carbonic, 7);
    // At pH 7 (above pKa₁ 6,35, far below pKa₂): mostly HCO₃⁻.
    expect(atSeven[1]).toBeGreaterThan(0.8);
    expect(atSeven.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(fractions(carbonic, 1)[2]).toBeGreaterThan(0.99); // H₂CO₃ in strong acid
    expect(fractions(carbonic, 13)[0]).toBeGreaterThan(0.99); // CO₃²⁻ in strong base
  });
});

describe("titration curves", () => {
  it("strong acid with strong base: equivalence at 25 cm³ and pH 7, with the steep jump", () => {
    const s = setup("hcl", "naoh");
    const [eq] = equivalencePoints(s);
    expect(eq.volume).toBeCloseTo(25, 6);
    expect(eq.pH).toBeCloseTo(7, 3);
    expect(pHAfter(s, 0)).toBeCloseTo(1, 2);
    expect(pHAfter(s, 24.9)).toBeLessThan(4);
    expect(pHAfter(s, 25.1)).toBeGreaterThan(10);
    expect(pHAfter(s, 50)).toBeCloseTo(12.52, 1);
  });

  it("weak acid with strong base: equivalence above 7, buffer half-way at pKa", () => {
    const s = setup("ch3cooh", "naoh");
    const [eq] = equivalencePoints(s);
    expect(eq.volume).toBeCloseTo(25, 6);
    expect(eq.pH).toBeCloseTo(8.72, 1);
    expect(pHAfter(s, 12.5)).toBeCloseTo(4.76, 1);
    expect(suitableIndicators(eq.pH).map((i) => i.id)).toContain("phenolphthalein");
    expect(suitableIndicators(eq.pH).map((i) => i.id)).not.toContain("methyl-orange");
  });

  it("weak base with strong acid: equivalence below 7", () => {
    const s = setup("nh3", "hcl");
    const [eq] = equivalencePoints(s);
    expect(eq.volume).toBeCloseTo(25, 6);
    expect(eq.pH).toBeCloseTo(5.28, 1);
    expect(suitableIndicators(eq.pH).map((i) => i.id)).toContain("methyl-red");
  });

  it("counts the equivalents: H₂SO₄ needs twice the NaOH, Ba(OH)₂ half the HCl", () => {
    expect(equivalencePoints(setup("h2so4", "naoh")).map((e) => e.volume)).toEqual([25, 50]);
    expect(equivalencePoints(setup("hcl", "baoh2"))[0].volume).toBeCloseTo(12.5, 6);
    expect(equivalencePoints(setup("oxalic", "naoh")).map((e) => Math.round(e.volume))).toEqual([25, 50]);
    expect(equivalencePoints(setup("naoh", "oxalic"))[0].volume).toBeCloseTo(12.5, 6);
  });

  it("sodium carbonate against HCl has two equivalence points, near pH 8,3 and 3,9", () => {
    const points = equivalencePoints(setup("na2co3", "hcl"));
    expect(points.map((e) => e.volume)).toEqual([25, 50]);
    expect(points[0].pH).toBeCloseTo(8.3, 0);
    expect(points[1].pH).toBeCloseTo(3.9, 0);
  });

  it("phosphoric acid shows two usable steps", () => {
    const points = equivalencePoints(setup("h3po4", "naoh"));
    expect(points.length).toBe(3);
    expect(points[0].pH).toBeCloseTo(4.7, 0);
    expect(points[1].pH).toBeCloseTo(9.7, 0);
  });

  it("has no equivalence point for acid on acid, or water", () => {
    expect(equivalencePoints(setup("hcl", "hno3"))).toEqual([]);
    expect(equivalencePoints(setup("naoh", "h2o"))).toEqual([]);
    expect(equivalenceRelation(setup("hcl", "hno3"))).toMatch(/No neutralisation/);
    expect(equivalenceRelation(setup("h2so4", "naoh"))).toContain("1 : 2");
    expect(equivalenceRelation(setup("h2so4", "naoh"))).toContain("c₁V₁ / 1 = c₂V₂ / 2");
    // Water only dilutes.
    expect(pHAfter(setup("hcl", "h2o", 0.1, 0), 25)).toBeCloseTo(1.3, 1);
  });

  it("draws a curve that only rises when base is added to acid", () => {
    const points = curve(setup("hcl", "naoh"), 50, 0.5);
    expect(points.length).toBe(101);
    for (let i = 1; i < points.length; i++) expect(points[i].pH).toBeGreaterThanOrEqual(points[i - 1].pH - 1e-9);
  });
});

describe("words", () => {
  it("writes burette volumes to two decimals and concentrations from a pH", () => {
    expect(volumeText(0)).toBe("0,00 cm³");
    expect(volumeText(25.5)).toBe("25,50 cm³");
    expect(concentrationFromPH(1)).toBe("1,0 × 10⁻¹ mol·dm⁻³");
    expect(concentrationFromPH(1.0000000001)).toBe("1,0 × 10⁻¹ mol·dm⁻³");
    expect(concentrationFromPH(2.3)).toBe("5,0 × 10⁻³ mol·dm⁻³");
    expect(concentrationFromPH(13)).toBe("1,0 × 10⁻¹³ mol·dm⁻³");
  });
});

describe("indicators", () => {
  it("shows the acid colour below the range, the base colour above, and a mix in it", () => {
    expect(indicatorColour("phenolphthalein", 4)).toBe("#ffffff");
    expect(indicatorColour("phenolphthalein", 12)).toBe("#e3399a");
    expect(indicatorColour("methyl-orange", 2)).toBe("#e4403a");
    expect(indicatorColour("methyl-orange", 7)).toBe("#f4c430");
    const mid = indicatorColour("bromothymol-blue", 6.8)!;
    expect(mid).not.toBe("#f2d94e");
    expect(mid).not.toBe("#1f5fbf");
    expect(indicatorColour(null, 7)).toBeNull();
  });

  it("runs the universal indicator from red to violet", () => {
    expect(indicatorColour("universal", 1)).toMatch(/^#[c-e]/); // reds
    expect(indicatorColour("universal", 7)).toBe("#27ae60");
    expect(indicatorColour("universal", 14)).toBe("#4a235a");
  });
});
