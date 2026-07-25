// File-system commands for the frontend. Everything the app writes goes
// through write_atomic so a cloud-sync client (OneDrive/Google Drive) never
// observes a half-written file, and snapshot_backup keeps rolling copies of
// the whole data folder.
//
// The Google Drive commands at the bottom are the only ones that touch the
// network. They live in Rust because the webview's CSP has no connect-src, so
// the frontend cannot make outbound requests — which also keeps the OAuth
// access token out of JavaScript entirely.

mod drive;
mod google_auth;

use google_auth::{AccountInfo, AuthState};
use md5::{Digest, Md5};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_atomic(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = target.with_extension("tmp.classkernel");
    fs::write(&tmp, contents.as_bytes()).map_err(err)?;
    // On Windows, rename fails if the target exists; fall back to
    // remove-then-rename (the temp file already holds the full contents, so
    // the window where neither file exists is tiny and covered by backups).
    match fs::rename(&tmp, &target) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = fs::remove_file(&target);
            fs::rename(&tmp, &target).map_err(err)
        }
    }
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn mkdirs(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(err)
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
        let entry = entry.map_err(err)?;
        out.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    Ok(out)
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(err)
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        // Already gone is the outcome the caller wanted.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("{path}: {e}")),
    }
}

#[derive(Serialize)]
pub struct FileStat {
    /// MD5, to compare directly against Drive's md5Checksum.
    hash: String,
    #[serde(rename = "modifiedMs")]
    modified_ms: u64,
}

#[tauri::command]
fn file_stat(path: String) -> Result<FileStat, String> {
    let bytes = fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    let modified_ms = fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(FileStat {
        hash: format!("{:x}", Md5::digest(&bytes)),
        modified_ms,
    })
}

/// Per-user config directory, created on demand. Sync state and the optional
/// OAuth client override live here rather than in the data folder, which is
/// meant to stay plain .csv/.md the teacher can open in Excel.
pub fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config directory available: {e}"))?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

#[tauri::command]
fn config_path(app: tauri::AppHandle, name: String) -> Result<String, String> {
    // Guard against a caller escaping the config directory.
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Invalid config file name: {name}"));
    }
    Ok(config_dir(&app)?.join(name).to_string_lossy().into_owned())
}

fn copy_dir_recursive(src: &Path, dest: &Path, skip_dir_name: &str) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(err)?;
    for entry in fs::read_dir(src).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name();
        let src_path = entry.path();
        let dest_path = dest.join(&name);
        let file_type = entry.file_type().map_err(err)?;
        if file_type.is_dir() {
            if name.to_string_lossy() == skip_dir_name {
                continue;
            }
            copy_dir_recursive(&src_path, &dest_path, skip_dir_name)?;
        } else if file_type.is_file() {
            // Skip leftover temp files from interrupted atomic writes.
            if name.to_string_lossy().ends_with(".tmp.classkernel") {
                continue;
            }
            fs::copy(&src_path, &dest_path).map_err(err)?;
        }
    }
    Ok(())
}

/// Copy the data folder (minus backups/) into backups/<stamp>/ and prune the
/// oldest snapshots beyond `keep`. Stamps sort lexicographically by design
/// (YYYY-MM-DD_HHMMSS), so pruning is a plain sort.
#[tauri::command]
fn snapshot_backup(data_dir: String, stamp: String, keep: u32) -> Result<String, String> {
    let root = PathBuf::from(&data_dir);
    if !root.is_dir() {
        return Err(format!("Not a folder: {data_dir}"));
    }
    let backups = root.join("backups");
    let dest = backups.join(&stamp);
    copy_dir_recursive(&root, &dest, "backups")?;

    let mut stamps: Vec<String> = fs::read_dir(&backups)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    stamps.sort();
    while stamps.len() > keep as usize {
        let oldest = stamps.remove(0);
        let _ = fs::remove_dir_all(backups.join(oldest));
    }
    Ok(dest.to_string_lossy().into_owned())
}

// ---------- Google Drive ----------
//
// Thin wrappers: the sync engine itself lives in TypeScript (src/lib/sync),
// where the CSV schema knowledge already is and where it can be unit-tested
// against an in-memory filesystem.

#[tauri::command]
fn google_account(app: tauri::AppHandle, state: tauri::State<'_, AuthState>) -> AccountInfo {
    google_auth::account_info(&app, &state)
}

#[tauri::command]
async fn google_sign_in(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
) -> Result<String, String> {
    google_auth::sign_in(&app, &state).await
}

#[tauri::command]
async fn google_sign_out(state: tauri::State<'_, AuthState>) -> Result<(), String> {
    google_auth::sign_out(&state).await;
    Ok(())
}

#[tauri::command]
async fn drive_ensure_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    name: String,
) -> Result<drive::DriveFileMeta, String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::ensure_root_folder(&token, &name).await
}

#[tauri::command]
async fn drive_list_tree(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    root_id: String,
) -> Result<Vec<drive::DriveFileMeta>, String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::list_tree(&token, &root_id).await
}

#[tauri::command]
async fn drive_create_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    name: String,
    parent_id: String,
    rel_path: String,
    root_id: String,
) -> Result<drive::DriveFileMeta, String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::create_folder(&token, &name, &parent_id, &rel_path, &root_id).await
}

#[tauri::command]
async fn drive_upload(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    file_id: Option<String>,
    name: String,
    parent_id: String,
    rel_path: String,
    root_id: String,
    content: String,
) -> Result<drive::DriveFileMeta, String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::upload(
        &token,
        file_id.as_deref(),
        &name,
        &parent_id,
        &rel_path,
        &root_id,
        &content,
    )
    .await
}

#[tauri::command]
async fn drive_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    file_id: String,
) -> Result<String, String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::download(&token, &file_id).await
}

#[tauri::command]
async fn drive_trash(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthState>,
    file_id: String,
) -> Result<(), String> {
    let token = google_auth::access_token(&app, &state).await?;
    drive::trash(&token, &file_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AuthState::default())
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_atomic,
            path_exists,
            mkdirs,
            list_dir,
            rename_path,
            remove_file,
            file_stat,
            config_path,
            snapshot_backup,
            google_account,
            google_sign_in,
            google_sign_out,
            drive_ensure_root,
            drive_list_tree,
            drive_create_folder,
            drive_upload,
            drive_download,
            drive_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
