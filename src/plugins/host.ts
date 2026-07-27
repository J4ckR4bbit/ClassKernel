// The bit of the app a plugin is allowed to reach for: saving what it made.
//
// Plugins are compiled into the app, so they use the same audited Rust file
// commands as everything else — a native "save as" dialog on the desktop, and a
// plain download in the browser demo where there is no backend.

import { getFS, isTauri } from "../lib/fs";

export interface GeneratedFile {
  /** Suggested file name, e.g. "graph_paper_10x8.png". */
  name: string;
  /** Extension for the dialog's file filter, without the dot. */
  extension: string;
  /** Human name for that filter, e.g. "PNG image". */
  label: string;
  bytes: Uint8Array;
}

export interface SaveOutcome {
  ok: boolean;
  /** Short line to show next to the button. */
  message: string;
}

/** Hand the file to the browser as a download (demo mode — no desktop backend). */
function downloadInBrowser(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes]));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Ask the teacher where to put a generated file and write it there. Never
 * throws: the outcome comes back as a message the plugin can show.
 */
export async function savePluginFile(file: GeneratedFile): Promise<SaveOutcome> {
  try {
    if (!isTauri()) {
      downloadInBrowser(file.name, file.bytes);
      return { ok: true, message: `Downloaded ${file.name}` };
    }
    const path = await getFS().pickSaveFile(file.name, file.extension, file.label);
    if (!path) return { ok: false, message: "Save cancelled" };
    await getFS().writeBinary(path, file.bytes);
    return { ok: true, message: `Saved to ${path}` };
  } catch (e) {
    console.error("Plugin save failed", e);
    return { ok: false, message: `Could not save the file: ${e}` };
  }
}
