// Filesystem abstraction. In the packaged app every call goes through small
// Rust commands (atomic writes, snapshots). In a plain browser (npm run dev
// without Tauri) and in unit tests, an in-memory implementation is used so the
// whole app remains drivable without a real disk.

export interface DirEntry {
  name: string;
  isDir: boolean;
}

export interface AppFS {
  readText(path: string): Promise<string>;
  /** The file's text, or null when it doesn't exist (one call instead of exists + readText). */
  readTextIfExists(path: string): Promise<string | null>;
  /** Write via temp file + rename so cloud-sync clients never see half a file. */
  writeAtomic(path: string, contents: string): Promise<void>;
  /** Same, for generated binaries (spreadsheet exports). */
  writeBinary(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirs(path: string): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  rename(from: string, to: string): Promise<void>;
  /** Snapshot the data folder into backups/<stamp>/, pruning old snapshots. Returns snapshot path. */
  snapshot(dataDir: string, stamp: string, keep: number): Promise<string>;
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
  writeAtomic(path: string, contents: string) {
    return this.invoke<void>("write_atomic", { path, contents });
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
  snapshot(dataDir: string, stamp: string, keep: number) {
    return this.invoke<string>("snapshot_backup", { dataDir, stamp, keep });
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

  private norm(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+$/, "");
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
  async writeAtomic(path: string, contents: string): Promise<void> {
    const p = this.norm(path);
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
  async snapshot(dataDir: string, stamp: string, _keep: number): Promise<string> {
    const dest = `${this.norm(dataDir)}/backups/${stamp}`;
    await this.mkdirs(dest);
    return dest;
  }
  async pickFolder(): Promise<string | null> {
    return null;
  }
  async pickSaveFile(): Promise<string | null> {
    // No native dialog outside the desktop app; callers fall back to a download.
    return null;
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
  writeAtomic(path: string, contents: string) {
    return this.enqueue(path, () => this.inner.writeAtomic(path, contents));
  }
  writeBinary(path: string, bytes: Uint8Array) {
    return this.enqueue(path, () => this.inner.writeBinary(path, bytes));
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
  snapshot(dataDir: string, stamp: string, keep: number) {
    // The gate goes up at once, so even a write queued right after this call waits.
    const copying = this.allSettled().then(() => this.inner.snapshot(dataDir, stamp, keep));
    this.backup = copying.then(
      () => {},
      () => {},
    );
    return copying;
  }
  pickFolder() {
    return this.inner.pickFolder();
  }
  pickSaveFile(defaultName: string, extension: string, label: string) {
    return this.inner.pickSaveFile(defaultName, extension, label);
  }
}

let fsInstance: AppFS | null = null;

export function getFS(): AppFS {
  if (!fsInstance) fsInstance = new QueuedFS(isTauri() ? new TauriFS() : new MemFS());
  return fsInstance;
}

/** Swap the backend (tests); it is queued the same way as the real one. */
export function setFS(fs: AppFS): void {
  fsInstance = new QueuedFS(fs);
}
