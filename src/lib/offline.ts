// Working from this computer's copy of the data folder when Google Drive (or
// OneDrive) isn't there yet, and copying the changes back once it is.
//
// On this computer, beside the app (AppFS.localDir()):
//   local-copy/            the copy, kept current by every save (MirrorFS) and
//                          refreshed at each normal launch; .source.json last
//   offline-base/          the copy as it was when the data folder went
//                          missing: what joining back compares against
//   offline-session.json   "this computer has changes not yet copied back";
//                          written last when going offline, removed last
//                          after joining back
//   state.json             the data folder in use, in case WebView storage
//                          is ever cleared while changes are waiting
//
// The changed files are simply those that differ between local-copy/ and
// offline-base/, so nothing has to be tracked per save.

import { getFS } from "./fs";
import { mergeFile, Clash } from "./merge";
import * as repo from "./repo";
import { Mark } from "./types";

export interface LocalPaths {
  root: string;
  copy: string;
  base: string;
  session: string;
  state: string;
  source: string;
}

export async function localPaths(): Promise<LocalPaths> {
  const root = await getFS().localDir();
  return {
    root,
    copy: `${root}/local-copy`,
    base: `${root}/offline-base`,
    session: `${root}/offline-session.json`,
    state: `${root}/state.json`,
    source: `${root}/local-copy/.source.json`,
  };
}

/** Which data folder the copy was last refreshed from, and when. */
export interface CopySource {
  realDir: string;
  refreshedAt: string;
}

/** An offline period: since when, for which data folder, and how old the copy was then. */
export interface OfflineSession {
  realDir: string;
  since: string;
  copyRefreshedAt: string;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await getFS().readTextIfExists(path);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

export const readSource = (paths: LocalPaths) => readJson<CopySource>(paths.source);
export const readSession = (paths: LocalPaths) => readJson<OfflineSession>(paths.session);
export const readState = (paths: LocalPaths) => readJson<{ dataDir: string }>(paths.state);

export async function writeState(paths: LocalPaths, dataDir: string): Promise<void> {
  await getFS().writeAtomic(paths.state, JSON.stringify({ dataDir }));
}

const slashes = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/** Whether two spellings name the same folder (Windows paths ignore case). */
export function sameFolder(a: string, b: string): boolean {
  return slashes(a).toLowerCase() === slashes(b).toLowerCase();
}

/**
 * Whether a data folder can be used: its behaviours.csv (which every data
 * folder has) reads with content within the time allowed. A folder that
 * exists but can't be read, or whose files haven't arrived yet, as with a
 * cloud drive still starting, is not ready.
 */
export async function isReady(dir: string, timeoutMs = 5000): Promise<boolean> {
  const read = getFS()
    .readTextIfExists(`${slashes(dir)}/behaviours.csv`)
    .then((t) => !!t && t.trim().length > 0)
    .catch(() => false);
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([read, timeout]);
}

export type BootPlan =
  | { kind: "onboarding" }
  | { kind: "open"; dir: string }
  /** Changes are waiting: work from the copy, join back once the folder has settled. */
  | { kind: "copy"; realDir: string }
  /** The folder isn't there yet: wait, then (if `copyAvailable`) open the copy. */
  | { kind: "wait"; realDir: string; copyAvailable: boolean };

export function decideBoot(input: {
  savedDir: string | null;
  session: OfflineSession | null;
  ready: boolean;
  source: CopySource | null;
}): BootPlan {
  const { savedDir, session, ready, source } = input;
  if (session) return { kind: "copy", realDir: session.realDir };
  if (!savedDir) return { kind: "onboarding" };
  if (ready) return { kind: "open", dir: savedDir };
  return { kind: "wait", realDir: savedDir, copyAvailable: !!source && sameFolder(source.realDir, savedDir) };
}

/**
 * Begin (or carry on) working from the copy. The first time, the copy is
 * kept as it is now in offline-base/, and only then is the marker written,
 * so a crash in between simply starts again. An existing marker means the
 * offline period is already under way: its starting point is never retaken.
 */
export async function startOfflineSession(paths: LocalPaths, realDir: string): Promise<OfflineSession> {
  const existing = await readSession(paths);
  if (existing) return existing;
  const fs = getFS();
  await fs.copyFolder(paths.copy, paths.base, []);
  const source = await readSource(paths);
  const session: OfflineSession = { realDir, since: new Date().toISOString(), copyRefreshedAt: source?.refreshedAt ?? "" };
  await fs.writeAtomic(paths.session, JSON.stringify(session));
  return session;
}

/** Every file under `dir`, relative to it, leaving out bookkeeping and temp files. */
async function walk(dir: string, prefix = ""): Promise<string[]> {
  const fs = getFS();
  if (!(await fs.exists(dir))) return [];
  const out: string[] = [];
  for (const e of await fs.listDir(dir)) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDir) out.push(...(await walk(`${dir}/${e.name}`, rel)));
    else if (rel !== ".source.json" && !e.name.endsWith(".tmp.classkernel")) out.push(rel);
  }
  return out;
}

