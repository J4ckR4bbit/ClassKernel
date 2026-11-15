import { useEffect, useState } from "react";
import { useApp } from "../../store/appStore";
import { getFS, isTauri } from "../../lib/fs";
import { FoundUpdate, appVersion, checkForUpdate, explainUpdateError, readCheckAtLaunch, saveCheckAtLaunch } from "../../lib/updates";
import Icon from "../Icon";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "found"; update: FoundUpdate }
  | { kind: "downloading"; update: FoundUpdate; share: number | null }
  | { kind: "installing" }
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
    if (status.kind === "found") status.update.dismiss();
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
    setStatus({ kind: "downloading", update, share: null });
    try {
      // The slow part first, while the app is still working normally.
      await update.download((share) => setStatus({ kind: "downloading", update, share }));
      setStatus({ kind: "installing" });
      // The installer ends the app without the usual goodbye, so first send
      // what's waiting to the data folder and save straight to it from here
      // on (for up to ten seconds; if the folder can't be reached, the changes
      // stay marked on this computer and the next launch sends them). Unlike
      // the send made when the window closes, this leaves the app in a state
      // it can carry on from if the installer then fails to start.
      const settle = async () => {
        await useApp.getState().stopBatching();
        await getFS().flush();
      };
      await Promise.race([settle().catch((e) => console.warn("Couldn't send everything before updating", e)), new Promise((resolve) => setTimeout(resolve, 10_000))]);
      await update.install();
    } catch (e) {
      console.warn("Update failed", e);
      setStatus({ kind: "failed", message: explainUpdateError(e) });
    }
  };

  const busy = status.kind === "checking" || status.kind === "downloading" || status.kind === "installing";

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
        {status.kind === "downloading" &&
          (status.share === null
            ? `Downloading version ${status.update.version}…`
            : `Downloading version ${status.update.version}: ${Math.round(status.share * 100)} %`)}
        {status.kind === "installing" && "Installing. ClassKernel will close and open again…"}
        {status.kind === "failed" && status.message}
      </p>
      {status.kind === "found" && status.update.notes && <pre className="update-notes">{status.update.notes}</pre>}
    </div>
  );
}
