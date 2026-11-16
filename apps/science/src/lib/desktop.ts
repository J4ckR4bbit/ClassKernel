// Whether ClassKernel Science is running in its own window in the ClassKernel
// desktop app (apps/classkernel/src-tauri/src/windows_app.rs) rather than in a
// browser. The same pages serve both; in the app a few things use the window
// instead of the browser: the save-as dialog, filling the screen, the title
// bar's colours. Each of them falls back to the browser's way if the app
// refuses, so a tool never stops working over it.

export function inDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The app's own window, or null in a browser. */
export async function appWindow() {
  if (!inDesktopApp()) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}
