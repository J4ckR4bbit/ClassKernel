import { describe, expect, it } from "vitest";
import { PASTEL_PRESETS, autoTableColour, contrastRatio, tableTint } from "./tableColours";

describe("automatic table colours", () => {
  it("cycles through the pastels in order", () => {
    const n = PASTEL_PRESETS.length;
    expect(autoTableColour(0)).toBe(PASTEL_PRESETS[0].hex);
    expect(autoTableColour(1)).toBe(PASTEL_PRESETS[1].hex);
    expect(autoTableColour(n)).toBe(PASTEL_PRESETS[0].hex);
    expect(autoTableColour(n + 2)).toBe(PASTEL_PRESETS[2].hex);
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("tableTint", () => {
  it("gives every pastel a readable accent of its own hue", () => {
    for (const p of PASTEL_PRESETS) {
      const t = tableTint(p.hex);
      expect(t.bg).toBe(p.hex);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(t.accent).not.toBe("#000000");
    }
  });

  it("keeps the heading readable on any custom fill, light or dark", () => {
    for (const fill of ["#ffffff", "#ffff00", "#00ff00", "#2c6e49", "#1d2733", "#000000", "#c0392b", "#808080"]) {
      const t = tableTint(fill);
      expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to the first pastel for an unreadable value", () => {
    expect(tableTint("not a colour").bg).toBe(PASTEL_PRESETS[0].hex);
  });
});
