import { describe, expect, it } from "vitest";
import { BC, BEHAVIOUR_COLOURS, snapBehaviourColour } from "./behaviourColours";
import { contrastRatio } from "./tableColours";
import { DEFAULT_BEHAVIOURS } from "./types";

describe("behaviour colours", () => {
  it("are all deep enough for white text", () => {
    for (const c of BEHAVIOUR_COLOURS) expect(contrastRatio(c.hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("are distinct, and the defaults only use them", () => {
    const hexes = BEHAVIOUR_COLOURS.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const b of DEFAULT_BEHAVIOURS) expect(hexes).toContain(b.color);
  });

  it("leaves palette colours alone", () => {
    for (const c of BEHAVIOUR_COLOURS) expect(snapBehaviourColour(c.hex)).toBe(c.hex);
  });

  it("carries the old default colours to the matching family", () => {
    expect(snapBehaviourColour("#2e9e5b")).toBe(BC.green); // old Great effort
    expect(snapBehaviourColour("#3b82d6")).toBe(BC.blue); // old Great answer
    expect([BC.indigo, BC.purple]).toContain(snapBehaviourColour("#7c5cd6")); // old Homework done well (a blue-violet)
    expect(snapBehaviourColour("#e0a63a")).toBe(BC.amber); // old Talking (the pale amber)
    expect(snapBehaviourColour("#e06c3a")).toBe(BC.orange); // old Disruptive
    expect(snapBehaviourColour("#d65c5c")).toBe(BC.red); // old Missing homework
    expect(snapBehaviourColour("#b85c8a")).toBe(BC.pink); // old Late to lesson
  });

  it("sends greys and anything unreadable to Slate", () => {
    expect(snapBehaviourColour("#888888")).toBe(BC.slate);
    expect(snapBehaviourColour("#ffffff")).toBe(BC.slate);
    expect(snapBehaviourColour("")).toBe(BC.slate);
    expect(snapBehaviourColour("tomato")).toBe(BC.slate);
  });
});
