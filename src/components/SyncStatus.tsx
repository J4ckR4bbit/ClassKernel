import { useApp } from "../store/appStore";

/** Relative time, kept vague on purpose — "4 min ago" is all anyone needs. */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Compact Drive sync indicator for the sidebar footer. */
export default function SyncStatus() {
  const { driveConnected, syncStatus, syncLastAt, syncError, syncConflicts, syncNow, setView } = useApp();
  if (!driveConnected) return null;

  const conflicts = syncConflicts.length;
  const label =
    syncStatus === "syncing"
      ? "Syncing…"
      : syncStatus === "error"
        ? "Sync problem"
        : conflicts > 0
          ? `${conflicts} to review`
          : `Synced ${ago(syncLastAt)}`;
  const tone = syncStatus === "error" ? "bad" : conflicts > 0 ? "warn" : "ok";

  return (
    <div className="sync-pill-wrap">
      <button
        className={`sync-pill ${tone}`}
        title={syncError ?? "Google Drive sync — click to open Settings"}
        onClick={() => setView("settings")}
      >
        <span className={`sync-dot ${syncStatus === "syncing" ? "spin" : ""}`} />
        {label}
      </button>
      <button
        className="small"
        disabled={syncStatus === "syncing"}
        onClick={() => void syncNow()}
        title="Check Google Drive now"
      >
        Sync
      </button>
    </div>
  );
}
