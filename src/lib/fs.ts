// Filesystem abstraction. In the packaged app every call goes through small
// Rust commands (atomic writes, snapshots). In a plain browser (npm run dev
// without Tauri) and in unit tests, an in-memory implementation is used so the
// whole app remains drivable without a real disk.

export interface DirEntry {
  name: string;
  isDir: boolean;
}

/** Where a refreshing snapshot also writes this computer's copy, unless `guard` exists. */
export interface CopyTarget {
  to: string;
  guard: string;
}

export interface AppFS {
  readText(path: string): Promise<string>;
  /** The file's text, or null when it doesn't exist (one call instead of exists + readText). */
  readTextIfExists(path: string): Promise<string | null>;
  /**
   * Write via temp file + rename so cloud-sync clients never see half a file.
   * With a `root`, the write is refused if that folder has gone, rather than
   * re-creating it as a near-empty twin of the data folder.
   */
  writeAtomic(path: string, contents: string, root?: string): Promise<void>;
  /** Same, for generated binaries (spreadsheet exports). */
  writeBinary(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirs(path: string): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  rename(from: string, to: string): Promise<void>;
  /**
   * Snapshot the data folder into backups/<stamp>/, pruning old snapshots, and
   * (with `copy`) refresh this computer's copy of it in the same pass. Returns
   * the snapshot path.
   */
  snapshot(dataDir: string, stamp: string, keep: number, copy?: CopyTarget): Promise<string>;
  /** Replace `dest` (inside the app's local folder) with a copy of `src`, minus `skip` folders. */
  copyFolder(src: string, dest: string, skip: string[]): Promise<void>;
  /** Delete a file or folder inside the app's local folder; nothing else can be removed. */
  removeLocal(path: string): Promise<void>;
  /** The app's own folder on this computer (for its copy of the data). */
  localDir(): Promise<string>;
  /** Open a native folder picker; null if cancelled or unsupported. */
  pickFolder(): Promise<string | null>;
  /** Open a native "save as" dialog for a generated file; null if cancelled or unsupported. */
  pickSaveFile(defaultName: string, extension: string, label: string): Promise<string | null>;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

class TauriFS implements AppFS {
  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  readText(path: string) {
    return this.invoke<string>("read_text", { path });
  }
  readTextIfExists(path: string) {
    return this.invoke<string | null>("read_text_opt", { path });
  }
  writeAtomic(path: string, contents: string, root?: string) {
    return this.invoke<void>("write_atomic", { path, contents, root });
  }
  writeBinary(path: string, bytes: Uint8Array) {
    // The IPC bridge is JSON, so bytes travel as a plain number array.
    return this.invoke<void>("write_binary", { path, bytes: Array.from(bytes) });
  }
  exists(path: string) {
    return this.invoke<boolean>("path_exists", { path });
  }
  mkdirs(path: string) {
    return this.invoke<void>("mkdirs", { path });
  }
  listDir(path: string) {
    return this.invoke<DirEntry[]>("list_dir", { path });
  }
  rename(from: string, to: string) {
    return this.invoke<void>("rename_path", { from, to });
  }
  snapshot(dataDir: string, stamp: string, keep: number, copy?: CopyTarget) {
    return this.invoke<string>("snapshot_backup", { dataDir, stamp, keep, copyTo: copy?.to, copyGuard: copy?.guard });
  }
  copyFolder(src: string, dest: string, skip: string[]) {
    return this.invoke<void>("copy_folder", { src, dest, skip });
  }
  removeLocal(path: string) {
    return this.invoke<void>("remove_local", { path });
  }
  async localDir(): Promise<string> {
    const { appLocalDataDir } = await import("@tauri-apps/api/path");
    return (await appLocalDataDir()).replace(/[\\/]+$/, "");
  }
  async pickFolder(): Promise<string | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false, title: "Choose your classroom data folder" });
    return typeof picked === "string" ? picked : null;
  }
  async pickSaveFile(defaultName: string, extension: string, label: string): Promise<string | null> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const picked = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [extension] }] });
    return typeof picked === "string" ? picked : null;
  }
}

/** In-memory FS used by unit tests and the browser demo mode. */
export class MemFS implements AppFS {
  files = new Map<string, string>();
  /** Generated binaries (spreadsheet exports) kept separately from text files. */
  blobs = new Map<string, Uint8Array>();
  dirs = new Set<string>();
  /** Stands in for the app's local folder on this computer. */
  localRoot = "/this-computer";

