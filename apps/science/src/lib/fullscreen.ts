// Show to class: the tool fills the whole screen, for the board. In the
// desktop app the window itself goes full screen; in a browser, the page.
// Best-effort; a refusal leaves the window as it was, and the tool's own
// class-view layout still applies.

import { appWindow } from "./desktop";

export async function enterFullscreen(): Promise<void> {
  try {
    const win = await appWindow();
    if (win) return await win.setFullscreen(true);
  } catch {
    // Fall through to the page's own full screen.
  }
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    // Not allowed here (an embedded page, say): the layout change alone still helps.
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    const win = await appWindow();
    if (win) await win.setFullscreen(false);
  } catch {
    // Already out, or never in.
  }
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already out, or never in.
  }
}
