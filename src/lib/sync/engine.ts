// The sync engine: reconcile the local data folder with its Google Drive
// mirror, in both directions.
//
// The local folder stays the source of truth for the running app — every read
// and write in the rest of ClassKernel still goes straight to disk, so the app
// remains instant and works with no network. This engine runs alongside that,
// pushing what changed and pulling what other devices changed.
//
// Decisions are three-way: local content, remote content, and the baseline both
// sides agreed on at the last sync (the manifest). That third term is what
// distinguishes "I changed this" from "they changed this" — without it every
// difference would look like a conflict.

import { AppFS, FileStat } from "../fs";
import { unionCsv } from "./merge";
import {
  META_FILE,
  conflictCopyPath,
  isIgnoredDir,
  isIgnoredFile,
  metaContents,
  policyFor,
} from "./policy";
import { DriveClient, DriveFileMeta, SyncManifest, SyncResult, emptyResult } from "./types";

export interface SyncOptions {
  fs: AppFS;
  drive: DriveClient;
  dataDir: string;
  rootId: string;
  manifest: SyncManifest;
  /** Stamp used to name conflict copies, e.g. 2026-07-25_143000. */
  stamp: string;
  /**
   * Paths whose *local* file must not be touched this pass — used to hold back
   * changes to a class while its lesson is live. Pushes still go ahead.
   */
  holdLocal?: (relPath: string) => boolean;
}

export interface SyncOutcome {
  result: SyncResult;
  manifest: SyncManifest;
}

const join = (...parts: string[]) => parts.filter((p) => p !== "").join("/");

/** Every syncable file under the data folder, keyed by path relative to it. */
export async function listLocalFiles(fs: AppFS, dataDir: string): Promise<Map<string, FileStat>> {
  const out = new Map<string, FileStat>();
  const walk = async (relDir: string): Promise<void> => {
    const abs = join(dataDir, relDir);
    let entries;
    try {
      entries = await fs.listDir(abs);
    } catch {
      return; // Folder vanished mid-walk, or never existed.
    }
    for (const entry of entries) {
      const rel = join(relDir, entry.name);
      if (entry.isDir) {
        if (isIgnoredDir(entry.name)) continue;
        await walk(rel);
      } else {
        if (isIgnoredFile(entry.name)) continue;
        try {
          out.set(rel, await fs.stat(join(dataDir, rel)));
        } catch {
          // Unreadable (locked by Excel, say) — skip it and try next time
          // rather than failing the whole sync.
        }
      }
    }
  };
  await walk("");
  return out;
}

function parentDir(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? "" : relPath.slice(0, i);
}

function fileName(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? relPath : relPath.slice(i + 1);
}

