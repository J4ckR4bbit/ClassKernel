import { useEffect, useState } from "react";
import { WAIT_FOR_FOLDER_MS, keepLocalCopy, useApp, useAppPick } from "../../store/appStore";
import * as repo from "../../lib/repo";
import { backupStamp } from "../../lib/id";

/** The Data panel: where the data folder is, this computer's copy, and restoring a backup. */
export default function DataSettings() {
  const { dataDir, pickAndSetDataDir, classes, showToast, confirmDialog, chooseDataDir, folderStatus } = useAppPick(
    "dataDir",
    "pickAndSetDataDir",
    "classes",
    "showToast",
    "confirmDialog",
    "chooseDataDir",
    "folderStatus",
  );
  // While the data folder is away, dataDir is this computer's copy.
  const awayFrom = folderStatus?.kind === "copy" || folderStatus?.kind === "syncing" ? folderStatus.realDir : null;

  return (
    <div className="panel">
      <h3>Data</h3>
      <div className="row">
        <span>
          Data folder: <code>{awayFrom ?? dataDir}</code>
          {awayFrom && <span className="muted"> — not available; working from this computer's copy</span>}
        </span>
        <button
          onClick={() => void pickAndSetDataDir()}
          title={awayFrom ? "If your data folder has moved (say, to another drive letter), choose it: this computer's changes are copied into it" : undefined}
        >
          {awayFrom ? "My data folder is somewhere else…" : "Change data folder…"}
        </button>
      </div>
      <p className="muted">
        Everything lives in plain .csv / .md files in that folder — open them in Excel or Notepad any time. Put the
        folder inside OneDrive or Google Drive and the sync client backs it up automatically. A snapshot copy is
        made into <code>backups/</code> every time the app starts: all of today's are kept, plus the last one from each of
        the 14 most recent earlier days the app was used.
      </p>
      <p className="muted">
        Student information (names, flags, notes, marks) is stored in these files as plain, readable text — treat
        the folder like a paper mark book and follow your school's data-handling policy for where it lives.
      </p>
      <p className="muted">
        Classes: {classes.filter((c) => !c.archived).length} active, {classes.filter((c) => c.archived).length}{" "}
        archived. Archived classes stay on disk in <code>classes/</code>; restore them from Class notes.
      </p>
      <LocalCopySettings away={!!awayFrom} />
      {awayFrom ? (
        <p className="muted">Restoring a backup is available again once your data folder is back.</p>
      ) : (
        <BackupRestore dataDir={dataDir} onRestore={chooseDataDir} confirmDialog={confirmDialog} showToast={showToast} />
      )}
    </div>
  );
}

/**
 * This computer's own copy of the data folder, used when the folder isn't
 * there at launch (see lib/offline.ts). On by default; it holds the same
 * student information, so a shared computer can switch it off.
 */
function LocalCopySettings({ away }: { away: boolean }) {
  const { setKeepLocalCopy, confirmDialog, showToast } = useAppPick("setKeepLocalCopy", "confirmDialog", "showToast");
  const [keep, setKeep] = useState(keepLocalCopy);
  const toggle = async (on: boolean) => {
    if (!on) {
      const ok = await confirmDialog({
        title: "Remove this computer's copy?",
        body: "If your data folder isn't there when ClassKernel starts, you'll be asked to choose it again instead of carrying on from the copy.",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
    }
    setKeep(on);
    await setKeepLocalCopy(on);
    showToast(on ? "This computer now keeps a copy of your data" : "This computer's copy removed");
  };
  return (
    <>
      <label className="pref-row">
        <input type="checkbox" className="switch" checked={keep} disabled={away} onChange={(e) => void toggle(e.target.checked)} />
        <span>
          <b>Keep a copy on this computer</b> — if your data folder isn't there when ClassKernel starts (Google Drive or
          OneDrive still starting), it waits {Math.round(WAIT_FOR_FOLDER_MS / 1000)} seconds, then carries on from this
          copy and copies your changes back when the folder returns. The copy holds the same student information as the
          folder: on a computer other people sign in to, switch it off.
        </span>
      </label>
    </>
  );
}

/** List of snapshot backups with one-tap restore (a safety copy is taken first). */
function BackupRestore({
  dataDir,
  onRestore,
  confirmDialog,
  showToast,
}: {
  dataDir: string | null;
  onRestore: (path: string) => Promise<void>;
  confirmDialog: ReturnType<typeof useApp.getState>["confirmDialog"];
  showToast: (message: string) => void;
}) {
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dataDir) void repo.listBackups(dataDir).then(setBackups);
  }, [dataDir]);

  if (!dataDir || backups.length === 0) return null;

  const restore = async (stamp: string) => {
    const ok = await confirmDialog({
      title: `Restore the backup from ${stamp.replace("_", " at ").replace(/(\d{2})(\d{2})(\d{2})$/, "$1:$2")}?`,
      body: "All current files are replaced with the backup's copies (anything created since the backup is kept). A safety copy of today's data is made first.",
      confirmLabel: "Restore backup",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await repo.restoreBackup(dataDir, stamp, `pre-restore-${backupStamp()}`);
      await onRestore(dataDir);
      showToast("Backup restored");
    } catch (e) {
      console.error("Restore failed", e);
      showToast("Restore failed — the backup files may be missing");
    } finally {
      setBusy(false);
      void repo.listBackups(dataDir).then(setBackups);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <b>Restore a backup</b>
      <ul className="backup-list">
        {backups.slice(0, 8).map((b) => (
          <li key={b}>
            <span className="muted">{b.replace("_", " · ")}</span>
            <button className="small" disabled={busy} onClick={() => void restore(b)}>
              Restore…
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
