// Shared types for Google Drive sync.

export interface DriveFileMeta {
  id: string;
  name: string;
  isFolder: boolean;
  /** Drive's MD5 of the contents; absent for folders. */
  md5: string | null;
  /** RFC3339. */
  modifiedTime: string;
  /** Path relative to the data folder, from appProperties.ck_rel_path. */
  relPath: string | null;
  trashed: boolean;
}

export interface UploadArgs {
  /** Omit to create; supply to replace an existing file's contents. */
  fileId?: string;
  name: string;
  parentId: string;
  relPath: string;
  rootId: string;
  content: string;
}

/**
 * The Drive operations the sync engine needs. The engine codes against this
 * interface so tests can drive it with an in-memory fake.
 */
export interface DriveClient {
  ensureRoot(name: string): Promise<DriveFileMeta>;
  listTree(rootId: string): Promise<DriveFileMeta[]>;
  createFolder(name: string, parentId: string, relPath: string, rootId: string): Promise<DriveFileMeta>;
  upload(args: UploadArgs): Promise<DriveFileMeta>;
  download(fileId: string): Promise<string>;
  trash(fileId: string): Promise<void>;
}

/** What the last successful sync agreed on, per file. */
export interface SyncBaseline {
  driveId: string;
  /** Content hash both sides had. Anything else means "changed since". */
  syncedHash: string;
  syncedDriveModified: string;
}

export interface SyncManifest {
  version: 1;
  rootFolderId: string | null;
  folderName: string;
  account: string | null;
  /** Baselines only mean anything for the folder they were taken against. */
  dataDir: string | null;
  files: Record<string, SyncBaseline>;
  lastSync: string | null;
}

export interface ConflictNote {
  path: string;
  /** Relative path of the copy kept alongside the winner. */
  copy: string;
}

export interface SyncResult {
  pushed: string[];
  pulled: string[];
  /** Conflicts resolved by merging rows — nothing was lost. */
  merged: string[];
  /** Conflicts resolved by newest-wins, with the loser kept as a copy. */
  conflicted: ConflictNote[];
  deletedLocal: string[];
  deletedRemote: string[];
  /** Skipped this pass because the class is mid-lesson. */
  deferred: string[];
  errors: Array<{ path: string; message: string }>;
}

export function emptyResult(): SyncResult {
  return {
    pushed: [],
    pulled: [],
    merged: [],
    conflicted: [],
    deletedLocal: [],
    deletedRemote: [],
    deferred: [],
    errors: [],
  };
}

export function resultTouchedAnything(r: SyncResult): boolean {
  return (
    r.pushed.length > 0 ||
    r.pulled.length > 0 ||
    r.merged.length > 0 ||
    r.conflicted.length > 0 ||
    r.deletedLocal.length > 0 ||
    r.deletedRemote.length > 0
  );
}

/** Did this pass change anything on disk that the UI is showing? */
export function resultChangedLocalFiles(r: SyncResult): boolean {
  return r.pulled.length > 0 || r.merged.length > 0 || r.conflicted.length > 0 || r.deletedLocal.length > 0;
}
