import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, parseThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice } from "./theme";

describe("theme choice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is Light unless Dark or Match Windows was saved", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice(null)).toBe("light");
    expect(parseThemeChoice("purple")).toBe("light");
  });

  it("Match Windows follows Windows; the others ignore it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("is saved on this computer and read back", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    saveThemeChoice("dark");
    expect(store.get(THEME_KEY)).toBe("dark");
    expect(readThemeChoice()).toBe("dark");
  });

  it("falls back to Light where storage can't be used", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readThemeChoice()).toBe("light");
    expect(() => saveThemeChoice("dark")).not.toThrow();
  });
});
