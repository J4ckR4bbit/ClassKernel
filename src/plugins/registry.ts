// The plugin catalogue.
//
// A plugin is an extra teaching tool that ships inside the app but stays out of
// the way until a teacher switches it on in Settings → Plugins. Every plugin is
// a single self-contained HTML page (no network, no imports) which the app runs
// in a sandboxed frame; the only way out of that frame is the small save bridge
// described in README.md.
//
// Adding one is three lines at the bottom of this file — see README.md.

export interface PluginManifest {
  /**
   * Stable identifier. It is written into settings.csv, so renaming one turns
   * the plugin off for everyone who had it on.
   */
  id: string;
  name: string;
  /** One line, shown on the Home card. */
  tagline: string;
  /** A sentence or two for the Settings list: what it does and what it saves. */
  description: string;
  /** Emoji shown on the Home card and in Settings. */
  icon: string;
  /**
   * Loads the plugin's HTML document. A dynamic import keeps each plugin in its
   * own chunk, so switching them on costs nothing until one is opened.
   */
  load: () => Promise<string>;
}

export const PLUGINS: PluginManifest[] = [
  {
    id: "graph-paper",
    name: "Graph paper generator",
    tagline: "Build printable axes and grids at an exact mm size.",
    description:
      "Generates graph paper and axes to your own dimensions — block size in mm, minor squares, line weights, arrows, tick marks and colours — with a live preview. Saves a 300 dpi PNG that drops into Word or a worksheet at exactly the size shown.",
    icon: "📐",
    load: () => import("./graph-paper/graph-paper.html?raw").then((m) => m.default),
  },
];

export function pluginById(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id);
}

/**
 * The plugins a teacher has switched on, in catalogue order. Ids left over from
 * a plugin that no longer ships are ignored here rather than deleted from
 * settings.csv, so downgrading the app doesn't quietly lose the choice.
 */
export function enabledPlugins(enabledIds: string[]): PluginManifest[] {
  return PLUGINS.filter((p) => enabledIds.includes(p.id));
}

/** Toggle one id, returning the new list to store in UserPrefs. */
export function togglePluginId(enabledIds: string[], id: string): string[] {
  return enabledIds.includes(id) ? enabledIds.filter((e) => e !== id) : [...enabledIds, id];
}
