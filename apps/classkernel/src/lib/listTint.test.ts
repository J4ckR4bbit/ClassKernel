import { describe, expect, it } from "vitest";
import { positionTint, rankTint, rankTints } from "./listTint";

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

  it("takes its lightness from the theme (very light unless the theme says otherwise)", () => {
    expect(positionTint(3, 10)).toMatch(/ var\(--tint-s, 85%\) var\(--tint-l, 92%\)\)$/);
  });

  it("gives a single row (or none) the first colour, and clamps out-of-range rows", () => {
    expect(hue(positionTint(0, 1))).toBe(215);
    expect(hue(positionTint(0, 0))).toBe(215);
    expect(hue(positionTint(40, 10))).toBe(4);
  });
});

describe("rankTint", () => {
  it("runs green for the top rank, through yellow and orange, to red for the lowest", () => {
    expect(hue(rankTint(1, 1, 31))).toBe(130);
    expect(hue(rankTint(11, 1, 31))).toBe(52);
    expect(hue(rankTint(21, 1, 31))).toBe(30);
    expect(hue(rankTint(31, 1, 31))).toBe(4);
  });

  it("moves steadily from the top rank to the lowest, with no blue", () => {
    const hues = Array.from({ length: 25 }, (_, i) => hue(rankTint(i + 1, 1, 25)));
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeLessThanOrEqual(hues[i - 1]);
    expect(Math.max(...hues)).toBe(130);
  });

  it("keeps tied places at the ends green and red", () => {
    expect(hue(rankTint(1.5, 1.5, 9.5))).toBe(130); // two tied for first
    expect(hue(rankTint(9.5, 1.5, 9.5))).toBe(4); // two tied for last
  });

  it("gives everyone the top colour when all share one rank", () => {
    expect(hue(rankTint(1, 1, 1))).toBe(130);
    expect(hue(rankTint(3, 3, 3))).toBe(130);
  });

  it("takes its lightness from the theme, like the position tints", () => {
    expect(rankTint(4, 1, 10)).toMatch(/ var\(--tint-l, 92%\)\)$/);
  });
});

describe("rankTints", () => {
  it("tints each student by rank among those ranked", () => {
    const tints = rankTints(new Map([["a", 2], ["b", 1], ["c", 3]]));
    expect(hue(tints.get("b")!)).toBe(130);
    expect(hue(tints.get("c")!)).toBe(4);
    expect(tints.get("a")).toBe(rankTint(2, 1, 3));
    expect(rankTints(new Map()).size).toBe(0);
  });
});
