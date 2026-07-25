import { useState } from "react";
import { useApp } from "../store/appStore";

/** Google Drive sync panel in Settings: connect, status, conflicts, disconnect. */
export default function GoogleDriveSettings() {
  const {
    driveConfigured,
    driveConnected,
    driveEmail,
    driveFolderName,
    syncStatus,
    syncLastAt,
    syncError,
    syncConflicts,
    connectDrive,
    disconnectDrive,
    syncNow,
    dismissSyncConflicts,
    confirmDialog,
    showToast,
    demoMode,
  } = useApp();
  const [folderName, setFolderName] = useState(driveFolderName);
  const [busy, setBusy] = useState(false);

  if (demoMode) return null;

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: "Disconnect Google Drive?",
      body: `ClassKernel will stop syncing and forget your sign-in. Your data stays on this PC, and the "${driveFolderName}" folder stays in your Drive — nothing is deleted.`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await disconnectDrive();
      showToast("Disconnected from Google Drive");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      if (await connectDrive(folderName)) showToast("Connected — first sync started");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Google Drive sync</h3>

      {!driveConfigured && !driveConnected ? (
        <p className="muted">
          Not available in this build — Drive sync needs a Google client configured when the app is
          built. See <code>docs/google-drive-setup.md</code>.
        </p>
      ) : !driveConnected ? (
        <>
          <p className="muted">
            Optional. Sign in once and ClassKernel keeps a folder in your Google Drive in step with
            this PC, so your data is backed up off this machine and reachable from other devices.
            ClassKernel can only see the files it creates there — nothing else in your Drive.
          </p>
          <div className="row">
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name in your Drive"
            />
            <button className="primary" disabled={busy} onClick={() => void connect()}>
              {busy ? "Waiting for Google…" : "Connect Google Drive"}
            </button>
          </div>
          {syncError && <p className="sync-error-text">{syncError}</p>}
        </>
      ) : (
        <>
          <p>
            Connected as <b>{driveEmail ?? "your Google account"}</b>, syncing to{" "}
            <code>{driveFolderName}</code> in My Drive.
          </p>
          <p className="muted">
            {syncStatus === "syncing"
              ? "Syncing now…"
              : syncLastAt
                ? `Last synced ${new Date(syncLastAt).toLocaleString()}.`
                : "Not synced yet."}
          </p>
          {syncError && <p className="sync-error-text">{syncError}</p>}

          {syncConflicts.length > 0 && (
            <>
              <p className="muted">
                These files were changed on two devices before they could sync. The newer version is
                in place; the other was kept next to it so nothing is lost. Registers, mark sheets
                and behaviour logs are merged row by row instead, so they never appear here.
              </p>
              <ul className="backup-list">
                {syncConflicts.map((c) => (
                  <li key={c.copy}>
                    <code>{c.path}</code>
                    <span className="muted">kept as {c.copy.split("/").pop()}</span>
                  </li>
                ))}
              </ul>
              <button className="small" onClick={dismissSyncConflicts}>
                Dismiss
              </button>
            </>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={busy || syncStatus === "syncing"} onClick={() => void syncNow()}>
              Sync now
            </button>
            <button className="danger" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
