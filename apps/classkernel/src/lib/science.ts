// ClassKernel Science: the science teaching tools (chemistry reference,
// titration, galvanic cell, the graph tools), apps/science. In the desktop app
// it opens in a window of its own (src-tauri/src/windows_app.rs); it's also a
// website, for computers without ClassKernel, which the browser demo opens.
// ClassKernel opens it from Home and Settings → Tools.

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

/** Whether Science opens in a window of its own (the desktop app) rather than the browser. */
export function scienceInOwnWindow(): boolean {
  return isTauri();
}

/**
 * Open ClassKernel Science: its own window in the desktop app (or bring it
 * forward), the website in a new tab in the browser demo.
 */
export function openScience(): void {
  if (scienceInOwnWindow()) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("open_science_window"))
      .catch((e) => console.error("Couldn't open ClassKernel Science", e));
  } else {
    window.open(scienceUrl(), "_blank", "noopener,noreferrer");
  }
}
