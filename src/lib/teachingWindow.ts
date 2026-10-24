// Window handling for the two teaching modes. The room plan takes the whole
// screen; the strip shrinks the app to a narrow always-on-top column on one
// edge so slides / annotation software keep the rest. Everything here is
// best-effort: a failure (browser demo, missing permission) just leaves the
// window as it was, and the in-app layout change still applies.

import { isTauri } from "./fs";
import { DockSide } from "./types";

/**
 * Strip width in logical pixels: a fifth-ish of the screen, within limits,
 * grown with the app's display size (Settings → General → Display zooms the whole
 * page, so the strip needs the room to match), but never over 30% of the screen.
 */
export function stripWidth(screenLogicalWidth: number, uiScale = 1): number {
  const base = Math.min(340, Math.max(240, screenLogicalWidth * 0.18));
  return Math.round(Math.min(base * Math.max(1, uiScale), screenLogicalWidth * 0.3));
}

interface SavedGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized: boolean;
}

// Where the window was before docking, so leaving the strip puts it back.
let saved: SavedGeometry | null = null;

async function tauriWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function enterFullscreen(): Promise<void> {
  // Switching over from the strip: undock first so fullscreen starts clean.
  if (saved) await restoreWindow();
  try {
    if (isTauri()) {
      await (await tauriWindow()).setFullscreen(true);
    } else if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Best-effort; the layout change alone is still useful.
  }
}

export async function enterDock(side: DockSide, uiScale = 1): Promise<void> {
  try {
    if (!isTauri()) {
      // The browser can't move its own window: the strip is drawn as a column
      // inside the page instead, so just make sure we aren't fullscreen.
      if (document.fullscreenElement) await document.exitFullscreen();
      return;
    }
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
    const win = await tauriWindow();
    if (!saved) {
      const [pos, size, maximized] = await Promise.all([win.outerPosition(), win.outerSize(), win.isMaximized()]);
      saved = { x: pos.x, y: pos.y, w: size.width, h: size.height, maximized };
    }
    await win.setFullscreen(false);
    if (await win.isMaximized()) await win.unmaximize();
    const monitor = await currentMonitor();
    if (!monitor) return;
    const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
    const width = Math.round(stripWidth(area.size.width / monitor.scaleFactor, uiScale) * monitor.scaleFactor);
    const x = side === "left" ? area.position.x : area.position.x + area.size.width - width;
    await win.setDecorations(false);
    await win.setSize(new PhysicalSize(width, area.size.height));
    await win.setPosition(new PhysicalPosition(x, area.position.y));
    await win.setAlwaysOnTop(true);
  } catch {
    // Best-effort, as above.
  }
}

/** Leave either teaching mode: back to a normal, decorated window where it was. */
export async function restoreWindow(): Promise<void> {
  try {
    if (!isTauri()) {
      if (document.fullscreenElement) await document.exitFullscreen();
      return;
    }
    const win = await tauriWindow();
    await win.setFullscreen(false);
    if (saved) {
      const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");
      const g = saved;
      saved = null;
      await win.setAlwaysOnTop(false);
      await win.setDecorations(true);
      await win.setSize(new PhysicalSize(g.w, g.h));
      await win.setPosition(new PhysicalPosition(g.x, g.y));
      if (g.maximized) await win.maximize();
    }
  } catch {
    // Best-effort, as above.
  }
}
