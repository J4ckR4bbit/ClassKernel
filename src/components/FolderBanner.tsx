import { useAppPick } from "../store/appStore";
import { dateTimeInZone } from "../lib/time";
import Icon from "./Icon";

const when = (iso: string) => (iso ? dateTimeInZone(iso) : "");

/**
 * Above every page while the app works from this computer's copy of the data:
 * how old the copy is, and (once the folder is back) a button to copy the
 * changes back now. After a copy-back, what it did, until dismissed.
 */
export function FolderBanner() {
  const { folderStatus, syncNow, syncReport, dismissSyncReport } = useAppPick(
    "folderStatus",
    "syncNow",
    "syncReport",
    "dismissSyncReport",
  );

  if (folderStatus?.kind === "copy") {
    return (
      <div className="folder-banner" role="status">
        <Icon name="cloud_off" size={20} />
        <div className="grow">
          {folderStatus.back ? (
            <>
              <b>Your data folder is back.</b> This computer's changes are copied into it in a moment (once it has
              settled, and never during teaching mode) — or now.
            </>
          ) : (
            <>
              <b>Your data folder isn't available</b> (<code>{folderStatus.realDir}</code>) — you're working from this
              computer's copy
              {folderStatus.copyRefreshedAt && <>, last updated from the folder {when(folderStatus.copyRefreshedAt)}</>}.
              Changes made on other computers since then aren't shown. Everything you do is copied back when the folder
              returns.
            </>
          )}
        </div>
        {folderStatus.back && (
          <button className="small primary" onClick={() => void syncNow()}>
            Copy my changes back now
          </button>
        )}
      </div>
    );
  }

  if (!syncReport) return null;
  const { copied, joined, clashes, keptAside, notes, backupDir } = syncReport;
  const changed = copied.length + joined.length;
  const needsALook = clashes.length > 0 || keptAside.length > 0 || notes.length > 0;
  return (
    <div className={`folder-banner ${needsALook ? "attention" : "done"}`} role="status">
      <Icon name={needsALook ? "info" : "check"} size={20} />
      <div className="grow">
        <b>This computer's changes are back in your data folder</b>
        {changed > 0 && (
          <>
            {" "}
            — {changed} file{changed === 1 ? "" : "s"}
            {joined.length > 0 && <>, {joined.length} joined with changes made on another computer</>}.
          </>
        )}
        {needsALook && (
          <ul className="sync-notes">
            {clashes.slice(0, 6).map(({ file, clash }, i) => (
              <li key={`c${i}`}>
                Changed in both places — <b>{clash.what}</b> in {file}: kept this computer's “{clash.ours}”, not “
                {clash.theirs}”.
              </li>
            ))}
            {clashes.length > 6 && <li>…and {clashes.length - 6} more changed in both places.</li>}
            {keptAside.map(({ file, reason }) => (
              <li key={file}>
                Not copied: {file}, because {reason}.
              </li>
            ))}
            {notes.map((n, i) => (
              <li key={`n${i}`}>{n}</li>
            ))}
          </ul>
        )}
        <div className="muted">
          Both versions of every file it touched are kept in <code>{backupDir.replace(/^.*?(backups\/)/, "$1")}</code>.
        </div>
      </div>
      <button className="small" onClick={dismissSyncReport}>
        Dismiss
      </button>
    </div>
  );
}

/** Blocks the screen for the few seconds the copy-back takes, so nothing is changed halfway through. */
export function SyncOverlay() {
  const { folderStatus } = useAppPick("folderStatus");
  if (folderStatus?.kind !== "syncing") return null;
  return (
    <div className="sync-overlay" role="alertdialog" aria-live="assertive" aria-label="Copying your changes">
      <div className="panel">
        <Icon name="cloud_sync" size={32} />
        <p>Copying this computer's changes to your data folder…</p>
      </div>
    </div>
  );
}

/** In teaching mode the banner would cover the room: a small chip in the corner says the same. */
export function CopyChip() {
  const { folderStatus } = useAppPick("folderStatus");
  if (folderStatus?.kind !== "copy") return null;
  return (
    <div
      className="copy-chip no-print"
      role="status"
      title={
        folderStatus.back
          ? "Your data folder is back: this computer's changes are copied into it when you leave teaching mode."
          : "Your data folder isn't available: you're working from this computer's copy. Your changes are copied back when it returns."
      }
    >
      <Icon name={folderStatus.back ? "cloud_sync" : "cloud_off"} size={18} />
      {folderStatus.back ? "Folder back — copied when you leave teaching mode" : "This computer's copy"}
    </div>
  );
}
