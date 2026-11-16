import { describe, expect, it } from "vitest";
import { stripWidth } from "./teachingWindow";

describe("stripWidth", () => {
  it("is about a fifth of the screen, within 240–340 px", () => {
    expect(stripWidth(1280)).toBe(240);
    expect(stripWidth(1600)).toBe(288);
    expect(stripWidth(2560)).toBe(340);
  });

  it("grows with the display size, but never past 30% of the screen", () => {
    expect(stripWidth(1920, 1.5)).toBe(510);
    expect(stripWidth(1280, 1.5)).toBe(360);
    expect(stripWidth(1280, 2)).toBe(384);
  });
});
