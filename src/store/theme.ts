import { create } from "zustand";
import { PAGE_BACKGROUND, Theme, ThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice, systemDarkQuery } from "../lib/theme";
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

// The desktop window's own colours, set last; the window is shown only once they are.
let windowPainted: Promise<void> = Promise.resolve();

/** Colour the page (and, in the desktop app, the window's title bar and background). */
function apply(choice: ThemeChoice, theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (isTauri()) windowPainted = paintWindow(choice, theme);
}

// Each step on its own, so one that fails (an older build without its
// permission, say) doesn't stop the other; the page is right either way.
async function paintWindow(choice: ThemeChoice, theme: Theme) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(choice === "system" ? null : theme);
  } catch {
    // The title bar stays as Windows has it.
  }
  try {
    // The window and the web view behind the page: what shows before the page draws.
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().setBackgroundColor(PAGE_BACKGROUND[theme]);
  } catch {
    // Stays white behind the page.
  }
}

/**
 * The desktop window opens hidden (tauri.conf.json) and is shown here, once
 * the first screen is drawn and the window is in the theme's colours, so Dark
 * never starts with a white flash. If this never runs, the app shows the
 * window itself after a few seconds (src-tauri/src/lib.rs).
 */
export async function revealWindow(): Promise<void> {
  if (!isTauri()) return;
  await windowPainted;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().show();
  } catch {
    // The app's own fallback shows it.
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
