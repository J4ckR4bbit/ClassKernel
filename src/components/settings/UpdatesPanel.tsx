import { useEffect, useState } from "react";
import { sendBeforeClosing } from "../../store/appStore";
import { isTauri } from "../../lib/fs";
import { FoundUpdate, appVersion, checkForUpdate, explainUpdateError, readCheckAtLaunch, saveCheckAtLaunch } from "../../lib/updates";
import Icon from "../Icon";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "found"; update: FoundUpdate }
  | { kind: "installing"; update: FoundUpdate; share: number | null }
  | { kind: "failed"; message: string };

/** Settings › General › Updates: this version, a check for a newer one, and installing it. Desktop app only. */
export default function UpdatesPanel() {
  const [version, setVersion] = useState("");
  const [atLaunch, setAtLaunch] = useState(readCheckAtLaunch);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    void appVersion().then(setVersion, () => {});
  }, []);

  // In a browser there is nothing to update: the page is always the latest.
  if (!isTauri()) return null;

  const check = async () => {
    setStatus({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      setStatus(update ? { kind: "found", update } : { kind: "latest" });
    } catch (e) {
      console.warn("Update check failed", e);
      setStatus({ kind: "failed", message: explainUpdateError(e) });
    }
  };

  const install = async (update: FoundUpdate) => {
    setStatus({ kind: "installing", update, share: null });
    try {
      // As when closing the window: send what's waiting to the data folder first, for up to ten seconds.
      await Promise.race([sendBeforeClosing().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 10_000))]);
      await update.install((share) => setStatus({ kind: "installing", update, share }));
    } catch (e) {
      console.warn("Update failed", e);
      setStatus({ kind: "failed", message: explainUpdateError(e) });
    }
  };

  const busy = status.kind === "checking" || status.kind === "installing";

  return (
    <div className="panel" id="updates">
      <h3>Updates</h3>
      <p className="muted lead">
        This is ClassKernel {version || "…"}. Checking for an update is the only time ClassKernel uses the internet: it
        asks GitHub whether a newer version exists. None of your data is sent.
      </p>
      <label className="pref-row">
        <input
          type="checkbox"
          className="switch"
          checked={atLaunch}
          onChange={(e) => {
            setAtLaunch(e.target.checked);
            saveCheckAtLaunch(e.target.checked);
          }}
        />
        <span>Check for an update each time ClassKernel starts, on this computer.</span>
      </label>
      <div className="row button-row">
        <button onClick={() => void check()} disabled={busy}>
          <Icon name="download" size={20} /> Check for updates
        </button>
        {status.kind === "found" && (
          <button className="primary" onClick={() => void install(status.update)}>
            Install version {status.update.version} and restart
          </button>
        )}
      </div>
      <p className="muted" role="status">
        {status.kind === "checking" && "Checking…"}
        {status.kind === "latest" && "You have the latest version."}
        {status.kind === "found" &&
          `Version ${status.update.version} is available. Installing closes ClassKernel for a moment and opens it again; your data isn't touched.`}
        {status.kind === "installing" &&
          (status.share === null
            ? `Downloading version ${status.update.version}…`
            : status.share < 1
              ? `Downloading version ${status.update.version}: ${Math.round(status.share * 100)} %`
              : "Installing. ClassKernel will close and open again…")}
        {status.kind === "failed" && status.message}
      </p>
      {status.kind === "found" && status.update.notes && <pre className="update-notes">{status.update.notes}</pre>}
    </div>
  );
}
