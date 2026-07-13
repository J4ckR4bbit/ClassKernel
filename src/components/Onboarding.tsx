import { useState } from "react";
import { useApp } from "../store/appStore";
import { isTauri } from "../lib/fs";

export default function Onboarding() {
  const { chooseDataDir, pickAndSetDataDir } = useApp();
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

  return (
    <div className="boot-screen">
      <div className="panel" style={{ maxWidth: 520 }}>
        <h2>Welcome to ClassKernel</h2>
        <p className="muted">
          Choose the folder where your classroom data will live. Everything is stored as plain
          <b> .csv</b> and <b>.md</b> files — pick a folder inside <b>OneDrive</b> or{" "}
          <b>Google Drive</b> and your data is backed up and available on your other machines
          automatically, with no accounts and no internet needed.
        </p>
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
            placeholder="…or type a folder path, e.g. C:\Users\you\OneDrive\ClassroomData"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void useManual()}
          />
          <button disabled={busy || !manualPath.trim()} onClick={() => void useManual()}>
            Use folder
          </button>
        </div>
      </div>
    </div>
  );
}