  private norm(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+$/, "");
  }
  private inLocal(path: string): boolean {
    const p = this.norm(path);
    return p.startsWith(this.localRoot + "/") && !p.split("/").includes("..");
  }
  /** Every file under `dir` (text and binary), as paths relative to it. */
  private filesUnder(dir: string): Array<{ rel: string; text?: string; blob?: Uint8Array }> {
    const d = this.norm(dir) + "/";
    const out: Array<{ rel: string; text?: string; blob?: Uint8Array }> = [];
    for (const [k, text] of this.files) if (k.startsWith(d)) out.push({ rel: k.slice(d.length), text });
    for (const [k, blob] of this.blobs) if (k.startsWith(d)) out.push({ rel: k.slice(d.length), blob });
    return out;
  }
  private removeTree(dir: string): void {
    const d = this.norm(dir);
    for (const k of [...this.files.keys()]) if (k === d || k.startsWith(d + "/")) this.files.delete(k);
    for (const k of [...this.blobs.keys()]) if (k === d || k.startsWith(d + "/")) this.blobs.delete(k);
    for (const k of [...this.dirs]) if (k === d || k.startsWith(d + "/")) this.dirs.delete(k);
  }
  /** Copy files (not temp files, not under `skip` folders) from src into dest, like the Rust copy_tree. */
  private copyFiles(src: string, dest: string, skip: string[]): Set<string> {
    const copied = new Set<string>();
    for (const f of this.filesUnder(src)) {
      const parts = f.rel.split("/");
      if (parts.slice(0, -1).some((part) => skip.includes(part)) || f.rel.endsWith(".tmp.classkernel")) continue;
      const to = `${this.norm(dest)}/${f.rel}`;
      void this.mkdirs(to.slice(0, to.lastIndexOf("/")));
      if (f.text !== undefined) this.files.set(to, f.text);
      else if (f.blob) this.blobs.set(to, f.blob);
      copied.add(f.rel);
    }
    return copied;
  }
  async readText(path: string): Promise<string> {
    const p = this.norm(path);
    const f = this.files.get(p);
    if (f === undefined) throw new Error(`File not found: ${p}`);
    return f;
  }
  async readTextIfExists(path: string): Promise<string | null> {
    return this.files.get(this.norm(path)) ?? null;
  }
  async writeAtomic(path: string, contents: string, root?: string): Promise<void> {
    const p = this.norm(path);
    if (root !== undefined && !this.dirs.has(this.norm(root))) throw new Error(`The data folder isn't available: ${root}`);
    await this.mkdirs(p.slice(0, p.lastIndexOf("/")));
    this.files.set(p, contents);
  }
  async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
    const p = this.norm(path);
    await this.mkdirs(p.slice(0, p.lastIndexOf("/")));
    this.blobs.set(p, bytes);
  }
  async exists(path: string): Promise<boolean> {
    const p = this.norm(path);
    return this.files.has(p) || this.blobs.has(p) || this.dirs.has(p);
  }
  async mkdirs(path: string): Promise<void> {
    const p = this.norm(path);
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (dir) this.dirs.add(dir);
    }
  }
  async listDir(path: string): Promise<DirEntry[]> {
    const p = this.norm(path);
    const seen = new Map<string, boolean>();
    for (const f of [...this.files.keys(), ...this.blobs.keys()]) {
      if (f.startsWith(p + "/")) {
        const rest = f.slice(p.length + 1);
        const head = rest.split("/")[0];
        if (rest.includes("/")) seen.set(head, true);
        else if (!seen.has(head)) seen.set(head, false);
      }
    }
    for (const d of this.dirs) {
      if (d.startsWith(p + "/")) {
        const head = d.slice(p.length + 1).split("/")[0];
        seen.set(head, true);
      }
    }
    return [...seen.entries()].map(([name, isDir]) => ({ name, isDir }));
  }
  async rename(from: string, to: string): Promise<void> {
    const f = this.norm(from);
    const t = this.norm(to);
    for (const [k, v] of [...this.files.entries()]) {
      if (k === f || k.startsWith(f + "/")) {
        this.files.delete(k);
        this.files.set(t + k.slice(f.length), v);
      }
    }
    for (const d of [...this.dirs]) {
      if (d === f || d.startsWith(f + "/")) {
        this.dirs.delete(d);
        this.dirs.add(t + d.slice(f.length));
      }
    }
  }
  async snapshot(dataDir: string, stamp: string, _keep: number, copy?: CopyTarget): Promise<string> {
    const dest = `${this.norm(dataDir)}/backups/${stamp}`;
    await this.mkdirs(dest);
    this.copyFiles(dataDir, dest, ["backups"]);
    if (copy && !(await this.exists(copy.guard))) {
      const kept = this.copyFiles(dataDir, copy.to, ["backups", "exports"]);
      // Remove what the data folder no longer has, as the Rust refresh does.
      for (const f of this.filesUnder(copy.to)) {
        if (!kept.has(f.rel) && f.rel !== ".source.json") {
          this.files.delete(`${this.norm(copy.to)}/${f.rel}`);
          this.blobs.delete(`${this.norm(copy.to)}/${f.rel}`);
        }
      }
    }
    return dest;
  }
  async copyFolder(src: string, dest: string, skip: string[]): Promise<void> {
    if (!this.inLocal(dest)) throw new Error(`Not in the app's local folder: ${dest}`);
    this.removeTree(dest);
    await this.mkdirs(dest);
    this.copyFiles(src, dest, skip);
  }
  async removeLocal(path: string): Promise<void> {
    if (!this.inLocal(path)) throw new Error(`Not in the app's local folder: ${path}`);
    this.removeTree(path);
  }
  async localDir(): Promise<string> {
    return this.localRoot;
  }
  async pickFolder(): Promise<string | null> {
    return null;
  }
  async pickSaveFile(): Promise<string | null> {
    // No native dialog outside the desktop app; callers fall back to a download.
    return null;
  }
}

