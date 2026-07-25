// Filesystem abstraction. In the packaged app every call goes through small
// Rust commands (atomic writes, snapshots). In a plain browser (npm run dev
// without Tauri) and in unit tests, an in-memory implementation is used so the
// whole app remains drivable without a real disk.

import { hashText } from "./hash";

export interface DirEntry {
  name: string;
  isDir: boolean;
}

/** What Drive sync needs to know about a local file, in one round trip. */
export interface FileStat {
  /** MD5 of the contents, to compare against Drive's md5Checksum. */
  hash: string;
  /** Last-modified time, epoch milliseconds. */
  modifiedMs: number;
}

export interface AppFS {
  readText(path: string): Promise<string>;
  /** Write via temp file + rename so cloud-sync clients never see half a file. */
  writeAtomic(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirs(path: string): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  rename(from: string, to: string): Promise<void>;
  /** Snapshot the data folder into backups/<stamp>/, pruning old snapshots. Returns snapshot path. */
  snapshot(dataDir: string, stamp: string, keep: number): Promise<string>;
  /** Open a native folder picker; null if cancelled or unsupported. */
  pickFolder(): Promise<string | null>;
  /** Hash + mtime of a file, for Drive sync change detection. */
  stat(path: string): Promise<FileStat>;
  /** Delete a file. Used by sync when a file was removed on another device. */
  remove(path: string): Promise<void>;
  /**
   * Absolute path to a per-user app config file (outside the data folder).
   * Sync state lives here: it is device-specific, and the data folder is meant
   * to stay plain .csv/.md the teacher can open in Excel.
   */
  configPath(name: string): Promise<string>;
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
  writeAtomic(path: string, contents: string) {
    return this.invoke<void>("write_atomic", { path, contents });
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
  stat(path: string) {
    return this.invoke<FileStat>("file_stat", { path });
  }
  remove(path: string) {
    return this.invoke<void>("remove_file", { path });
  }
  configPath(name: string) {
    return this.invoke<string>("config_path", { name });
  }
}

/** In-memory FS used by unit tests and the browser demo mode. */
export class MemFS implements AppFS {
  files = new Map<string, string>();
  dirs = new Set<string>();
  mtimes = new Map<string, number>();
  /** Monotonic stand-in for wall-clock mtime, so write order is deterministic. */
  private clock = 1_700_000_000_000;

  private norm(p: string): string {
    return p.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /** Tests use this to stage "this side was edited later than that one". */
  setMtime(path: string, ms: number): void {
    this.mtimes.set(this.norm(path), ms);
  }
  async readText(path: string): Promise<string> {
    const p = this.norm(path);
    const f = this.files.get(p);
    if (f === undefined) throw new Error(`File not found: ${p}`);
    return f;
  }
  async writeAtomic(path: string, contents: string): Promise<void> {
    const p = this.norm(path);
    await this.mkdirs(p.slice(0, p.lastIndexOf("/")));
    this.files.set(p, contents);
    this.mtimes.set(p, ++this.clock);
  }
  async exists(path: string): Promise<boolean> {
    const p = this.norm(path);
    return this.files.has(p) || this.dirs.has(p);
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
    for (const f of this.files.keys()) {
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
  async stat(path: string): Promise<FileStat> {
    const p = this.norm(path);
    const f = this.files.get(p);
    if (f === undefined) throw new Error(`File not found: ${p}`);
    return { hash: hashText(f), modifiedMs: this.mtimes.get(p) ?? 0 };
  }
  async remove(path: string): Promise<void> {
    const p = this.norm(path);
    this.files.delete(p);
    this.mtimes.delete(p);
  }
  async configPath(name: string): Promise<string> {
    return `/config/${name}`;
  }
}

let fsInstance: AppFS | null = null;

export function getFS(): AppFS {
  if (!fsInstance) fsInstance = isTauri() ? new TauriFS() : new MemFS();
  return fsInstance;
}

export function setFS(fs: AppFS): void {
  fsInstance = fs;
}