/** Files that differ between the copy and its starting point: added or changed while offline. */
export async function changedFiles(paths: LocalPaths): Promise<string[]> {
  const fs = getFS();
  const changed: string[] = [];
  for (const rel of (await walk(paths.copy)).sort()) {
    const [ours, base] = await Promise.all([fs.readTextIfExists(`${paths.copy}/${rel}`), fs.readTextIfExists(`${paths.base}/${rel}`)]);
    if (ours !== base) changed.push(rel);
  }
  return changed;
}

export interface SyncReport {
  /** Files copied across as they were (only this computer had changed them). */
  copied: string[];
  /** Files joined with changes made elsewhere. */
  joined: string[];
  clashes: Array<{ file: string; clash: Clash }>;
  /** Files not written, with why; both versions are in the backup folder. */
  keptAside: Array<{ file: string; reason: string }>;
  /** Things worth a look: likely duplicates, a sync client's conflict copies. */
  notes: string[];
  /** Where the originals were saved (inside the data folder). */
  backupDir: string;
}

/**
 * Copy this computer's changes into the data folder. For each changed file:
 * - new here and not in the data folder: written as it is;
 * - gone from the data folder although it existed when the copy was taken
 *   (a class renamed or removed on another computer): not re-created, but
 *   kept aside and reported;
 * - unchanged in the data folder since then: this computer's version is written;
 * - changed on both sides: joined row by row (merge.ts).
 * Both originals of every file it touches are saved first, under
 * backups/.sync/<stamp>/ (hidden from the Restore list). Mark totals are then
 * worked out again from the joined question marks. The offline marker is
 * removed only once every file is done; if anything fails, it stays and the
 * next attempt (idempotent) carries on.
 */
