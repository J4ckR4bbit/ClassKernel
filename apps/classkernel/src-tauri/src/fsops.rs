// The file operations behind the Tauri commands, kept free of Tauri so their
// tests run with a plain `rustc --test src-tauri/src/fsops.rs`.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

pub fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Temp files from an interrupted write end with this; copies skip them.
pub const TEMP_SUFFIX: &str = ".tmp.classkernel";

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Rename, retrying a few times: a virus scanner or sync client briefly
/// holding the file makes Windows refuse, and a moment later it succeeds.
/// (fs::rename already replaces an existing target on Windows.)
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut delay = 20;
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if attempt >= 4 => return Err(e),
            Err(_) => {
                std::thread::sleep(Duration::from_millis(delay));
                delay *= 2;
                attempt += 1;
            }
        }
    }
}

/// Write via a temp file beside the target, then rename over it, so a sync
/// client never sees half a file. Each temp name is unique, so even
/// overlapping writes never share one. If the rename keeps failing, the
/// target is left as it was and the temp (the new contents) stays on disk.
///
/// With a `root`, the write is refused when that folder is missing, rather
/// than re-creating it: a cloud drive that has gone away must not come back
/// as a near-empty twin of the real data folder.
pub fn write_via_temp(path: &str, bytes: &[u8], root: Option<&str>) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(root) = root {
        if !Path::new(root).is_dir() {
            return Err(format!("The data folder isn't available: {root}"));
        }
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = target.with_file_name(format!("{name}.{}-{n}{TEMP_SUFFIX}", std::process::id()));
    fs::write(&tmp, bytes).map_err(err)?;
    rename_with_retry(&tmp, &target).map_err(|e| format!("{path}: {e}"))
}

/// Copy every file under `src` into each of `dests`, reading each file once.
/// Folders named in `skip` (at any depth) and temp files are left out, and
/// each dest can leave out more folder names of its own (the local copy has
/// no use for exports/). Files are written atomically, so a crash never
/// leaves a half-written copy.
pub fn copy_tree(src: &Path, dests: &[(&Path, &[&str])], skip: &[&str]) -> Result<(), String> {
    for (dest, _) in dests {
        fs::create_dir_all(dest).map_err(err)?;
    }
    for entry in fs::read_dir(src).map_err(|e| format!("{}: {e}", src.display()))? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let src_path = entry.path();
        let file_type = entry.file_type().map_err(err)?;
        if file_type.is_dir() {
            if skip.contains(&name_str.as_ref()) {
                continue;
            }
            let sub: Vec<(PathBuf, &[&str])> = dests
                .iter()
                .filter(|(_, extra)| !extra.contains(&name_str.as_ref()))
                .map(|(d, extra)| (d.join(&name), *extra))
                .collect();
            if sub.is_empty() {
                continue;
            }
            let sub_refs: Vec<(&Path, &[&str])> = sub.iter().map(|(d, e)| (d.as_path(), *e)).collect();
            copy_tree(&src_path, &sub_refs, skip)?;
        } else if file_type.is_file() {
            if name_str.ends_with(TEMP_SUFFIX) {
                continue;
            }
            let bytes = fs::read(&src_path).map_err(|e| format!("{}: {e}", src_path.display()))?;
            for (dest, _) in dests {
                let to = dest.join(&name);
                write_via_temp(&to.to_string_lossy(), &bytes, None)?;
            }
        }
    }
    Ok(())
}

/// Remove whatever is in `dest` but not in `src` (files and folders), so a
/// refreshed copy matches its source exactly. Names in `skip` and `keep` are
/// left alone. A source `classes` folder that lists nothing while the copy has
/// classes looks like a cloud drive still filling in its listing, so nothing
/// under it is removed.
pub fn prune_extra(src: &Path, dest: &Path, skip: &[&str], keep: &[&str]) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dest) else { return Ok(()) };
    for entry in entries {
        let entry = entry.map_err(err)?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if skip.contains(&name_str.as_ref()) || keep.contains(&name_str.as_ref()) {
            continue;
        }
        let in_src = src.join(&name);
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if in_src.is_dir() {
                let src_empty = fs::read_dir(&in_src).map(|mut d| d.next().is_none()).unwrap_or(true);
                if name_str == "classes" && src_empty {
                    continue;
                }
                prune_extra(&in_src, &entry.path(), skip, &[])?;
            } else {
                fs::remove_dir_all(entry.path()).map_err(err)?;
            }
        } else if !in_src.is_file() {
            fs::remove_file(entry.path()).map_err(err)?;
        }
    }
    Ok(())
}

