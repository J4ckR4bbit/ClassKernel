// Saving what a tool made (a 300 dpi PNG): on the website that's a download to
// this device. Nothing is uploaded anywhere.

import { downloadBytes } from "@classkernel/ui/download";

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

/** Download a generated file. Never throws: the outcome comes back as a message the tool can show. */
export async function saveFile(file: GeneratedFile): Promise<SaveOutcome> {
  try {
    downloadBytes(file.name, file.bytes);
    return { ok: true, message: `Downloaded ${file.name}` };
  } catch (e) {
    console.error("Save failed", e);
    return { ok: false, message: `Could not save the file: ${e}` };
  }
}