const slashes = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * Keeps this computer's copy of the data folder current: every write or
 * rename inside the data folder is repeated in the copy once the real one has
 * succeeded, so if Google Drive isn't there at the next launch, the copy is
 * as recent as the last save. Backups, exports and temp files aren't copied.
 * A failed copy is only logged; the real save is what counts.
 *
 * It also passes the data folder as the `root` of each write inside it, so a
 * cloud folder that has gone away mid-session isn't re-created by a save.
 */
export class MirrorFS implements AppFS {
  private root: string | null = null;
  private mirrorTo: string | null = null;

  constructor(readonly inner: AppFS) {}

  /** The open data folder, and where to mirror it (null: don't). */
  useFolder(root: string | null, mirrorTo: string | null): void {
    this.root = root === null ? null : slashes(root);
    this.mirrorTo = mirrorTo === null ? null : slashes(mirrorTo);
  }

  /** The path relative to the open data folder, or null if it's outside it. */
  private rel(path: string): string | null {
    if (this.root === null) return null;
    const p = slashes(path);
    return p.startsWith(this.root + "/") ? p.slice(this.root.length + 1) : null;
  }

  private mirrorPath(path: string): string | null {
    const rel = this.rel(path);
    if (rel === null || this.mirrorTo === null) return null;
    const top = rel.split("/")[0];
    if (top === "backups" || top === "exports" || rel.endsWith(".tmp.classkernel")) return null;
    return `${this.mirrorTo}/${rel}`;
  }

  async writeAtomic(path: string, contents: string, root?: string) {
    const inRoot = this.rel(path) !== null;
    const copyPath = this.mirrorPath(path);
    await this.inner.writeAtomic(path, contents, inRoot && this.root !== null ? this.root : root);
    if (copyPath) {
      try {
        await this.inner.writeAtomic(copyPath, contents);
      } catch (e) {
        console.warn("Couldn't update this computer's copy", e);
      }
    }
  }
  async rename(from: string, to: string) {
    const copyFrom = this.mirrorPath(from);
    const copyTo = this.mirrorPath(to);
    await this.inner.rename(from, to);
    if (copyFrom && copyTo) {
      try {
        if (await this.inner.exists(copyFrom)) await this.inner.rename(copyFrom, copyTo);
      } catch (e) {
        console.warn("Couldn't update this computer's copy", e);
      }
    }
  }
  readText(path: string) {
    return this.inner.readText(path);
  }
  readTextIfExists(path: string) {
    return this.inner.readTextIfExists(path);
  }
  writeBinary(path: string, bytes: Uint8Array) {
    return this.inner.writeBinary(path, bytes);
  }
  exists(path: string) {
    return this.inner.exists(path);
  }
  mkdirs(path: string) {
    return this.inner.mkdirs(path);
  }
  listDir(path: string) {
    return this.inner.listDir(path);
  }
  snapshot(dataDir: string, stamp: string, keep: number, copy?: CopyTarget) {
    return this.inner.snapshot(dataDir, stamp, keep, copy);
  }
  copyFolder(src: string, dest: string, skip: string[]) {
    return this.inner.copyFolder(src, dest, skip);
  }
  removeLocal(path: string) {
    return this.inner.removeLocal(path);
  }
  localDir() {
    return this.inner.localDir();
  }
  pickFolder() {
    return this.inner.pickFolder();
  }
  pickSaveFile(defaultName: string, extension: string, label: string) {
    return this.inner.pickSaveFile(defaultName, extension, label);
  }
}

/** A write waiting its turn; a newer write to the same file replaces its contents. */
interface QueuedWrite {
  run: () => Promise<void>;
  done: Promise<void>;
}

