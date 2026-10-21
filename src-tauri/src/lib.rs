// File-system commands for the frontend. Everything the app writes goes
// through write_atomic so a cloud-sync client (OneDrive/Google Drive) never
// observes a half-written file, and snapshot_backup keeps rolling copies of
// the whole data folder.
//
// Every command is `async` so Tauri runs it on a worker thread: a slow disk or
// a cloud-sync driver never freezes the window. The frontend queues writes per
// file (src/lib/fs.ts), so two writes to one file never overlap.

mod backup_policy;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Serialize)]
pub struct DirEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command(async)]
fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// read_text for a file that may not exist yet: one round trip instead of
/// path_exists + read_text.
#[tauri::command(async)]
fn read_text_opt(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{path}: {e}")),
    }
}

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Write via a temp file beside the target, then rename over it. Each temp
/// name is unique, so even overlapping writes never share one.
fn write_via_temp(path: &str, bytes: &[u8]) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = target.with_file_name(format!("{name}.{}-{n}.tmp.classkernel", std::process::id()));
    fs::write(&tmp, bytes).map_err(err)?;
    // On Windows, rename fails if the target exists; fall back to
    // remove-then-rename (the temp file already holds the full contents, so
    // the window where neither file exists is tiny and covered by backups).
    match fs::rename(&tmp, &target) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = fs::remove_file(&target);
            fs::rename(&tmp, &target).map_err(|e| {
                let _ = fs::remove_file(&tmp);
                err(e)
            })
        }
    }
}

#[tauri::command(async)]
fn write_atomic(path: String, contents: String) -> Result<(), String> {
    write_via_temp(&path, contents.as_bytes())
}

/// Same as write_atomic, for generated binaries (spreadsheet exports). The
/// target may be anywhere the user picked in the save dialog, not just the
/// data folder.
#[tauri::command(async)]
fn write_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    write_via_temp(&path, &bytes)
}

#[tauri::command(async)]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command(async)]
fn mkdirs(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(err)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(err)
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

/// Copy the data folder (minus backups/) into backups/<stamp>/ and prune old
/// snapshots: every one from today is kept, plus the newest from each of the
/// `keep` most recent earlier days (see backup_policy.rs).
#[tauri::command(async)]
fn snapshot_backup(data_dir: String, stamp: String, keep: u32) -> Result<String, String> {
    let root = PathBuf::from(&data_dir);
    if !root.is_dir() {
        return Err(format!("Not a folder: {data_dir}"));
    }
    let backups = root.join("backups");
    let dest = backups.join(&stamp);
    copy_dir_recursive(&root, &dest, "backups")?;

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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text,
            read_text_opt,
            write_atomic,
            write_binary,
            path_exists,
            mkdirs,
            list_dir,
            rename_path,
            snapshot_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
