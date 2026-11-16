import { afterEach, describe, expect, it, vi } from "vitest";
import { flashTiming } from "./motion";

const askForLessMotion = (reduce: boolean) =>
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) });

describe("flashTiming", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the full animation normally", () => {
    askForLessMotion(false);
    expect(flashTiming(14, 80)).toEqual({ frames: 14, intervalMs: 80 });
  });

  it("flashes at most three names, slowly, when less motion is asked for", () => {
    askForLessMotion(true);
    expect(flashTiming(14, 80)).toEqual({ frames: 3, intervalMs: 300 });
  });

  it("falls back to the full animation where the setting can't be read", () => {
    vi.stubGlobal("window", {});
    expect(flashTiming(12, 90)).toEqual({ frames: 12, intervalMs: 90 });
  });
});
