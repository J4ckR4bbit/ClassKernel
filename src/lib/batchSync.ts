// Sending changes to the data folder in batches. While the app works in this
// computer's copy (MirrorFS `workIn`), saves never touch Google Drive; this
// copies the changed files across every few minutes and at natural pauses.
//
// It works off the same two folders as working offline (offline.ts):
//   local-copy/    what the app reads and saves
//   offline-base/  what the data folder held, file by file, when last sent
// A file that differs between the two has changed here. Sending it:
//   - the data folder still holds the base version (the usual case): it is
//     written there, and the base follows it;
//   - the data folder changed too (another computer): at a pause it is joined
//     row by row (merge.ts), in both places; between pauses it waits, so the
//     app's data never changes under a teacher mid-lesson;
//   - the data folder no longer has it (a class renamed or removed elsewhere):
//     at a pause it is kept aside in the backups, as when copying back.
// At a pause it also takes in files changed only in the data folder.

import { diskFS, getFS } from "./fs";
import { mergeFile } from "./merge";
import { LocalPaths, SyncReport, changedFiles, noteConflictCopies, recalculateTotals, walk } from "./offline";

export interface SendReport extends SyncReport {
  /** Changed in both places, waiting for the next pause to be joined. */
  held: string[];
  /** Taken in from the data folder (changed only there). */
  pulled: string[];
  /** This computer's copy changed (joined or taken in): what's in memory must be read again. */
  localChanged: boolean;
}

const slashes = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/** The data files in the data folder, relative to it: no backups, exports or temp files. */
async function dataFiles(dir: string, prefix = ""): Promise<string[]> {
  const disk = diskFS();
  const at = prefix ? `${dir}/${prefix}` : dir;
  if (!(await disk.exists(at))) return [];
  const out: string[] = [];
  for (const e of await disk.listDir(at)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (!prefix && (e.name === "backups" || e.name === "exports")) continue;
    if (e.isDir) out.push(...(await dataFiles(dir, rel)));
    else if (!e.name.endsWith(".tmp.classkernel")) out.push(rel);
  }
  return out;
}

/**
 * Send this computer's changes to the data folder. `atPause`: also join files
 * changed in both places, keep aside ones gone from the folder, and take in
 * files changed only there; otherwise those wait. Saves made while it runs
 * are simply sent next time.
 */
