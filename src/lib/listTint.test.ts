import { describe, expect, it } from "vitest";
import { positionTint } from "./listTint";

const hue = (css: string) => Number(/hsl\((\d+)/.exec(css)?.[1]);

describe("positionTint", () => {
  it("runs blue, green, yellow, orange, red from the first row to the last", () => {
    expect(hue(positionTint(0, 25))).toBe(215);
    expect(hue(positionTint(6, 25))).toBe(130);
    expect(hue(positionTint(12, 25))).toBe(52);
    expect(hue(positionTint(18, 25))).toBe(30);
    expect(hue(positionTint(24, 25))).toBe(4);
  });

  it("moves steadily between the stops", () => {
    const hues = Array.from({ length: 30 }, (_, i) => hue(positionTint(i, 30)));
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeLessThanOrEqual(hues[i - 1]);
  });

  it("is very light", () => {
    expect(positionTint(3, 10)).toMatch(/ 92%\)$/);
  });

  it("gives a single row (or none) the first colour, and clamps out-of-range rows", () => {
    expect(hue(positionTint(0, 1))).toBe(215);
    expect(hue(positionTint(0, 0))).toBe(215);
    expect(hue(positionTint(40, 10))).toBe(4);
  });
});
