// Which backup snapshots to prune. Kept free of Tauri so its tests run with a
// plain `rustc --test src-tauri/src/backup_policy.rs`.
//
// Policy: every snapshot from today (the teacher may open the app several
// times a day), plus the newest snapshot from each of the `keep_days` most
// recent earlier days that have one. Counting days that have a snapshot,
// rather than calendar days, keeps two weeks of teaching history across a
// holiday. Folders that aren't YYYY-MM-DD_hhmmss stamps (e.g. the
// pre-restore-… safety copies) are never pruned.

/// A snapshot folder name: YYYY-MM-DD_hhmmss.
fn is_stamp(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() == 17
        && b.iter().enumerate().all(|(i, &c)| match i {
            4 | 7 => c == b'-',
            10 => c == b'_',
            _ => c.is_ascii_digit(),
        })
}

/// The snapshot names to delete. `today` is the date (YYYY-MM-DD) of the
/// snapshot just taken; stamps on or after it are always kept.
pub fn stamps_to_prune(stamps: &[String], today: &str, keep_days: usize) -> Vec<String> {
    let mut earlier: Vec<&String> = stamps
        .iter()
        .filter(|s| is_stamp(s) && &s[..10] < today)
        .collect();
    // Newest first, so the first stamp seen for a date is that day's newest.
    earlier.sort_by(|a, b| b.cmp(a));
    let mut kept_days: Vec<&str> = Vec::new();
    let mut prune = Vec::new();
    for s in earlier {
        let day = &s[..10];
        if kept_days.last() == Some(&day) {
            prune.push(s.clone());
        } else if kept_days.len() < keep_days {
            kept_days.push(day);
        } else {
            prune.push(s.clone());
        }
    }
    prune.sort();
    prune
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn keeps_every_snapshot_from_today() {
        let stamps = names(&["2026-03-10_080000", "2026-03-10_101500", "2026-03-10_140000"]);
        assert!(stamps_to_prune(&stamps, "2026-03-10", 14).is_empty());
    }

    #[test]
    fn keeps_only_the_newest_of_each_earlier_day() {
        let stamps = names(&["2026-03-09_080000", "2026-03-09_120000", "2026-03-09_160000", "2026-03-10_080000"]);
        assert_eq!(
            stamps_to_prune(&stamps, "2026-03-10", 14),
            names(&["2026-03-09_080000", "2026-03-09_120000"])
        );
    }

    #[test]
    fn keeps_the_most_recent_days_that_have_a_snapshot() {
        // Days 1..=5 each have one snapshot; keep the newest 3 earlier days.
        let stamps = names(&[
            "2026-03-01_080000",
            "2026-03-02_080000",
            "2026-03-03_080000",
            "2026-03-04_080000",
            "2026-03-05_080000",
            "2026-03-06_080000",
        ]);
        assert_eq!(
            stamps_to_prune(&stamps, "2026-03-06", 3),
            names(&["2026-03-01_080000", "2026-03-02_080000"])
        );
    }

    #[test]
    fn a_holiday_gap_does_not_shorten_the_history() {
        let stamps = names(&["2026-03-20_080000", "2026-06-01_080000", "2026-07-15_080000"]);
        assert!(stamps_to_prune(&stamps, "2026-07-15", 2).is_empty());
    }

    #[test]
    fn never_prunes_other_folders_or_future_stamps() {
        let stamps = names(&["pre-restore-2026-01-01_080000", "notes", "2026-03-11_080000", "2026-01-01_080000"]);
        assert_eq!(stamps_to_prune(&stamps, "2026-03-10", 0), names(&["2026-01-01_080000"]));
    }

    #[test]
    fn recognises_stamps() {
        assert!(is_stamp("2026-03-10_080000"));
        assert!(!is_stamp("2026-03-10"));
        assert!(!is_stamp("2026-03-10-080000"));
        assert!(!is_stamp("pre-restore-x"));
    }
}
