// Light, Dark, or whatever Windows uses. Saved on this computer only (the
// classroom board and a laptop can differ), and read before anything is drawn,
// so the app never flashes white on its way to dark — not even while it waits
// for the data folder.

export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "classkernel.theme";

/** A stored value as a choice: anything unknown (or nothing) is Light, the default. */
export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return value === "dark" || value === "system" ? value : "light";
}

/** The theme a choice comes to, given whether Windows is set to dark. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === "system" ? (systemDark ? "dark" : "light") : choice;
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Not remembered; still applies until the app closes.
  }
}

/** The colour scheme: ClassKernel's green, or St Benedict's College navy and gold. Saved on this computer too. */
export type Palette = "green" | "navy";

export const PALETTE_KEY = "classkernel.palette";

/** A stored value as a scheme: anything unknown (or nothing) is green, the default. */
export function parsePalette(value: string | null | undefined): Palette {
  return value === "navy" ? "navy" : "green";
}

export function readPalette(): Palette {
  try {
    return parsePalette(localStorage.getItem(PALETTE_KEY));
  } catch {
    return "green";
  }
}

export function savePalette(palette: Palette): void {
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    // Not remembered; still applies until the app closes.
  }
}

/**
 * The page's background in each scheme and theme (--md-surface-container in
 * styles.css). The desktop window is painted this colour too, so the moment
 * before the page draws matches it instead of flashing white.
 */
export const PAGE_BACKGROUND: Record<Palette, Record<Theme, string>> = {
  green: { light: "#eaefe8", dark: "#1c211d" },
  navy: { light: "#ededf2", dark: "#1e2023" },
};

/** The "dark mode" media query, where the window has one. */
export function systemDarkQuery(): MediaQueryList | null {
  try {
    return typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  } catch {
    return null;
  }
}