/**
 * Puts writes to the same file in order, one at a time, and collapses a burst.
 * The Rust commands run off the UI thread, so without this two saves of one
 * file could overlap or land out of order. While a file is being written, the
 * next write waits; any newer one replaces the contents of that waiting write,
 * so typing a row of marks costs at most two disk writes per file, not two per
 * keystroke. Every caller's promise settles once its contents (or newer) are
 * on disk, so a failure still reaches the save-error banner.
 *
 * Reads wait for the file's pending writes; rename, listing and snapshots wait
 * for all of them, so nothing ever reads a file older than what's in memory.
 * A backup snapshot runs in the background at launch; writes and renames made
 * meanwhile wait for it, so the copy is the folder exactly as it was opened and
 * no file is replaced mid-copy (which Windows refuses). The edit itself shows
 * at once; only its disk write waits.
 */
export class QueuedFS implements AppFS {
  private tails = new Map<string, Promise<void>>();
  private waiting = new Map<string, QueuedWrite>();
  /** Settles when the running backup snapshot (if any) has finished. */
  private backup: Promise<void> = Promise.resolve();

  constructor(readonly inner: AppFS) {}

  private key(path: string): string {
    return path.replace(/\\/g, "/");
  }

  private enqueue(path: string, run: () => Promise<void>): Promise<void> {
    const key = this.key(path);
    const queued = this.waiting.get(key);
    if (queued) {
      queued.run = run;
      return queued.done;
    }
    const prev = Promise.all([this.tails.get(key), this.backup]);
    const write = { run } as QueuedWrite;
    write.done = prev.then(() => {
      // Started: anything newer queues behind this write.
      this.waiting.delete(key);
      return write.run();
    });
    this.waiting.set(key, write);
    const tail = write.done.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return write.done;
  }

  private async settled(path: string): Promise<void> {
    await this.tails.get(this.key(path));
  }

  private async allSettled(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }

  async readText(path: string) {
    await this.settled(path);
    return this.inner.readText(path);
  }
  async readTextIfExists(path: string) {
    await this.settled(path);
    return this.inner.readTextIfExists(path);
  }
  writeAtomic(path: string, contents: string, root?: string) {
    return this.enqueue(path, () => this.inner.writeAtomic(path, contents, root));
  }
  writeBinary(path: string, bytes: Uint8Array) {
    return this.enqueue(path, () => this.inner.writeBinary(path, bytes));
  }
  /** Settles once every write queued so far has reached the disk (or failed). */
  async flush(): Promise<void> {
    await this.allSettled();
  }
  async exists(path: string) {
    await this.settled(path);
    return this.inner.exists(path);
  }
  mkdirs(path: string) {
    return this.inner.mkdirs(path);
  }
  async listDir(path: string) {
    await this.allSettled();
    return this.inner.listDir(path);
  }
  async rename(from: string, to: string) {
    await this.allSettled();
    await this.backup;
    return this.inner.rename(from, to);
  }
  snapshot(dataDir: string, stamp: string, keep: number, copy?: CopyTarget) {
    // The gate goes up at once, so even a write queued right after this call waits.
    const copying = this.allSettled().then(() => this.inner.snapshot(dataDir, stamp, keep, copy));
    this.backup = copying.then(
      () => {},
      () => {},
    );
    return copying;
  }
  async copyFolder(src: string, dest: string, skip: string[]) {
    await this.allSettled();
    return this.inner.copyFolder(src, dest, skip);
  }
  async removeLocal(path: string) {
    await this.allSettled();
    return this.inner.removeLocal(path);
  }
  localDir() {
    return this.inner.localDir();
  }
  pickFolder() {
    return this.inner.pickFolder();
  }
  pickSaveFile(defaultName: string, extension: string, label: string) {
    return this.inner.pickSaveFile(defaultName, extension, label);
  }
}

let fsInstance: QueuedFS | null = null;
let mirror: MirrorFS | null = null;

function build(base: AppFS): QueuedFS {
  mirror = new MirrorFS(base);
  return new QueuedFS(mirror);
}

export function getFS(): QueuedFS {
  if (!fsInstance) fsInstance = build(isTauri() ? new TauriFS() : new MemFS());
  return fsInstance;
}

/** Swap the backend (tests); it is mirrored and queued the same way as the real one. */
export function setFS(fs: AppFS): void {
  fsInstance = build(fs);
}

/**
 * Tell the file layer which data folder is open (its writes are refused if it
 * goes missing) and where to keep this computer's copy of it (null: nowhere).
 */
export function useFolder(root: string | null, mirrorTo: string | null): void {
  getFS();
  mirror?.useFolder(root, mirrorTo);
}
