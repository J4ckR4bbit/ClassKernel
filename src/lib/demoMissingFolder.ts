// The browser demo's stand-in for "Google Drive hasn't started yet", opened
// with ?simulate=folder-missing (add &wait=<seconds> to change the 30 s wait).
// The seeded demo folder is copied to this computer's copy as at a normal
// launch, then hidden, so the wait screen, working from the copy and copying
// the changes back can all be tried, and tested, without the desktop app.
// window.__ckDemo.folderBack() brings the folder back; editOnDrive() changes
// a file in it meanwhile, as another computer would.

import { getFS, isTauri } from "./fs";
import { backupStamp, nowIso } from "./id";
import { localPaths, writeState } from "./offline";
import { folderTiming, setSimulateMissingFolder } from "../store/appStore";

export interface DemoFolderControls {
  folderBack(): Promise<void>;
  editOnDrive(rel: string, text: string): Promise<void>;
  readOnDrive(rel: string): Promise<string | null>;
}

declare global {
  interface Window {
    __ckDemo?: DemoFolderControls;
  }
}

export function installMissingFolderDemo(): void {
  if (isTauri() || typeof location === "undefined") return;
  const params = new URLSearchParams(location.search);
  if (params.get("simulate") !== "folder-missing") return;
  folderTiming.waitMs = Number(params.get("wait") ?? 30) * 1000;
  folderTiming.pollMs = 300;
  folderTiming.returnPollMs = 300;
  folderTiming.settleMs = 1000;

  setSimulateMissingFolder(async (dataDir) => {
    const fs = getFS();
    const paths = await localPaths();
    await fs.snapshot(dataDir, backupStamp(), 14, { to: paths.copy, guard: paths.session });
    await fs.writeAtomic(paths.source, JSON.stringify({ realDir: dataDir, refreshedAt: nowIso() }));
    await writeState(paths, dataDir);
    const away = `${dataDir}-not-yet-synced`;
    await fs.rename(dataDir, away);
    let back = false;
    window.__ckDemo = {
      folderBack: async () => {
        if (back) return;
        back = true;
        await fs.rename(away, dataDir);
      },
      editOnDrive: (rel, text) => fs.writeAtomic(`${back ? dataDir : away}/${rel}`, text),
      readOnDrive: (rel) => fs.readTextIfExists(`${back ? dataDir : away}/${rel}`),
    };
  });
}
