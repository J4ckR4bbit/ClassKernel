// The plugin catalogue.
//
// A plugin is an extra teaching tool that ships inside the app but stays out of
// the way until a teacher switches it on in Settings → Plugins. Each one is an
// ordinary React view, compiled in and lazily loaded, so it looks like the rest
// of the app and reaches the disk through the same audited Rust commands as
// everything else.
//
// Adding one is a few lines at the bottom of this file — see README.md.

import type { ComponentType } from "react";

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
   * Loads the plugin's view. A dynamic import keeps each plugin in its own
   * chunk, so switching them on costs nothing until one is opened.
   */
  load: () => Promise<ComponentType>;
}

export const PLUGINS: PluginManifest[] = [
  {
    id: "graph-paper",
    name: "Graph paper generator",
    tagline: "Build printable axes and grids at an exact mm size.",
    description:
      "Generates graph paper and axes to your own dimensions — block size in mm, minor squares, line weights, arrows, tick marks and colours — with a live preview. Saves a 300 dpi PNG that drops into Word or a worksheet at exactly the size shown.",
    icon: "📐",
    load: () => import("./graph-paper/GraphPaper").then((m) => m.default),
  },
  {
    id: "practical-graph",
    name: "Practical graph plotter",
    tagline: "Plot readings, fit the line, read off the gradient.",
    description:
      "Type or paste a table of readings and get the plotted graph: crosses for the points, a least-squares line of best fit, and its gradient, y-intercept and R² — with the option to force the line through the origin. Saves a 300 dpi PNG for a practical write-up or a memo.",
    icon: "📈",
    load: () => import("./practical-graph/PracticalGraph").then((m) => m.default),
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
