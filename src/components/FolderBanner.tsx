import { useEffect, useState } from "react";
import { FolderStatus, useAppPick } from "../store/appStore";
import { dateTimeInZone } from "../lib/time";
import Icon, { IconName } from "./Icon";

const when = (iso: string) => (iso ? dateTimeInZone(iso) : "");

/**
 * Above every page after a copy-back or send that needs a look: changes made
 * in both places, files kept aside. Stays until dismissed. (Working from this
 * computer's copy, or the folder being out of reach, is only the small chip
 * in the top bar: see SendStatus.)
 */
export function FolderBanner() {
  const { syncReport, dismissSyncReport } = useAppPick("syncReport", "dismissSyncReport");

  if (!syncReport) return null;
  const { copied, joined, clashes, keptAside, notes, backupDir } = syncReport;
  const changed = copied.length + joined.length;
  const needsALook = clashes.length > 0 || keptAside.length > 0 || notes.length > 0;
  return (
    <div className={`folder-banner ${needsALook ? "attention" : "done"}`} role="status">
      <Icon name={needsALook ? "info" : "check"} size={20} />
      <div className="grow">
        <b>{syncReport.heading ?? "This computer's changes are back in your data folder"}</b>
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

/** "just now", "3 min ago", "2 h ago". */
function ago(iso: string, now: number): string {
  const mins = Math.floor((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ago`;
}

/** The chip's look: the icon, its words (none: icon only), its tone and its tooltip. */
type ChipLook = { icon: IconName; text: string; tone: "" | "waiting" | "quiet"; title: string; busy?: boolean };

/**
 * In the top bar, while the data isn't simply saved straight to the data
 * folder: sending in batches (on its way, waiting, or sent, and when), or
 * working from this computer's copy. When the folder can't be reached it
 * says so once (a message), then stays small and grey until it's back.
 * Pressing it sends now (or copies back now).
 */
export function SendStatus() {
  const { folderStatus, sendNow, syncNow } = useAppPick("folderStatus", "sendNow", "syncNow");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const look = chipLook(folderStatus, now);
  if (!look) return null;
  const press = folderStatus?.kind === "batched" ? sendNow : syncNow;
  return (
    <button
      className={`send-status no-print ${look.tone} ${look.text ? "" : "icon-only"}`}
      onClick={() => void press()}
      disabled={look.busy}
      title={look.title}
      aria-label={look.text || look.title}
      aria-live="polite"
    >
      <Icon name={look.icon} size={18} />
      {look.text}
    </button>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function chipLook(st: FolderStatus | null, now: number): ChipLook | null {
  if (st?.kind === "syncing") return { icon: "cloud_sync", text: "Copying back…", tone: "", title: "Copying this computer's changes to your data folder", busy: true };
  if (st?.kind === "copy") {
    const problem = st.lastError ? `\n\nLast try: ${st.lastError}` : "";
    return st.back
      ? {
          icon: "cloud_sync",
          text: "Folder back · Copy back now",
          tone: "waiting",
          title: `Your data folder is back. This computer's changes are copied into it by themselves in a moment (never during teaching mode) — or press to do it now.${problem}`,
        }
      : {
          icon: "cloud_off",
          text: "This computer's copy",
          tone: "quiet",
          title:
            `Your data folder (${st.realDir}) can't be reached, so you're working from this computer's copy` +
            (st.copyRefreshedAt ? `, last updated from the folder ${when(st.copyRefreshedAt)}` : "") +
            `. Changes made on other computers since then aren't shown. Everything you do is copied back by itself once the folder is there.${problem}`,
        };
  }
  if (st?.kind !== "batched") return null;
  const { sending, driveAway, pending, lastSent, failed, lastError } = st;
  if (sending) return { icon: "cloud_sync", text: "Sending…", tone: "", title: "Sending this computer's changes to your data folder", busy: true };
  if (driveAway) {
    return {
      icon: "cloud_off",
      text: "",
      tone: "quiet",
      title:
        `Not sent yet: your data folder can't be reached just now. Your changes are safe on this computer and are sent once it's back (tried again every few minutes). Press to try now.` +
        (lastError ? `\n\nLast try: ${lastError}` : ""),
    };
  }
  if (pending) {
    const left = failed.length
      ? `\n\n${plural(failed.length, "file")} couldn't be sent last time — is it open in another program (Excel, say)? It's tried again with the next send.\n` +
        failed
          .slice(0, 5)
          .map((f) => `• ${f.file}: ${f.error}`)
          .join("\n")
      : "";
    return { icon: "cloud_upload", text: "Changes waiting · Send now", tone: "waiting", title: `Saved on this computer. Press to send to your data folder now.${left}` };
  }
  return {
    icon: "cloud_done",
    text: lastSent ? `Sent ${ago(lastSent, now)}` : "Up to date",
    tone: "",
    title: "Everything is in your data folder. Press to send now and take in changes from other computers.",
  };
}
