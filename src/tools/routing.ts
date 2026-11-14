// The tools website's addresses and what it keeps in the browser, apart from
// the view so they can be tested in Node.

import { TimerPreset } from "../lib/types";

export const PRESETS_KEY = "classkernel.tools.timerPresets";

/** "#/galvanic-cell" (or "#galvanic-cell") → the tool's id, or null for the list or an unknown tool. */
export function toolFromHash(hash: string, tools: Array<{ id: string }>): string | null {
  const id = decodeURIComponent(hash.replace(/^#\/?/, "")).trim();
  return tools.some((t) => t.id === id) ? id : null;
}

/** The address for a tool; empty for the list of tools. */
export function toolHash(id: string | null): string {
  return id ? `#/${id}` : "";
}

/** Saved test-timer presets, or null when there are none or they can't be read. */
export function parsePresets(text: string | null): TimerPreset[] | null {
  if (!text) return null;
  try {
    const list: unknown = JSON.parse(text);
    if (!Array.isArray(list)) return null;
    return list.filter(
      (p): p is TimerPreset =>
        !!p &&
        typeof p.name === "string" &&
        typeof p.readingMinutes === "number" &&
        typeof p.writingMinutes === "number" &&
        typeof p.display === "string" &&
        typeof p.chime === "boolean",
    );
  } catch {
    return null;
  }
}
