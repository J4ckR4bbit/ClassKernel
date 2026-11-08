import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, getFS, onWorkWrite, setFS, useFolder } from "./fs";
import { stringifyCsv } from "./csv";
import * as repo from "./repo";
import { LocalPaths, changedFiles, localPaths, startOfflineSession } from "./offline";
import { FolderAway, sendChanges } from "./batchSync";

// Sending changes to the data folder in batches: saves land in this
// computer's copy only; sendChanges copies them across, joining changes made
// on another computer at a pause.

const REAL = "G:/My Drive/ClassKernel";
const CLS = "10A";
const ATT = `${REAL}/classes/${CLS}/attendance.csv`;
const NOTES = `${REAL}/classes/${CLS}/class.md`;
let disk: MemFS;
let paths: LocalPaths;
let writes = 0;

const ATT_COLS = ["date", "student_id", "status", "note"];
const att = (...rows: Array<[string, string, string]>) =>
  stringifyCsv(
    rows.map(([date, student_id, status]) => ({ date, student_id, status, note: "" })),
    ATT_COLS,
  );

beforeEach(async () => {
  disk = new MemFS();
  setFS(disk);
  paths = await localPaths();
  await repo.ensureDataDir(REAL);
  await repo.saveClassInfo(REAL, { name: CLS, year: "10", subject: "PS", room: "Lab 3", notes: "", archived: false, color: "" });
  await disk.writeAtomic(ATT, att(["2026-03-09", "s1", "P"]));
  // As at launch: the copy refreshed from the folder, then work moves into it.
  await disk.snapshot(REAL, "2026-03-09_070000", 14, { to: paths.copy, guard: paths.session });
  await startOfflineSession(paths, REAL);
  writes = 0;
  onWorkWrite(() => writes++);
  useFolder(REAL, null, paths.copy);
});

/** What the data folder itself holds (not the app's view of it). */
const onDrive = (path: string) => disk.readTextIfExists(path);

/**
 * Make reading some files fail, as on Windows: a file that isn't UTF-8 text
 * (desktop.ini, a PDF, Excel's ~$ lock file) can't be read as text, and a CSV
 * open in Excel is locked. Returns a function that lifts it.
 */
function refuseReads(refused: (path: string) => boolean, why = "stream did not contain valid UTF-8"): () => void {
  const { readText, readTextIfExists } = disk;
  disk.readText = (path) => (refused(path) ? Promise.reject(new Error(`${path}: ${why}`)) : readText.call(disk, path));
  disk.readTextIfExists = (path) => (refused(path) ? Promise.reject(new Error(`${path}: ${why}`)) : readTextIfExists.call(disk, path));
  return () => {
    disk.readText = readText;
    disk.readTextIfExists = readTextIfExists;
  };
}

