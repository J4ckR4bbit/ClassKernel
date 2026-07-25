// Frontend side of the Google integration: thin wrappers over the Rust
// commands. No HTTP happens here — the webview's CSP has no connect-src, and
// the access token never leaves Rust.

import { isTauri } from "../fs";
import { DriveClient, DriveFileMeta, UploadArgs } from "../sync/types";

export interface GoogleAccount {
  email: string | null;
  /** A refresh token is stored, so the app can sync without asking again. */
  connected: boolean;
  /** This build has an OAuth client baked in. */
  configured: boolean;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(cmd, args);
}

export async function googleAccount(): Promise<GoogleAccount> {
  if (!isTauri()) return { email: null, connected: false, configured: false };
  return invoke<GoogleAccount>("google_account");
}

/** Runs the consent flow in the system browser. Resolves with the email. */
export function googleSignIn(): Promise<string> {
  return invoke<string>("google_sign_in");
}

export function googleSignOut(): Promise<void> {
  return invoke<void>("google_sign_out");
}

export const tauriDrive: DriveClient = {
  ensureRoot(name) {
    return invoke<DriveFileMeta>("drive_ensure_root", { name });
  },
  listTree(rootId) {
    return invoke<DriveFileMeta[]>("drive_list_tree", { rootId });
  },
  createFolder(name, parentId, relPath, rootId) {
    return invoke<DriveFileMeta>("drive_create_folder", { name, parentId, relPath, rootId });
  },
  upload(args: UploadArgs) {
    return invoke<DriveFileMeta>("drive_upload", {
      fileId: args.fileId ?? null,
      name: args.name,
      parentId: args.parentId,
      relPath: args.relPath,
      rootId: args.rootId,
      content: args.content,
    });
  },
  download(fileId) {
    return invoke<string>("drive_download", { fileId });
  },
  trash(fileId) {
    return invoke<void>("drive_trash", { fileId });
  },
};
