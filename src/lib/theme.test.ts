import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PAGE_BACKGROUND, THEME_KEY, parseThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice } from "./theme";

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

describe("the desktop window's background", () => {
  it("is the page's own background in each theme, so the window and the page match", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const surface = (from: number) => /--md-surface-container: (#[0-9a-f]{6});/.exec(css.slice(from))?.[1];
    expect(surface(0)).toBe(PAGE_BACKGROUND.light);
    expect(surface(css.indexOf(':root[data-theme="dark"]'))).toBe(PAGE_BACKGROUND.dark);
    expect(css).toMatch(/body \{ background: var\(--md-surface-container\); \}/);
  });
});