export async function syncOnce(opts: SyncOptions): Promise<SyncOutcome> {
  const { fs, drive, dataDir, rootId, stamp } = opts;
  const result = emptyResult();
  const files: SyncManifest["files"] = { ...opts.manifest.files };
  const hold = opts.holdLocal ?? (() => false);

  const local = await listLocalFiles(fs, dataDir);

  const remoteAll = await drive.listTree(rootId);
  const remoteFiles = new Map<string, DriveFileMeta>();
  const remoteFolders = new Map<string, DriveFileMeta>();
  for (const meta of remoteAll) {
    if (meta.trashed || !meta.relPath) continue;
    if (meta.isFolder) remoteFolders.set(meta.relPath, meta);
    else if (!isIgnoredFile(fileName(meta.relPath))) remoteFiles.set(meta.relPath, meta);
  }

  // Create the Drive folders a path needs, deepest last, reusing what is there.
  const ensureFolder = async (relDir: string): Promise<string> => {
    if (relDir === "") return rootId;
    const known = remoteFolders.get(relDir);
    if (known) return known.id;
    const parentId = await ensureFolder(parentDir(relDir));
    const created = await drive.createFolder(fileName(relDir), parentId, relDir, rootId);
    remoteFolders.set(relDir, created);
    return created.id;
  };

  const push = async (relPath: string, content: string, existingId?: string) => {
    const parentId = await ensureFolder(parentDir(relPath));
    const saved = await drive.upload({
      fileId: existingId,
      name: fileName(relPath),
      parentId,
      relPath,
      rootId,
      content,
    });
    // Prefer Drive's own checksum as the new baseline: it is exactly what the
    // next listing will report, so the pair agree without a re-read.
    const hash = saved.md5 ?? (await fs.stat(join(dataDir, relPath))).hash;
    files[relPath] = {
      driveId: saved.id,
      syncedHash: hash,
      syncedDriveModified: saved.modifiedTime,
    };
  };

  const pull = async (relPath: string, meta: DriveFileMeta) => {
    const content = await drive.download(meta.id);
    await fs.writeAtomic(join(dataDir, relPath), content);
    const hash = meta.md5 ?? (await fs.stat(join(dataDir, relPath))).hash;
    files[relPath] = {
      driveId: meta.id,
      syncedHash: hash,
      syncedDriveModified: meta.modifiedTime,
    };
  };

  const paths = new Set<string>([...local.keys(), ...remoteFiles.keys(), ...Object.keys(files)]);

  for (const relPath of [...paths].sort()) {
    const l = local.get(relPath);
    const r = remoteFiles.get(relPath);
    const base = files[relPath];

    try {
      if (!l && !r) {
        // Gone from both sides; the baseline is just stale bookkeeping.
        delete files[relPath];
        continue;
      }

      if (l && r) {
        const same = l.hash === r.md5;
        if (same) {
          files[relPath] = {
            driveId: r.id,
            syncedHash: l.hash,
            syncedDriveModified: r.modifiedTime,
          };
          continue;
        }
        const localChanged = !base || l.hash !== base.syncedHash;
        const remoteChanged = !base || (r.md5 ?? "") !== base.syncedHash;

        if (localChanged && !remoteChanged) {
          await push(relPath, await fs.readText(join(dataDir, relPath)), r.id);
          result.pushed.push(relPath);
          continue;
        }
        if (!localChanged && remoteChanged) {
          if (hold(relPath)) {
            result.deferred.push(relPath);
            continue;
          }
          await pull(relPath, r);
          result.pulled.push(relPath);
          continue;
        }

        // Both sides moved (or there is no baseline and they disagree).
        if (hold(relPath)) {
          result.deferred.push(relPath);
          continue;
        }
        const localText = await fs.readText(join(dataDir, relPath));
        const remoteText = await drive.download(r.id);
        const remoteNewer = Date.parse(r.modifiedTime) > l.modifiedMs;
        const policy = policyFor(relPath);

        if (policy.kind === "union") {
          const merged = unionCsv(localText, remoteText, policy.key, remoteNewer);
          await fs.writeAtomic(join(dataDir, relPath), merged);
          await push(relPath, merged, r.id);
          result.merged.push(relPath);
        } else {
          const winner = remoteNewer ? remoteText : localText;
          const loser = remoteNewer ? localText : remoteText;
          const copy = conflictCopyPath(relPath, stamp);
          // Keep the losing version next to the file so nothing is destroyed;
          // conflict copies are excluded from sync so they stay put.
          await fs.writeAtomic(join(dataDir, copy), loser);
          if (remoteNewer) {
            await fs.writeAtomic(join(dataDir, relPath), winner);
            files[relPath] = {
              driveId: r.id,
              syncedHash: r.md5 ?? (await fs.stat(join(dataDir, relPath))).hash,
              syncedDriveModified: r.modifiedTime,
            };
          } else {
            await push(relPath, winner, r.id);
          }
          result.conflicted.push({ path: relPath, copy });
        }
        continue;
      }

      if (l && !r) {
        if (base) {
          // It was synced before and is no longer in Drive: another device
          // deleted it.
          if (l.hash === base.syncedHash) {
            if (hold(relPath)) {
              result.deferred.push(relPath);
              continue;
            }
            await fs.remove(join(dataDir, relPath));
            delete files[relPath];
            result.deletedLocal.push(relPath);
            continue;
          }
          // Deleted there, but edited here since — the edit wins and the file
          // comes back. Losing work is worse than an unexpected reappearance.
        }
        await push(relPath, await fs.readText(join(dataDir, relPath)));
        result.pushed.push(relPath);
        continue;
      }

      if (!l && r) {
        if (base) {
          // Deleted here since the last sync. Renaming a class is exactly this
          // (the whole folder moves), so without it the old copy would be
          // pulled straight back down and resurrect the class.
          if ((r.md5 ?? "") === base.syncedHash) {
            await drive.trash(r.id);
            delete files[relPath];
            result.deletedRemote.push(relPath);
            continue;
          }
          // Deleted here but edited there — restore rather than discard.
        }
        if (hold(relPath)) {
          result.deferred.push(relPath);
          continue;
        }
        await pull(relPath, r);
        result.pulled.push(relPath);
      }
    } catch (e) {
      result.errors.push({ path: relPath, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Renaming a class moves its whole folder, which leaves the old one behind in
  // Drive as an empty shell. Tidy those up — the teacher looks at this folder.
  //
  // "Empty" is judged against everything still known to be live, not just the
  // manifest: a file whose sync errored this pass is still in there, and
  // trashing its folder would take it with it.
  const liveDirs = new Set<string>();
  const noteDirs = (relPath: string) => {
    for (let dir = parentDir(relPath); dir !== ""; dir = parentDir(dir)) liveDirs.add(dir);
  };
  for (const relPath of Object.keys(files)) noteDirs(relPath);
  for (const relPath of local.keys()) noteDirs(relPath);
  const trashed = new Set(result.deletedRemote);
  for (const relPath of remoteFiles.keys()) if (!trashed.has(relPath)) noteDirs(relPath);

  for (const [relDir, folder] of remoteFolders) {
    if (liveDirs.has(relDir)) continue;
    try {
      await drive.trash(folder.id);
    } catch {
      // Cosmetic only — an empty folder left behind is harmless, and the next
      // pass will try again.
    }
  }

  // A marker in the Drive root so the future Android app can recognise the
  // folder and its schema version. Remote-only, so it never appears on disk.
  try {
    if (!remoteAll.some((m) => !m.trashed && m.relPath === META_FILE)) {
      await drive.upload({
        name: META_FILE,
        parentId: rootId,
        relPath: META_FILE,
        rootId,
        content: metaContents(opts.manifest.folderName),
      });
    }
  } catch (e) {
    result.errors.push({ path: META_FILE, message: e instanceof Error ? e.message : String(e) });
  }

  return {
    result,
    manifest: {
      ...opts.manifest,
      rootFolderId: rootId,
      dataDir,
      files,
      lastSync: new Date().toISOString(),
    },
  };
}
