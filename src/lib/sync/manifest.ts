// Per-device sync state: which Drive file each local file maps to, and what
// content the two sides last agreed on.
//
// It lives in the app config directory rather than the data folder for two
// reasons: it is specific to this machine, and the data folder is meant to stay
// plain .csv/.md that a teacher can open in Excel — and is often itself inside
// a OneDrive/Drive-for-Desktop folder, where a synced manifest would describe
// the wrong device.

import { AppFS } from "../fs";
import { SyncManifest } from "./types";

const MANIFEST_FILE = "drive-sync.json";
export const DEFAULT_FOLDER_NAME = "ClassKernel";

export function emptyManifest(folderName = DEFAULT_FOLDER_NAME): SyncManifest {
  return {
    version: 1,
    rootFolderId: null,
    folderName,
    account: null,
    dataDir: null,
    files: {},
    lastSync: null,
  };
}

export async function loadManifest(fs: AppFS): Promise<SyncManifest> {
  const path = await fs.configPath(MANIFEST_FILE);
  if (!(await fs.exists(path))) return emptyManifest();
  try {
    const parsed = JSON.parse(await fs.readText(path)) as Partial<SyncManifest>;
    if (parsed.version !== 1) return emptyManifest();
    return { ...emptyManifest(parsed.folderName ?? DEFAULT_FOLDER_NAME), ...parsed, version: 1 };
  } catch {
    // A corrupt manifest must not wedge the app. Starting from empty is safe:
    // with no baselines every file simply looks new, and the first sync
    // reconciles by content rather than deleting anything.
    console.warn("Sync state was unreadable; starting a fresh one.");
    return emptyManifest();
  }
}

export async function saveManifest(fs: AppFS, manifest: SyncManifest): Promise<void> {
  const path = await fs.configPath(MANIFEST_FILE);
  await fs.writeAtomic(path, JSON.stringify(manifest, null, 2));
}

/**
 * Baselines describe one data folder. If the teacher points the app at a
 * different folder, keep the Drive connection but drop the baselines so the
 * next sync compares by content instead of trusting stale hashes.
 */
export function rebaseForDataDir(manifest: SyncManifest, dataDir: string): SyncManifest {
  if (manifest.dataDir === dataDir) return manifest;
  return { ...manifest, dataDir, files: {} };
}
