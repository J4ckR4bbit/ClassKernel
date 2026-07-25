import { useState } from "react";
import { useApp } from "../store/appStore";
import { isTauri } from "../lib/fs";
import { DEFAULT_FOLDER_NAME } from "../lib/sync/service";

type Step = "choose" | "google" | "folder";
type Mode = "local" | "drive";

export default function Onboarding() {
  const {
    chooseDataDir,
    pickAndSetDataDir,
    connectDrive,
    driveConfigured,
    driveConnected,
    driveEmail,
    driveFolderName,
    syncError,
  } = useApp();
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<Mode>("local");
  // Already signed in (a reinstall, or a folder change) — keep the folder the
  // existing connection actually uses rather than resetting it to the default.
  const [folderName, setFolderName] = useState(driveConnected ? driveFolderName : DEFAULT_FOLDER_NAME);
  const [manualPath, setManualPath] = useState("");
  const [busy, setBusy] = useState(false);

  const useManual = async () => {
    if (!manualPath.trim()) return;
    setBusy(true);
    try {
      await chooseDataDir(manualPath.trim());
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    try {
      if (await connectDrive(folderName)) setStep("folder");
    } finally {
      setBusy(false);
    }
  };

  // Step 1 — how should data be stored? The local-only path stays one click
  // away, exactly as it was before Drive sync existed.
  if (step === "choose") {
    return (
      <Shell>
        <h2>Welcome to ClassKernel</h2>
        <p className="muted">
          Your classroom data is stored as plain <b>.csv</b> and <b>.md</b> files on this PC. How
          would you like to keep it?
        </p>
        <div className="onboard-choices">
          <button
            className="onboard-choice"
            onClick={() => {
              setMode("local");
              setStep("folder");
            }}
          >
            <b>This PC only</b>
            <span className="muted">
              No account, no internet, nothing to configure. You can turn on Google Drive later in
              Settings.
            </span>
          </button>
          <button
            className="onboard-choice"
            disabled={!driveConfigured}
            onClick={() => {
              setMode("drive");
              setStep(driveConnected ? "folder" : "google");
            }}
          >
            <b>This PC + Google Drive</b>
            <span className="muted">
              Sign in once and ClassKernel keeps a folder in your Drive in step with this PC — so
              your data is backed up, and available to other devices later.
            </span>
          </button>
        </div>
        {!driveConfigured && (
          <p className="muted hint-text">
            Google Drive sync isn't available in this build — it needs a Google client configured at
            build time (see docs/google-drive-setup.md).
          </p>
        )}
      </Shell>
    );
  }

  // Step 2 — sign in to Google and name the Drive folder.
  if (step === "google") {
    return (
      <Shell>
        <h2>Connect Google Drive</h2>
        <p className="muted">
          ClassKernel will create a folder in your Google Drive and keep it in step with this PC. It
          can only see the files it creates there — nothing else in your Drive.
        </p>
        <label className="field-label" style={{ display: "block", marginBottom: 4 }}>
          Folder name in your Drive
        </label>
        <input value={folderName} onChange={(e) => setFolderName(e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" disabled={busy} onClick={() => void signIn()}>
            {busy ? "Waiting for Google…" : "Sign in with Google"}
          </button>
          <button disabled={busy} onClick={() => setStep("choose")}>
            Back
          </button>
        </div>
        {busy && <p className="muted hint-text">Finish signing in in your browser, then come back here.</p>}
        {syncError && <p className="sync-error-text">{syncError}</p>}
      </Shell>
    );
  }

  // Step 3 — pick the folder on this PC. Local stays the working copy in both
  // modes: it is what makes the app instant and usable with no network.
  return (
    <Shell>
      <h2>Choose your data folder</h2>
      {mode === "drive" ? (
        <p className="muted">
          {driveEmail ? <>Connected as <b>{driveEmail}</b>. </> : null}
          Now pick the folder on this PC to work from. ClassKernel reads and writes here — instantly,
          and with no internet needed — then syncs it to <b>{folderName}</b> in your Drive in the
          background.
        </p>
      ) : (
        <p className="muted">
          Everything is stored as plain <b>.csv</b> and <b>.md</b> files in the folder you pick, so
          you can open them in Excel or Notepad and move them between machines freely.
        </p>
      )}
      {mode === "drive" && (
        <p className="muted hint-text">
          Pick a plain local folder rather than one inside OneDrive or Google Drive for Desktop —
          two sync systems watching the same files will fight over them.
        </p>
      )}
      {isTauri() ? (
        <button className="primary" disabled={busy} onClick={() => void pickAndSetDataDir()}>
          Choose data folder…
        </button>
      ) : (
        <p className="muted">Desktop backend not detected — the app will start in demo mode.</p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <input
          className="grow"
          placeholder="…or type a folder path, e.g. C:\Users\you\ClassroomData"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void useManual()}
        />
        <button disabled={busy || !manualPath.trim()} onClick={() => void useManual()}>
          Use folder
        </button>
      </div>
      <button className="small" style={{ marginTop: 12 }} onClick={() => setStep("choose")}>
        Back
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="boot-screen">
      <div className="panel" style={{ maxWidth: 560 }}>
        {children}
      </div>
    </div>
  );
}