/// Whether `path` lies inside `base` (no `..` tricks). Used to keep the
/// delete command away from anything but the app's own local folder.
pub fn is_within(base: &Path, path: &Path) -> bool {
    !path.components().any(|c| matches!(c, Component::ParentDir)) && path.starts_with(base) && path != base
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let n = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("ck-fsops-{}-{name}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn put(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn writes_atomically_and_replaces_an_existing_file() {
        let d = scratch("write");
        let f = d.join("a.csv");
        write_via_temp(&f.to_string_lossy(), b"one", None).unwrap();
        write_via_temp(&f.to_string_lossy(), b"two", None).unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "two");
        let leftovers = fs::read_dir(&d).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().ends_with(TEMP_SUFFIX)).count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn refuses_to_recreate_a_missing_root() {
        let d = scratch("root");
        let root = d.join("ClassKernel");
        let f = root.join("classes").join("10A").join("marks.csv");
        let res = write_via_temp(&f.to_string_lossy(), b"x", Some(&root.to_string_lossy()));
        assert!(res.is_err());
        assert!(!root.exists());
        fs::create_dir_all(&root).unwrap();
        write_via_temp(&f.to_string_lossy(), b"x", Some(&root.to_string_lossy())).unwrap();
        assert_eq!(fs::read_to_string(&f).unwrap(), "x");
    }

    #[test]
    fn copies_once_into_a_backup_and_a_copy_with_their_own_skips() {
        let d = scratch("copy");
        let src = d.join("data");
        put(&src.join("behaviours.csv"), "b");
        put(&src.join("classes/10A/marks.csv"), "m");
        put(&src.join("exports/report.xlsx"), "x");
        put(&src.join("backups/2026-01-01_080000/old.csv"), "old");
        put(&src.join(format!("classes/10A/marks.csv.1-1{TEMP_SUFFIX}")), "half");
        let backup = src.join("backups").join("2026-02-02_080000");
        let copy = d.join("local-copy");
        copy_tree(&src, &[(&backup, &[]), (&copy, &["exports"])], &["backups"]).unwrap();
        assert_eq!(fs::read_to_string(backup.join("classes/10A/marks.csv")).unwrap(), "m");
        assert!(backup.join("exports/report.xlsx").exists());
        assert!(!backup.join("backups").exists());
        assert_eq!(fs::read_to_string(copy.join("behaviours.csv")).unwrap(), "b");
        assert!(!copy.join("exports").exists());
        assert!(!copy.join(format!("classes/10A/marks.csv.1-1{TEMP_SUFFIX}")).exists());
    }

    #[test]
    fn prunes_what_the_source_no_longer_has_but_keeps_listed_names() {
        let d = scratch("prune");
        let src = d.join("data");
        let copy = d.join("copy");
        put(&src.join("classes/10B/marks.csv"), "m");
        put(&copy.join("classes/10B/marks.csv"), "m");
        put(&copy.join("classes/10A/marks.csv"), "renamed away");
        put(&copy.join("classes/10B/stale.csv"), "s");
        put(&copy.join(".source.json"), "{}");
        prune_extra(&src, &copy, &["backups"], &[".source.json"]).unwrap();
        assert!(!copy.join("classes/10A").exists());
        assert!(!copy.join("classes/10B/stale.csv").exists());
        assert!(copy.join("classes/10B/marks.csv").exists());
        assert!(copy.join(".source.json").exists());
    }

    #[test]
    fn keeps_classes_when_the_source_lists_none_yet() {
        let d = scratch("partial");
        let src = d.join("data");
        let copy = d.join("copy");
        fs::create_dir_all(src.join("classes")).unwrap();
        put(&copy.join("classes/10A/marks.csv"), "m");
        prune_extra(&src, &copy, &[], &[]).unwrap();
        assert!(copy.join("classes/10A/marks.csv").exists());
    }

    #[test]
    fn is_within_only_allows_paths_below_the_base() {
        let base = Path::new("/app/local");
        assert!(is_within(base, Path::new("/app/local/offline-base")));
        assert!(!is_within(base, Path::new("/app/local")));
        assert!(!is_within(base, Path::new("/app/local/../data")));
        assert!(!is_within(base, Path::new("/data/ClassKernel")));
    }
}
