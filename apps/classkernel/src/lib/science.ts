// ClassKernel Science: the science teaching tools (chemistry reference,
// titration, galvanic cell, the graph tools) as a website of their own
// (apps/science). ClassKernel links to it from Home and Settings → Tools.

import { isTauri } from "./fs";

/** Where the website is published (GitHub Pages, from .github/workflows/science-site.yml). */
export const SCIENCE_SITE_URL = "https://j4ckr4bbit.github.io/ClassKernel/";

/**
 * The tools that moved to the website, by the ids they had here. A teacher's
 * settings.csv may still list them as switched on; they're ignored like any
 * id that no longer ships, and Home says once where they went.
 */
export const MOVED_TO_SCIENCE: Array<{ id: string; name: string }> = [
  { id: "chemistry-reference", name: "Chemistry reference" },
  { id: "titration", name: "Titration simulator" },
  { id: "galvanic-cell", name: "Galvanic cell animator" },
  { id: "practical-graph", name: "Practical graph plotter" },
  { id: "motion-graph", name: "Motion graph builder" },
  { id: "graph-paper", name: "Graph paper generator" },
];

/** The names of the moved tools this teacher had switched on, in the website's order. */
export function movedToolNames(enabledIds: string[]): string[] {
  return MOVED_TO_SCIENCE.filter((t) => enabledIds.includes(t.id)).map((t) => t.name);
}

/** The address of one moved tool on the website (its id is its address there), or the website's list. */
export function scienceUrl(toolId?: string): string {
  return toolId ? `${SCIENCE_SITE_URL}#/${toolId}` : SCIENCE_SITE_URL;
}

export const SCIENCE_NOTICE_KEY = "classkernel.scienceMovedNoticeDismissed";

/** Whether this computer has already put away the "the science tools have moved" note. */
export function scienceNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(SCIENCE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissScienceNotice(): void {
  try {
    localStorage.setItem(SCIENCE_NOTICE_KEY, "1");
  } catch {
    // Not remembered; the note comes back next time, which is harmless.
  }
}

/**
 * Open the website in the computer's browser. In the desktop app, a page that
 * leads out of the app is handed to the browser instead of replacing
 * ClassKernel in its window (src-tauri/src/links.rs); in the browser demo it
 * opens in a new tab.
 */
export function openScienceSite(toolId?: string): void {
  const url = scienceUrl(toolId);
  if (isTauri()) window.location.assign(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
