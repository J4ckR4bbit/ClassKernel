import { create } from "zustand";
import { Theme, ThemeChoice, readPalette, readThemeChoice, resolveTheme, saveThemeChoice, systemDarkQuery } from "@classkernel/ui/theme";

// Light, Dark or Match this device, remembered by this browser. The website
// always wears ClassKernel's green; the navy scheme is a desktop-app choice.

interface ThemeState {
  choice: ThemeChoice;
  theme: Theme;
  setChoice: (choice: ThemeChoice) => void;
}

const query = systemDarkQuery();
const initial = readThemeChoice();

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = readPalette();
}

export const useTheme = create<ThemeState>((set) => ({
  choice: initial,
  theme: resolveTheme(initial, !!query?.matches),
  setChoice: (choice) => {
    saveThemeChoice(choice);
    const theme = resolveTheme(choice, !!query?.matches);
    set({ choice, theme });
    apply(theme);
  },
}));

/** Called once, before the first render. Follows the device while Match this device is chosen. */
export function initTheme(): void {
  apply(useTheme.getState().theme);
  query?.addEventListener("change", (e) => {
    const { choice } = useTheme.getState();
    if (choice !== "system") return;
    const theme = resolveTheme(choice, e.matches);
    useTheme.setState({ theme });
    apply(theme);
  });
}
