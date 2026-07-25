// Orchestration around the sync engine: load the manifest, make sure the Drive
// folder exists, run one pass, save the manifest.
//
// Every call is serialised through one promise chain. Two overlapping passes
// would race on the manifest and could double-upload or resurrect a deletion,
// and a sync pass is cheap when nothing has changed, so queueing is the simple
// correct answer.

import { AppFS } from "../fs";
import { backupStamp } from "../id";
import { syncOnce } from "./engine";
import { DEFAULT_FOLDER_NAME, emptyManifest, loadManifest, rebaseForDataDir, saveManifest } from "./manifest";
import { DriveClient, SyncManifest, SyncResult } from "./types";

export { DEFAULT_FOLDER_NAME };

export interface SyncRunParams {
  fs: AppFS;
  drive: DriveClient;
  dataDir: string;
  folderName: string;
  holdLocal?: (relPath: string) => boolean;
}

export interface SyncRunResult {
  result: SyncResult;
  folderId: string;
}

let chain: Promise<unknown> = Promise.resolve();

export function runSync(params: SyncRunParams): Promise<SyncRunResult> {
  const next = chain.then(
    () => doSync(params),
    () => doSync(params),
  );
  // Keep the chain alive even when a pass fails, or one network blip would
  // wedge every later sync.
  chain = next.catch(() => undefined);
  return next;
}

async function doSync(p: SyncRunParams): Promise<SyncRunResult> {
  let manifest: SyncManifest = rebaseForDataDir(await loadManifest(p.fs), p.dataDir);

  // Pointing at a different Drive folder invalidates every baseline and file id.
  if (manifest.folderName !== p.folderName) {
    manifest = { ...manifest, folderName: p.folderName, rootFolderId: null, files: {} };
  }

  let rootId = manifest.rootFolderId;
  if (!rootId) {
    const root = await p.drive.ensureRoot(p.folderName);
    rootId = root.id;
    manifest = { ...manifest, rootFolderId: rootId };
  }

  const { result, manifest: updated } = await syncOnce({
    fs: p.fs,
    drive: p.drive,
    dataDir: p.dataDir,
    rootId,
    manifest,
    stamp: backupStamp(),
    holdLocal: p.holdLocal,
  });

  await saveManifest(p.fs, updated);
  return { result, folderId: rootId };
}

/** Folder name and last-sync time for the UI, without running a sync. */
export async function readSyncSummary(fs: AppFS): Promise<{ folderName: string; lastSync: string | null }> {
  const manifest = await loadManifest(fs);
  return { folderName: manifest.folderName, lastSync: manifest.lastSync };
}

/**
 * Forget the Drive mapping on disconnect. Local files are untouched — the point
 * of the offline-first design is that they are complete on their own.
 */
export async function clearSyncState(fs: AppFS, folderName: string): Promise<void> {
  await saveManifest(fs, emptyManifest(folderName));
}
