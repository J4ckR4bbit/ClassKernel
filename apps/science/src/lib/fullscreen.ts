// Show to class: the tool fills the whole screen, for the board. Best-effort;
// a browser that refuses leaves the page as it was, and the tool's own
// class-view layout still applies.

export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    // Not allowed here (an embedded page, say): the layout change alone still helps.
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already out, or never in.
  }
}
