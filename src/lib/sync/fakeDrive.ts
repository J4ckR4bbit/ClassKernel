// In-memory stand-in for Google Drive, used by the sync engine tests.
//
// It hashes with the same function MemFS uses, which is what makes the pairing
// honest: in the real app both sides are MD5 (Rust for local files, Drive's own
// md5Checksum for remote ones), and the engine only ever compares them for
// equality.

import { hashText } from "../hash";
import { DriveClient, DriveFileMeta, UploadArgs } from "./types";

interface Entry {
  id: string;
  name: string;
  isFolder: boolean;
  content: string;
  relPath: string | null;
  rootId: string | null;
  modifiedTime: string;
  trashed: boolean;
}

export class FakeDrive implements DriveClient {
  entries = new Map<string, Entry>();
  /** Advanced by tests to control which side looks more recently edited. */
  now = new Date("2026-07-25T10:00:00.000Z").getTime();
  private nextId = 1;
  calls: string[] = [];

  private stamp(): string {
    return new Date(this.now).toISOString();
  }

  private id(): string {
    return `file${this.nextId++}`;
  }

  async ensureRoot(name: string): Promise<DriveFileMeta> {
    for (const e of this.entries.values()) {
      if (e.isFolder && e.name === name && e.rootId === null && !e.trashed) return toMeta(e);
    }
    const entry: Entry = {
      id: this.id(),
      name,
      isFolder: true,
      content: "",
      relPath: null,
      rootId: null,
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.entries.set(entry.id, entry);
    return toMeta(entry);
  }

  async listTree(rootId: string): Promise<DriveFileMeta[]> {
    this.calls.push("listTree");
    return [...this.entries.values()].filter((e) => e.rootId === rootId).map(toMeta);
  }

  async createFolder(name: string, _parentId: string, relPath: string, rootId: string): Promise<DriveFileMeta> {
    const entry: Entry = {
      id: this.id(),
      name,
      isFolder: true,
      content: "",
      relPath,
      rootId,
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.entries.set(entry.id, entry);
    return toMeta(entry);
  }

  async upload(args: UploadArgs): Promise<DriveFileMeta> {
    this.calls.push(`upload:${args.relPath}`);
    const existing = args.fileId ? this.entries.get(args.fileId) : undefined;
    if (existing) {
      existing.content = args.content;
      existing.modifiedTime = this.stamp();
      existing.trashed = false;
      return toMeta(existing);
    }
    const entry: Entry = {
      id: this.id(),
      name: args.name,
      isFolder: false,
      content: args.content,
      relPath: args.relPath,
      rootId: args.rootId,
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.entries.set(entry.id, entry);
    return toMeta(entry);
  }

  async download(fileId: string): Promise<string> {
    this.calls.push(`download:${fileId}`);
    const entry = this.entries.get(fileId);
    if (!entry) throw new Error(`No such Drive file: ${fileId}`);
    return entry.content;
  }

  async trash(fileId: string): Promise<void> {
    this.calls.push(`trash:${fileId}`);
    const entry = this.entries.get(fileId);
    if (entry) entry.trashed = true;
  }

  // ---- helpers for tests ----

  /** Simulate another device writing a file straight into the Drive folder. */
  put(rootId: string, relPath: string, content: string): DriveFileMeta {
    const existing = [...this.entries.values()].find(
      (e) => e.rootId === rootId && e.relPath === relPath && !e.isFolder,
    );
    if (existing) {
      existing.content = content;
      existing.modifiedTime = this.stamp();
      existing.trashed = false;
      return toMeta(existing);
    }
    const entry: Entry = {
      id: this.id(),
      name: relPath.split("/").pop() ?? relPath,
      isFolder: false,
      content,
      relPath,
      rootId,
      modifiedTime: this.stamp(),
      trashed: false,
    };
    this.entries.set(entry.id, entry);
    return toMeta(entry);
  }

  find(relPath: string): Entry | undefined {
    return [...this.entries.values()].find((e) => e.relPath === relPath && !e.isFolder);
  }

  livePaths(): string[] {
    return [...this.entries.values()]
      .filter((e) => !e.isFolder && !e.trashed && e.relPath)
      .map((e) => e.relPath as string)
      .sort();
  }
}

function toMeta(e: Entry): DriveFileMeta {
  return {
    id: e.id,
    name: e.name,
    isFolder: e.isFolder,
    md5: e.isFolder ? null : hashText(e.content),
    modifiedTime: e.modifiedTime,
    relPath: e.relPath,
    trashed: e.trashed,
  };
}
