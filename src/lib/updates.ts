// Updating the desktop app from its GitHub releases.
//
// This is the only thing in ClassKernel that uses the internet, and only when
// the teacher asks: the "Check for updates" button, or (if switched on, on
// this computer) one check as the app starts. Nothing is sent but the request
// for the release list. The download is checked against the app's own public
// key (tauri.conf.json) before it is installed, so only an installer built by
// this project's release workflow is accepted.

import { isTauri } from "./fs";

const AT_LAUNCH_KEY = "classkernel.updates.atLaunch";

/** Whether to check as the app starts. Off unless switched on, on this computer. */
export function readCheckAtLaunch(): boolean {
  try {
    return localStorage.getItem(AT_LAUNCH_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveCheckAtLaunch(on: boolean): void {
  try {
    if (on) localStorage.setItem(AT_LAUNCH_KEY, "1");
    else localStorage.removeItem(AT_LAUNCH_KEY);
  } catch {
    // Not remembered; the button still works.
  }
}

export interface FoundUpdate {
  version: string;
  /** The release's notes; may be empty. */
  notes: string;
  /**
   * Fetch the installer and check its signature. The app carries on as usual
   * meanwhile. `onProgress` gets the share downloaded (0–1), or null while
   * the size isn't known.
   */
  download(onProgress: (share: number | null) => void): Promise<void>;
  /**
   * Run the downloaded installer. On Windows this ends the app at once (the
   * installer closes it, installs and opens the new version), so everything
   * that must be on disk has to be there before this is called.
   */
  install(): Promise<void>;
  /** Let go of it without installing (it holds a little memory on the Rust side until then). */
  dismiss(): void;
}

/** The share of a download that has arrived, or null when its size is unknown. */
export function downloadShare(received: number, total: number | undefined): number | null {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(1, received / total));
}

/** A sentence for the teacher when a check or an install fails. */
export function explainUpdateError(e: unknown): string {
  const detail = String(e instanceof Error ? e.message : e).trim();
  if (/release JSON|404|not found/i.test(detail)) return "No update has been published yet.";
  if (/network|dns|connect|timed? ?out|sending request|offline/i.test(detail)) {
    return "Couldn't reach the update server. Check this computer's internet connection and try again.";
  }
  if (/signature|verify|pubkey|public key/i.test(detail)) {
    return "The download didn't pass its safety check, so it wasn't installed.";
  }
  return `Couldn't update: ${detail || "unknown error"}`;
}

/** The running app's version, or "" outside the desktop app. */
export async function appVersion(): Promise<string> {
  if (!isTauri()) return "";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Ask GitHub whether a newer release exists. Null when this is the latest (or outside the desktop app). */
export async function checkForUpdate(): Promise<FoundUpdate | null> {
  if (!isTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: 20_000 });
  if (!update) return null;
  return {
    version: update.version,
    notes: (update.body ?? "").trim(),
    async download(onProgress) {
      let received = 0;
      let total: number | undefined;
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength;
          onProgress(downloadShare(0, total));
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          onProgress(downloadShare(received, total));
        } else {
          onProgress(1);
        }
      });
    },
    install: () => update.install(),
    dismiss: () => void update.close().catch(() => {}),
  };
}
