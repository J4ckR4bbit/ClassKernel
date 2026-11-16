import { describe, expect, it } from "vitest";
import { formatTick, niceScale, tickValues } from "./scale";

describe("axis scales", () => {
  it("picks round steps of 1, 2 or 5", () => {
    expect(niceScale(0, 9.3, true).step).toBe(2);
    expect(niceScale(0, 0.47, true).step).toBe(0.1);
    expect(niceScale(0, 3100, true).step).toBe(500);
  });

  it("keeps every reading inside the axis", () => {
    const scale = niceScale(1.2, 8.7, false);
    expect(scale.min).toBeLessThanOrEqual(1.2);
    expect(scale.max).toBeGreaterThanOrEqual(8.7);
  });

  it("includes zero when asked, so proportionality can be read off", () => {
    expect(niceScale(4, 9, true).min).toBe(0);
    expect(niceScale(4, 9, false).min).toBeGreaterThan(0);
  });

  it("gives a flat run of readings something to sit in", () => {
    const scale = niceScale(5, 5, false);
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it("lists tick values without floating-point dust", () => {
    expect(tickValues({ min: 0, max: 0.5, step: 0.1 })).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("labels ticks with just enough decimals for the step", () => {
    expect(formatTick(2, 1)).toBe("2");
    expect(formatTick(0.2, 0.1)).toBe("0,2");
    expect(formatTick(0.25, 0.05)).toBe("0,25");
  });
});
