// Saving what a tool made (a 300 dpi PNG). In the desktop app: the Windows
// "Save as" dialog, then ClassKernel's own write_binary command (the same one
// its spreadsheet exports use). In a browser: a download to this device.
// Nothing is uploaded anywhere.

import { downloadBytes } from "@classkernel/ui/download";
import { inDesktopApp } from "./desktop";

export interface GeneratedFile {
  /** Suggested file name, e.g. "graph_paper_10x8.png". */
  name: string;
  /** Extension, without the dot. */
  extension: string;
  /** Human name for the file type, e.g. "PNG image". */
  label: string;
  bytes: Uint8Array;
}

export interface SaveOutcome {
  ok: boolean;
  /** Short line to show next to the button. */
  message: string;
}

/** Where the teacher chose to save it, written there; null if they cancelled. */
async function saveInApp(file: GeneratedFile): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: file.name, filters: [{ name: file.label, extensions: [file.extension] }] });
  if (typeof path !== "string") return null;
  const { invoke } = await import("@tauri-apps/api/core");
  // The bridge is JSON, so bytes travel as a plain number array.
  await invoke("write_binary", { path, bytes: Array.from(file.bytes) });
  return path;
}

/** Save a generated file. Never throws: the outcome comes back as a message the tool can show. */
export async function saveFile(file: GeneratedFile): Promise<SaveOutcome> {
  if (inDesktopApp()) {
    try {
      const path = await saveInApp(file);
      return path ? { ok: true, message: `Saved to ${path}` } : { ok: false, message: "Save cancelled" };
    } catch (e) {
      // The app said no (a development build, say): download it instead.
      console.warn("Saving through the app failed; downloading instead", e);
    }
  }
  try {
    downloadBytes(file.name, file.bytes);
    return { ok: true, message: `Downloaded ${file.name}` };
  } catch (e) {
    console.error("Save failed", e);
    return { ok: false, message: `Could not save the file: ${e}` };
  }
}