export async function syncBack(paths: LocalPaths, realDir: string, stamp: string): Promise<SyncReport> {
  const fs = getFS();
  const dir = slashes(realDir);
  const backupDir = `${dir}/backups/.sync/${stamp}`;
  const report: SyncReport = { copied: [], joined: [], clashes: [], keptAside: [], notes: [], backupDir };
  const write = (rel: string, text: string) => fs.writeAtomic(`${dir}/${rel}`, text, dir);
  const keep = async (side: "drive" | "this-computer", rel: string, text: string | null) => {
    if (text !== null) await fs.writeAtomic(`${backupDir}/${side}/${rel}`, text, dir);
  };
  const touchedClasses = new Set<string>();

  for (const rel of await changedFiles(paths)) {
    const [ours, base, theirs] = await Promise.all([
      fs.readTextIfExists(`${paths.copy}/${rel}`),
      fs.readTextIfExists(`${paths.base}/${rel}`),
      fs.readTextIfExists(`${dir}/${rel}`),
    ]);
    if (ours === null) continue;
    const cls = rel.match(/^classes\/([^/]+)\//)?.[1];
    if (base !== null && theirs === null) {
      await keep("this-computer", rel, ours);
      report.keptAside.push({ file: rel, reason: cls ? `the class "${cls}" was renamed or removed on another computer` : "it was removed on another computer" });
      continue;
    }
    if (theirs === null) {
      await write(rel, ours);
      report.copied.push(rel);
    } else if (theirs === base || theirs === ours) {
      await keep("drive", rel, theirs);
      await write(rel, ours);
      report.copied.push(rel);
    } else {
      const result = mergeFile(rel, base, ours, theirs);
      await keep("drive", rel, theirs);
      await keep("this-computer", rel, ours);
      if (result.status === "refused") {
        report.keptAside.push({ file: rel, reason: result.reason });
        continue;
      }
      await write(rel, result.text);
      report.joined.push(rel);
      for (const clash of result.clashes) report.clashes.push({ file: rel, clash });
    }
    if (cls) touchedClasses.add(cls);
    await noteConflictCopies(dir, rel, report);
  }

  for (const cls of touchedClasses) {
    await recalculateTotals(dir, cls);
    await noteLikelyDuplicates(dir, cls, report);
  }

  await fs.removeLocal(paths.session);
  await fs.removeLocal(paths.base);
  return report;
}

/** Sync clients keep a version they couldn't reconcile beside the file, e.g. "marks (1).csv" or "marks-LAPTOP.csv". */
async function noteConflictCopies(dir: string, rel: string, report: SyncReport): Promise<void> {
  const slash = rel.lastIndexOf("/");
  const folder = slash < 0 ? dir : `${dir}/${rel.slice(0, slash)}`;
  const file = rel.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const [stem, ext] = dot < 0 ? [file, ""] : [file.slice(0, dot), file.slice(dot)];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${esc(stem)}( \\(\\d+\\)|-[^.]+)${esc(ext)}$`);
  try {
    for (const e of await getFS().listDir(folder)) {
      if (!e.isDir && pattern.test(e.name)) {
        report.notes.push(`"${e.name}" next to ${rel} looks like a copy your sync app kept from a clash — check it by hand.`);
      }
    }
  } catch {
    // Listing is only for the note.
  }
}

/** A multi-question test's total is the sum of its question marks; join the two and they could disagree. */
async function recalculateTotals(dir: string, cls: string): Promise<void> {
  const [questions, qmarks, marks] = await Promise.all([
    repo.loadAssessmentQuestions(dir, cls),
    repo.loadQuestionMarks(dir, cls),
    repo.loadMarks(dir, cls),
  ]);
  const perQuestion = new Set(questions.map((q) => q.assessmentId));
  const totals = new Map<string, number>();
  for (const m of qmarks) {
    if (!perQuestion.has(m.assessmentId) || m.mark === null) continue;
    const k = `${m.assessmentId}|${m.studentId}`;
    totals.set(k, (totals.get(k) ?? 0) + m.mark);
  }
  let changed = false;
  const next: Mark[] = marks.map((m) => {
    const total = totals.get(`${m.assessmentId}|${m.studentId}`);
    if (total === undefined || (m.mark !== null && Math.abs(m.mark - total) < 1e-9)) return m;
    changed = true;
    return { ...m, mark: total };
  });
  for (const [k, total] of totals) {
    const [assessmentId, studentId] = k.split("|");
    if (!marks.some((m) => m.assessmentId === assessmentId && m.studentId === studentId)) {
      next.push({ assessmentId, studentId, mark: total, comment: "" });
      changed = true;
    }
  }
  if (changed) await repo.saveMarks(dir, cls, next);
}

/** A student or test added on both computers ends up twice, under two ids; say so. */
async function noteLikelyDuplicates(dir: string, cls: string, report: SyncReport): Promise<void> {
  const [students, assessments] = await Promise.all([repo.loadStudents(dir, cls), repo.loadAssessments(dir, cls)]);
  const seen = new Map<string, string>();
  for (const s of students) {
    const keys = [`name:${s.firstName.trim().toLowerCase()} ${s.lastName.trim().toLowerCase()}`];
    if (s.adamNo.trim()) keys.push(`adam:${s.adamNo.trim()}`);
    for (const k of keys) {
      const other = seen.get(k);
      if (other && other !== s.id) {
        report.notes.push(`${cls}: ${s.firstName} ${s.lastName} appears twice in the class list — remove one in Settings → Students.`);
        break;
      }
      seen.set(k, s.id);
    }
  }
  const tests = new Map<string, string>();
  for (const a of assessments) {
    const k = `${a.title.trim().toLowerCase()}|${a.date}`;
    const other = tests.get(k);
    if (other && other !== a.id) report.notes.push(`${cls}: "${a.title}" (${a.date}) appears twice on the Marks page.`);
    tests.set(k, a.id);
  }
}

/**
 * Two polls at least `settleMs` apart must both find the folder ready before
 * joining back: a cloud drive shows what it had cached first and catches up
 * on changes from other computers over the next minute or so.
 */
export class SettleTracker {
  private firstReadyAt: number | null = null;

  constructor(private settleMs = 30_000) {}

  /** Record a poll; true once the folder has stayed ready for long enough. */
  poll(ready: boolean, now: number): boolean {
    if (!ready) {
      this.firstReadyAt = null;
      return false;
    }
    this.firstReadyAt ??= now;
    return now - this.firstReadyAt >= this.settleMs;
  }
}
