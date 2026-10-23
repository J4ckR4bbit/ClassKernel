import { useEffect, useState } from "react";
import { folderTiming, useAppPick } from "../store/appStore";
import Icon from "./Icon";

/**
 * Shown at launch while the saved data folder isn't there yet, usually
 * because Google Drive (or OneDrive) is still starting. It opens by itself
 * the moment the folder appears; after the wait it opens this computer's copy
 * of the data instead, and the changes are copied back once the folder
 * returns. The teacher never has to pick the folder again.
 */
export default function WaitingForFolder() {
  const { folderStatus, openLocalCopy, pickAndSetDataDir } = useAppPick("folderStatus", "openLocalCopy", "pickAndSetDataDir");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (folderStatus?.kind !== "waiting") return null;
  const left = Math.max(0, Math.ceil((folderStatus.since + folderTiming.waitMs - now) / 1000));

  return (
    <div className="boot-screen">
      <div className="panel waiting-panel" role="status" aria-live="polite">
        <h2>
          <Icon name="schedule" size={24} /> Waiting for your data folder…
        </h2>
        <p>
          <code>{folderStatus.realDir}</code> isn't available yet — Google Drive or OneDrive may still be starting.
          ClassKernel opens it as soon as it appears.
        </p>
        {folderStatus.copyAvailable ? (
          <p className="muted">
            {left > 0
              ? `In ${left} s it opens this computer's copy of your data instead. Anything you change is copied back to the folder when it returns.`
              : "Opening this computer's copy…"}
          </p>
        ) : (
          <p className="muted">
            There's no copy of your data on this computer yet, so it keeps waiting. If the folder has moved, choose it
            again.
          </p>
        )}
        <div className="row">
          {folderStatus.copyAvailable && (
            <button className="primary" onClick={() => void openLocalCopy()}>
              Open this computer's copy now
            </button>
          )}
          <button onClick={() => void pickAndSetDataDir()}>Choose a different folder…</button>
        </div>
      </div>
    </div>
  );
}
