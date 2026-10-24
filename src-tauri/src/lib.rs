// File-system commands for the frontend. Everything the app writes goes
// through write_atomic so a cloud-sync client (OneDrive/Google Drive) never
// observes a half-written file, and snapshot_backup keeps rolling copies of
// the whole data folder (and, optionally, this computer's own copy of it).
//
// Every command is async and does its file work on Tauri's blocking pool, so
// a slow disk or a cloud drive that hangs never freezes the window or holds up
// other saves. The frontend queues writes per file (src/lib/fs.ts), so two
// writes to one file never overlap.

mod backup_policy;
mod fsops;

use fsops::{copy_tree, err, is_within, prune_extra, write_via_temp};
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

/// Run file work on the blocking pool, off the async workers.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(err)?
}

#[tauri::command]
async fn read_text(path: String) -> Result<String, String> {
    blocking(move || fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))).await
}

/// read_text for a file that may not exist yet: one round trip instead of
/// path_exists + read_text. Any error other than "not found" is an error, so
/// a cloud file that can't be read is never mistaken for a missing one.
#[tauri::command]
async fn read_text_opt(path: String) -> Result<Option<String>, String> {
    blocking(move || match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{path}: {e}")),
    })
    .await
}

/// `root`, when given, is the folder the file belongs in; the write is refused
/// if it has gone (see fsops::write_via_temp).
#[tauri::command]
async fn write_atomic(path: String, contents: String, root: Option<String>) -> Result<(), String> {
    blocking(move || write_via_temp(&path, contents.as_bytes(), root.as_deref())).await
}

/// Same as write_atomic, for generated binaries (spreadsheet exports). The
/// target may be anywhere the user picked in the save dialog, not just the
/// data folder.
#[tauri::command]
async fn write_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    blocking(move || write_via_temp(&path, &bytes, None)).await
}

#[tauri::command]
async fn path_exists(path: String) -> bool {
    blocking(move || Ok(Path::new(&path).exists())).await.unwrap_or(false)
}

#[tauri::command]
async fn mkdirs(path: String) -> Result<(), String> {
    blocking(move || fs::create_dir_all(&path).map_err(err)).await
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    blocking(move || {
        let mut out = Vec::new();
        for entry in fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
            let entry = entry.map_err(err)?;
            out.push(DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
            });
        }
        Ok(out)
    })
    .await
}

#[tauri::command]
async fn rename_path(from: String, to: String) -> Result<(), String> {
    blocking(move || fs::rename(&from, &to).map_err(err)).await
}

/// Copy the data folder (minus backups/) into backups/<stamp>/ and prune old
/// snapshots: every one from today is kept, plus the newest from each of the
/// `keep` most recent earlier days (see backup_policy.rs).
///
/// With `copy_to`, the same pass also refreshes this computer's copy of the
/// data folder (without exports/), file by file, then removes what the folder
/// no longer has. It is skipped while `copy_guard` exists: that marker means
/// the copy holds changes not yet copied back, which a refresh would lose.
#[tauri::command]
async fn snapshot_backup(
    data_dir: String,
    stamp: String,
    keep: u32,
    copy_to: Option<String>,
    copy_guard: Option<String>,
) -> Result<String, String> {
    blocking(move || {
        let root = PathBuf::from(&data_dir);
        if !root.is_dir() {
            return Err(format!("Not a folder: {data_dir}"));
        }
        let backups = root.join("backups");
        let dest = backups.join(&stamp);
        let guarded = copy_guard.as_deref().map(|g| Path::new(g).exists()).unwrap_or(false);
        let copy = copy_to.filter(|_| !guarded).map(PathBuf::from);
        const COPY_SKIP: &[&str] = &["exports"];
        match &copy {
            Some(copy) => {
                copy_tree(&root, &[(&dest, &[]), (copy, COPY_SKIP)], &["backups"])?;
                prune_extra(&root, copy, &["backups", "exports"], &[".source.json"])?;
            }
            None => copy_tree(&root, &[(&dest, &[])], &["backups"])?,
        }

        let stamps: Vec<String> = fs::read_dir(&backups)
            .map_err(err)?
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        let today = stamp.get(..10).unwrap_or(stamp.as_str());
        for old in backup_policy::stamps_to_prune(&stamps, today, keep as usize) {
            let _ = fs::remove_dir_all(backups.join(old));
        }
        Ok(dest.to_string_lossy().into_owned())
    })
    .await
}

/// Copy a folder (minus `skip` folder names) to `dest`, replacing what was
/// there. Only for folders inside the app's own local data folder, e.g.
/// keeping the copy as it was when Google Drive went missing.
#[tauri::command]
async fn copy_folder(app: tauri::AppHandle, src: String, dest: String, skip: Vec<String>) -> Result<(), String> {
    let base = app.path().app_local_data_dir().map_err(err)?;
    blocking(move || {
        let dest = PathBuf::from(dest);
        if !is_within(&base, &dest) {
            return Err(format!("Not in the app's local folder: {}", dest.display()));
        }
        if dest.exists() {
            fs::remove_dir_all(&dest).map_err(err)?;
        }
        let skip: Vec<&str> = skip.iter().map(String::as_str).collect();
        copy_tree(Path::new(&src), &[(&dest, &[])], &skip)
    })
    .await
}

/// Delete a file or folder inside the app's own local data folder (this
/// computer's copy and its bookkeeping); anything else is refused, so this
/// can never touch the data folder itself.
#[tauri::command]
async fn remove_local(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let base = app.path().app_local_data_dir().map_err(err)?;
    blocking(move || {
        let target = PathBuf::from(&path);
        if !is_within(&base, &target) {
            return Err(format!("Not in the app's local folder: {path}"));
        }
        match fs::metadata(&target) {
            Ok(m) if m.is_dir() => fs::remove_dir_all(&target).map_err(err),
            Ok(_) => fs::remove_file(&target).map_err(err),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(err(e)),
        }
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch (say, during the wait for Google Drive)
        // brings the open window forward instead of starting another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        // The window opens hidden (tauri.conf.json) and the page shows it once
        // it has drawn in the right colours, so a dark theme doesn't flash
        // white. Should the page never get that far, show it anyway.
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            read_text_opt,
            write_atomic,
            write_binary,
            path_exists,
            mkdirs,
            list_dir,
            rename_path,
            snapshot_backup,
            copy_folder,
            remove_local
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
