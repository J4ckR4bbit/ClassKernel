import { create } from "zustand";
import {
  PALETTE_KEY,
  THEME_KEY,
  Theme,
  ThemeChoice,
  readPalette,
  readThemeChoice,
  resolveTheme,
  saveThemeChoice,
  systemDarkQuery,
} from "@classkernel/ui/theme";
import { appWindow } from "./lib/desktop";

// Light, Dark or Match this device, remembered on this computer. In the
// desktop app it's the same setting as ClassKernel's (the two windows share
// their storage), colour scheme included, and a change in either window
// reaches the other; on the website it's this browser's own, in green.

interface ThemeState {
  choice: ThemeChoice;
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}

const query = systemDarkQuery();
const initial = readThemeChoice();

function apply(choice: ThemeChoice, theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = readPalette();
  // The desktop window's title bar follows too.
  void appWindow()
    .then((win) => win?.setTheme(choice === "system" ? null : theme))
    .catch(() => undefined);
}

export const useTheme = create<ThemeState>((set) => ({
  choice: initial,
  theme: resolveTheme(initial, !!query?.matches),
  setChoice: (choice) => {
    saveThemeChoice(choice);
    const theme = resolveTheme(choice, !!query?.matches);
    set({ choice, theme });
    apply(choice, theme);
  },
}));

/** Called once, before the first render. Follows the device while Match this device is chosen. */
export function initTheme(): void {
  const { choice, theme } = useTheme.getState();
  apply(choice, theme);
  query?.addEventListener("change", (e) => {
    const { choice } = useTheme.getState();
    if (choice !== "system") return;
    const theme = resolveTheme(choice, e.matches);
    useTheme.setState({ theme });
    apply(choice, theme);
  });
  // Changed in the other window (ClassKernel's Settings, in the desktop app).
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY && e.key !== PALETTE_KEY) return;
    const choice = readThemeChoice();
    const theme = resolveTheme(choice, !!query?.matches);
    useTheme.setState({ choice, theme });
    apply(choice, theme);
  });
}

/**
 * The desktop window opens hidden and is shown here, once the first screen is
 * drawn in the theme's colours, so Dark never starts with a white flash. If
 * this never runs, the app shows the window itself after a few seconds.
 */
export async function revealWindow(): Promise<void> {
  try {
    await (await appWindow())?.show();
  } catch {
    // The app's own fallback shows it.
  }
}