describe("saving while changes are sent in batches", () => {
  it("saves to this computer's copy only, and sends just the changed file", async () => {
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "A"]));
    expect(writes).toBe(1);
    expect(await onDrive(ATT)).toContain(",P,");
    expect(await getFS().readText(ATT)).toContain(",A,"); // the app sees its own save

    const report = await sendChanges(paths, REAL, "s1", false);
    expect(report.copied).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(await onDrive(ATT)).toContain(",A,");
    // Nothing left to send.
    expect(await changedFiles(paths)).toEqual([]);
    expect((await sendChanges(paths, REAL, "s2", false)).copied).toEqual([]);
  });

  it("sends a new class's files, folder and all", async () => {
    await repo.saveClassInfo(REAL, { name: "11B", year: "11", subject: "PS", room: "", notes: "", archived: false, color: "" });
    expect(await onDrive(`${REAL}/classes/11B/class.md`)).toBeNull();
    await sendChanges(paths, REAL, "s1", false);
    expect(await onDrive(`${REAL}/classes/11B/class.md`)).toContain("PS");
  });

  it("between pauses, leaves a file changed in both places to wait; at a pause, joins it in both places", async () => {
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "L"]));
    // Another computer marks a third student meanwhile.
    await disk.writeAtomic(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-09", "s3", "A"]));

    const timer = await sendChanges(paths, REAL, "s1", false);
    expect(timer.held).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(timer.localChanged).toBe(false);
    expect(await onDrive(ATT)).not.toContain("s2");

    const pause = await sendChanges(paths, REAL, "s2", true);
    expect(pause.joined).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(pause.localChanged).toBe(true);
    for (const text of [await onDrive(ATT), await getFS().readText(ATT)]) {
      expect(text).toContain("s2");
      expect(text).toContain("s3");
    }
    // Both originals are kept.
    expect(await onDrive(`${REAL}/backups/.sync/s2/drive/classes/${CLS}/attendance.csv`)).toContain("s3");
    expect(await onDrive(`${REAL}/backups/.sync/s2/this-computer/classes/${CLS}/attendance.csv`)).toContain("s2");
    expect(await changedFiles(paths)).toEqual([]);
  });

  it("at a pause, takes in a file changed only in the data folder; not before", async () => {
    await disk.writeAtomic(NOTES, (await onDrive(NOTES))!.replace("Lab 3", "Lab 7"));
    expect((await sendChanges(paths, REAL, "s1", false)).pulled).toEqual([]);
    expect(await getFS().readText(NOTES)).toContain("Lab 3");

    const pause = await sendChanges(paths, REAL, "s2", true);
    expect(pause.pulled).toEqual([`classes/${CLS}/class.md`]);
    expect(await getFS().readText(NOTES)).toContain("Lab 7");
    expect(await changedFiles(paths)).toEqual([]);
  });

  it("removes here what was removed in the data folder, but never on a listing that looks incomplete", async () => {
    const tpl = `${REAL}/layouts/Lab/desks.csv`;
    await disk.writeAtomic(tpl, "desk_id\nd1\n");
    await sendChanges(paths, REAL, "s1", true); // taken in
    expect(await getFS().readTextIfExists(tpl)).not.toBeNull();

    await disk.rename(`${REAL}/layouts/Lab`, `${REAL}/layouts/.trash-Lab-1`);
    await sendChanges(paths, REAL, "s2", true);
    expect(await getFS().readTextIfExists(tpl)).toBeNull();

    // A folder that suddenly lists almost nothing (a drive still catching up) empties nothing here.
    await disk.rename(`${REAL}/classes`, `${REAL}/elsewhere`);
    await sendChanges(paths, REAL, "s3", true);
    expect(await getFS().readTextIfExists(ATT)).not.toBeNull();
  });

  it("leaves alone files that aren't ClassKernel's own, in the folder and in the copy", async () => {
    for (const where of [REAL, paths.copy]) {
      await disk.writeAtomic(`${where}/desktop.ini`, "\uFFFE[.ShellClassInfo]");
      await disk.writeAtomic(`${where}/Form F scan.pdf`, "%PDF");
      await disk.writeAtomic(`${where}/classes/${CLS}/~$marks.csv`, "lock");
      await disk.writeAtomic(`${where}/layouts/.trash-Lab-1/desks.csv`, "desk_id\nd1\n");
    }
    refuseReads((path) => /desktop\.ini$|\.pdf$|~\$/.test(path));
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "A"]));
    const report = await sendChanges(paths, REAL, "s1", true);
    expect(report.copied).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(report.failed).toEqual([]);
    expect(report.pulled).toEqual([]);
    expect(await onDrive(ATT)).toContain(",A,");
  });

  it("leaves a file that can't be read just now for next time, and sends the rest", async () => {
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "A"]));
    await getFS().writeAtomic(NOTES, (await getFS().readText(NOTES)).replace("Lab 3", "Lab 7"));
    // Open in Excel on this computer: Windows won't let anything else read it.
    const unlock = refuseReads((path) => path === ATT, "The process cannot access the file because it is being used by another process. (os error 32)");
    const report = await sendChanges(paths, REAL, "s1", true);
    expect(report.copied).toEqual([`classes/${CLS}/class.md`]);
    expect(report.failed).toEqual([{ file: `classes/${CLS}/attendance.csv`, error: expect.stringContaining("os error 32") }]);
    expect(await changedFiles(paths)).toEqual([`classes/${CLS}/attendance.csv`]);

    unlock();
    const next = await sendChanges(paths, REAL, "s2", false);
    expect(next.copied).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(next.failed).toEqual([]);
    expect(await onDrive(ATT)).toContain(",A,");
  });

  it("stops at once if the data folder itself has gone", async () => {
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "A"]));
    await disk.rename(REAL, `${REAL}-gone`);
    await expect(sendChanges(paths, REAL, "s1", true)).rejects.toBeInstanceOf(FolderAway);
    // Still waiting here, not kept aside.
    expect(await changedFiles(paths)).toEqual([`classes/${CLS}/attendance.csv`]);
  });

  it("at a pause, keeps aside a change to a file the data folder no longer has", async () => {
    await getFS().writeAtomic(ATT, att(["2026-03-09", "s1", "E"]));
    await disk.rename(`${REAL}/classes/${CLS}`, `${REAL}/classes/10A-renamed`);
    const report = await sendChanges(paths, REAL, "s1", true);
    expect(report.keptAside.map((k) => k.file)).toEqual([`classes/${CLS}/attendance.csv`]);
    expect(await onDrive(ATT)).toBeNull(); // not re-created
    expect(await onDrive(`${REAL}/backups/.sync/s1/this-computer/classes/${CLS}/attendance.csv`)).toContain(",E,");
  });
});