export async function sendChanges(paths: LocalPaths, realDir: string, stamp: string, atPause: boolean): Promise<SendReport> {
  const fs = getFS();
  const disk = diskFS();
  const dir = slashes(realDir);
  const backupDir = `${dir}/backups/.sync/${stamp}`;
  const report: SendReport = {
    heading: "Sent to your data folder, joined with changes made on another computer",
    copied: [],
    joined: [],
    clashes: [],
    keptAside: [],
    notes: [],
    backupDir,
    held: [],
    pulled: [],
    localChanged: false,
  };
  // The copy as the app sees it: through the data folder's own paths, in step with its saves.
  const copyFile = (rel: string) => `${dir}/${rel}`;
  const baseFile = (rel: string) => `${paths.base}/${rel}`;
  const toFolder = (rel: string, text: string) => disk.writeAtomic(`${dir}/${rel}`, text, dir);
  const keep = async (side: "drive" | "this-computer", rel: string, text: string | null) => {
    if (text !== null) await disk.writeAtomic(`${backupDir}/${side}/${rel}`, text, dir);
  };
  const joinedClasses = new Set<string>();

  const sendPlain = async (rel: string, ours: string, theirs: string | null) => {
    if (theirs !== ours) await toFolder(rel, ours);
    await fs.writeAtomic(baseFile(rel), ours);
    report.copied.push(rel);
  };

  await fs.flush();
  for (const rel of await changedFiles(paths)) {
    const [ours, base, theirs] = await Promise.all([
      fs.readTextIfExists(`${paths.copy}/${rel}`),
      fs.readTextIfExists(baseFile(rel)),
      disk.readTextIfExists(`${dir}/${rel}`),
    ]);
    if (ours === null) continue;
    if (theirs === base || theirs === ours || (base === null && theirs === null)) {
      await sendPlain(rel, ours, theirs);
      continue;
    }
    if (!atPause) {
      report.held.push(rel);
      continue;
    }
    const cls = rel.match(/^classes\/([^/]+)\//)?.[1];
    if (base !== null && theirs === null) {
      // Gone from the data folder: kept aside, and no longer offered.
      await keep("this-computer", rel, ours);
      await fs.writeAtomic(baseFile(rel), ours);
      report.keptAside.push({
        file: rel,
        reason: cls ? `the class "${cls}" was renamed or removed on another computer` : "it was removed on another computer",
      });
      continue;
    }
    const result = mergeFile(rel, base, ours, theirs as string);
    await keep("drive", rel, theirs);
    await keep("this-computer", rel, ours);
    if (result.status === "refused") {
      // The data folder's version stands, here too; this computer's is in the backups.
      report.keptAside.push({ file: rel, reason: result.reason });
      await fs.writeAtomic(copyFile(rel), theirs as string);
      await fs.writeAtomic(baseFile(rel), theirs as string);
      report.localChanged = true;
      continue;
    }
    await toFolder(rel, result.text);
    // Only if nothing was saved here meanwhile; otherwise it's joined again next time.
    if ((await fs.readTextIfExists(copyFile(rel))) === ours) {
      await fs.writeAtomic(copyFile(rel), result.text);
      await fs.writeAtomic(baseFile(rel), result.text);
    } else {
      await fs.writeAtomic(baseFile(rel), result.text);
    }
    report.localChanged = true;
    report.joined.push(rel);
    for (const clash of result.clashes) report.clashes.push({ file: rel, clash });
    if (cls) joinedClasses.add(cls);
    await noteConflictCopies(dir, rel, report);
  }

  if (atPause) {
    // Changed only in the data folder (another computer): taken in here.
    const changedHere = new Set(await changedFiles(paths));
    const inFolder = new Set(await dataFiles(dir));
    for (const rel of inFolder) {
      if (changedHere.has(rel)) continue;
      const [theirs, base] = await Promise.all([disk.readTextIfExists(`${dir}/${rel}`), fs.readTextIfExists(baseFile(rel))]);
      if (theirs === null || theirs === base) continue;
      await fs.writeAtomic(copyFile(rel), theirs);
      await fs.writeAtomic(baseFile(rel), theirs);
      report.pulled.push(rel);
      report.localChanged = true;
    }
    // Removed from the data folder and untouched here: removed here too. Only
    // when the folder's listing looks whole: a cloud drive still catching up
    // can list next to nothing, and that must never empty this computer's copy.
    const baseFiles = await walk(paths.base);
    const missing = baseFiles.filter((rel) => !inFolder.has(rel) && !changedHere.has(rel));
    const listingWhole = inFolder.has("behaviours.csv") && missing.length <= baseFiles.length / 4;
    for (const rel of listingWhole ? missing : []) {
      await fs.removeLocal(`${paths.copy}/${rel}`).catch(() => {});
      await fs.removeLocal(baseFile(rel)).catch(() => {});
      report.pulled.push(rel);
      report.localChanged = true;
    }
  }

  // A joined set of question marks can disagree with the totals: work them out
  // again here, and send the result straight away.
  for (const cls of joinedClasses) await recalculateTotals(dir, cls);
  if (joinedClasses.size > 0) {
    await fs.flush();
    for (const rel of await changedFiles(paths)) {
      const [ours, base, theirs] = await Promise.all([
        fs.readTextIfExists(`${paths.copy}/${rel}`),
        fs.readTextIfExists(baseFile(rel)),
        disk.readTextIfExists(`${dir}/${rel}`),
      ]);
      if (ours !== null && (theirs === base || theirs === ours)) await sendPlain(rel, ours, theirs);
    }
  }
  return report;
}

/** Whether a send needs the teacher's attention (shown in the banner). */
export function needsALook(report: SendReport): boolean {
  return report.clashes.length > 0 || report.keptAside.length > 0 || report.notes.length > 0;
}
