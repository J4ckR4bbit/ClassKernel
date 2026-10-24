import { create } from "zustand";
import { Theme, ThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice, systemDarkQuery } from "../lib/theme";
import { isTauri } from "../lib/fs";

interface ThemeState {
  choice: ThemeChoice;
  /** What is showing now: the choice, with Match Windows worked out. */
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}

const query = systemDarkQuery();
const initial = readThemeChoice();

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

/** Colour the page (and, in the desktop app, the window's title bar). */
function apply(choice: ThemeChoice, theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (isTauri()) {
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(choice === "system" ? null : theme))
      .catch(() => {
        // An older build without the permission keeps a light title bar; the page is still right.
      });
  }
}

/** Called once, before the first render. Follows Windows while Match Windows is chosen. */
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
}
