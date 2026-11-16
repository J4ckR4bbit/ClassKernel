import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, pinMatches } from "./pin";

describe("reseat PIN", () => {
  it("accepts 4–6 digits only", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("hashes deterministically and never stores the PIN itself", async () => {
    const h = await hashPin("2468");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("2468");
    expect(await hashPin("2468")).toBe(h);
    expect(await hashPin("2469")).not.toBe(h);
  });

  it("matches only the right PIN, and nothing when no PIN is set", async () => {
    const h = await hashPin("2468");
    expect(await pinMatches("2468", h)).toBe(true);
    expect(await pinMatches(" 2468 ", h)).toBe(true);
    expect(await pinMatches("1111", h)).toBe(false);
    expect(await pinMatches("2468", "")).toBe(false);
  });
});
