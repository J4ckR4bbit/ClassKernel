import { beforeEach, describe, expect, it } from "vitest";
import { MemFS } from "../fs";
import { syncOnce } from "./engine";
import { FakeDrive } from "./fakeDrive";
import { emptyManifest } from "./manifest";
import { META_FILE } from "./policy";
import { SyncManifest } from "./types";

const DIR = "/data";
const ROOT = "root1";

let fs: MemFS;
let drive: FakeDrive;
let manifest: SyncManifest;

beforeEach(() => {
  fs = new MemFS();
  drive = new FakeDrive();
  manifest = { ...emptyManifest(), rootFolderId: ROOT, dataDir: DIR };
});

/** One sync pass, carrying the manifest forward the way the service does. */
async function sync(holdLocal?: (p: string) => boolean) {
  const outcome = await syncOnce({
    fs,
    drive,
    dataDir: DIR,
    rootId: ROOT,
    manifest,
    stamp: "2026-07-25_143000",
    holdLocal,
  });
  manifest = outcome.manifest;
  return outcome.result;
}

const REGISTER = "date,student_id,status,note\r\n2026-07-20,s1,P,\r\n";

describe("syncOnce — first contact", () => {
  it("uploads a local folder that Drive has never seen", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await fs.writeAtomic(`${DIR}/behaviours.csv`, "code,label\r\nGOOD,Good work\r\n");

    const result = await sync();

    expect(result.pushed.sort()).toEqual(["behaviours.csv", "classes/7B/attendance.csv"]);
    expect(drive.find("classes/7B/attendance.csv")?.content).toBe(REGISTER);
    expect(result.errors).toEqual([]);
  });

  it("downloads a folder another device already populated", async () => {
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER);

    const result = await sync();

    expect(result.pulled).toEqual(["classes/7B/attendance.csv"]);
    expect(await fs.readText(`${DIR}/classes/7B/attendance.csv`)).toBe(REGISTER);
  });

  it("leaves a marker in Drive describing the folder for other clients", async () => {
    await sync();
    expect(drive.find(META_FILE)).toBeDefined();
    // Remote-only: it must never appear in the teacher's data folder.
    expect(await fs.exists(`${DIR}/${META_FILE}`)).toBe(false);
  });

  it("does nothing on a second pass when nothing changed", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();
    drive.calls = [];

    const result = await sync();

    expect(result.pushed).toEqual([]);
    expect(result.pulled).toEqual([]);
    expect(drive.calls.filter((c) => c.startsWith("upload"))).toEqual([]);
  });
});

describe("syncOnce — one side changed", () => {
  it("pushes a local edit", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER + "2026-07-21,s1,A,\r\n");
    const result = await sync();

    expect(result.pushed).toEqual(["classes/7B/attendance.csv"]);
    expect(drive.find("classes/7B/attendance.csv")?.content).toContain("2026-07-21");
  });

  it("pulls a remote edit", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    drive.now += 60_000;
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER + "2026-07-21,s2,L,\r\n");
    const result = await sync();

    expect(result.pulled).toEqual(["classes/7B/attendance.csv"]);
    expect(await fs.readText(`${DIR}/classes/7B/attendance.csv`)).toContain("s2");
  });
});

describe("syncOnce — both sides changed", () => {
  it("merges a register instead of picking a winner", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    // Two devices mark different students before either syncs.
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER + "2026-07-21,s2,P,\r\n");
    drive.now += 60_000;
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER + "2026-07-21,s3,A,\r\n");

    const result = await sync();

    expect(result.merged).toEqual(["classes/7B/attendance.csv"]);
    expect(result.conflicted).toEqual([]);
    const local = await fs.readText(`${DIR}/classes/7B/attendance.csv`);
    expect(local).toContain("s2");
    expect(local).toContain("s3");
    // Both sides end up holding the merged file.
    expect(drive.find("classes/7B/attendance.csv")?.content).toBe(local);
  });

  it("keeps the losing room layout as a conflict copy", async () => {
    const desks = "desk_id,label,shape,x,y\r\nd1,A,single,0,0\r\n";
    await fs.writeAtomic(`${DIR}/classes/7B/desks.csv`, desks);
    await sync();

    await fs.writeAtomic(`${DIR}/classes/7B/desks.csv`, desks + "d2,B,single,1,0\r\n");
    drive.now += 3_600_000; // Drive's copy is clearly newer.
    drive.put(ROOT, "classes/7B/desks.csv", desks + "d9,Z,single,5,5\r\n");

    const result = await sync();

    expect(result.merged).toEqual([]);
    expect(result.conflicted).toHaveLength(1);
    // Newer (remote) version wins in place...
    expect(await fs.readText(`${DIR}/classes/7B/desks.csv`)).toContain("d9");
    // ...and the local one is preserved next to it rather than discarded.
    const copy = result.conflicted[0].copy;
    expect(copy).toBe("classes/7B/desks.conflict-2026-07-25_143000.csv");
    expect(await fs.readText(`${DIR}/${copy}`)).toContain("d2");
  });

  it("does not upload conflict copies", async () => {
    const desks = "desk_id,label\r\nd1,A\r\n";
    await fs.writeAtomic(`${DIR}/classes/7B/desks.csv`, desks);
    await sync();
    await fs.writeAtomic(`${DIR}/classes/7B/desks.csv`, desks + "d2,B\r\n");
    drive.now += 3_600_000;
    drive.put(ROOT, "classes/7B/desks.csv", desks + "d9,Z\r\n");
    await sync();

    await sync(); // A second pass must not start syncing the copy either.
    expect(drive.livePaths().some((p) => p.includes(".conflict-"))).toBe(false);
  });
});

describe("syncOnce — deletions", () => {
  it("removes a file from Drive when it is deleted locally", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    await fs.remove(`${DIR}/classes/7B/attendance.csv`);
    const result = await sync();

    expect(result.deletedRemote).toEqual(["classes/7B/attendance.csv"]);
    expect(drive.find("classes/7B/attendance.csv")?.trashed).toBe(true);
  });

  it("removes a local file when another device deleted it", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    await drive.trash(drive.find("classes/7B/attendance.csv")!.id);
    const result = await sync();

    expect(result.deletedLocal).toEqual(["classes/7B/attendance.csv"]);
    expect(await fs.exists(`${DIR}/classes/7B/attendance.csv`)).toBe(false);
  });

  it("keeps local edits that arrived after a remote delete", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    await drive.trash(drive.find("classes/7B/attendance.csv")!.id);
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER + "2026-07-21,s5,P,\r\n");
    const result = await sync();

    // Losing a teacher's work is worse than an unexpected reappearance.
    expect(result.deletedLocal).toEqual([]);
    expect(result.pushed).toEqual(["classes/7B/attendance.csv"]);
    expect(await fs.readText(`${DIR}/classes/7B/attendance.csv`)).toContain("s5");
  });

  it("restores a file deleted here but edited elsewhere", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();

    await fs.remove(`${DIR}/classes/7B/attendance.csv`);
    drive.now += 60_000;
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER + "2026-07-21,s7,P,\r\n");
    const result = await sync();

    expect(result.deletedRemote).toEqual([]);
    expect(result.pulled).toEqual(["classes/7B/attendance.csv"]);
  });

  it("renames a class without resurrecting the old one", async () => {
    // Renaming a class moves the whole folder on disk, which sync sees as a
    // delete plus a create. Getting this wrong would bring the class back.
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await fs.writeAtomic(`${DIR}/classes/7B/class.md`, "---\nname: 7B\n---\n");
    await sync();

    await fs.rename(`${DIR}/classes/7B`, `${DIR}/classes/7B Science`);
    const result = await sync();

    expect(drive.livePaths().filter((p) => p.startsWith("classes/"))).toEqual([
      "classes/7B Science/attendance.csv",
      "classes/7B Science/class.md",
    ]);
    expect(result.deletedRemote.sort()).toEqual(["classes/7B/attendance.csv", "classes/7B/class.md"]);

    // And it stays renamed on the next pass rather than oscillating.
    const second = await sync();
    expect(second.pulled).toEqual([]);
    expect(second.deletedLocal).toEqual([]);
  });

  it("clears away the empty folder a rename leaves behind", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await sync();
    await fs.rename(`${DIR}/classes/7B`, `${DIR}/classes/7B Science`);
    await sync();

    const folders = [...drive.entries.values()].filter((e) => e.isFolder && !e.trashed && e.relPath);
    expect(folders.map((f) => f.relPath).sort()).toEqual(["classes", "classes/7B Science"]);
  });

  it("keeps a folder whose file failed to sync", async () => {
    // The dangerous version of the cleanup above: never trash a folder just
    // because the manifest has no entry for what is inside it.
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER);
    await drive.createFolder("7B", "x", "classes/7B", ROOT);
    drive.download = async () => {
      throw new Error("network blip");
    };

    const result = await sync();

    expect(result.errors).toHaveLength(1);
    expect(drive.find("classes/7B/attendance.csv")?.trashed).toBe(false);
    const folder = [...drive.entries.values()].find((e) => e.relPath === "classes/7B");
    expect(folder?.trashed).toBe(false);
  });
});

describe("syncOnce — live lesson protection", () => {
  it("defers changes to the class being taught, and applies them afterwards", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await fs.writeAtomic(`${DIR}/classes/8A/attendance.csv`, REGISTER);
    await sync();

    drive.now += 60_000;
    drive.put(ROOT, "classes/7B/attendance.csv", REGISTER + "2026-07-21,s2,P,\r\n");
    drive.put(ROOT, "classes/8A/attendance.csv", REGISTER + "2026-07-21,s3,P,\r\n");

    const held = await sync((p) => p.startsWith("classes/7B/"));

    expect(held.deferred).toEqual(["classes/7B/attendance.csv"]);
    expect(held.pulled).toEqual(["classes/8A/attendance.csv"]);
    expect(await fs.readText(`${DIR}/classes/7B/attendance.csv`)).not.toContain("s2");

    // Lesson over — the next pass picks it up.
    const after = await sync();
    expect(after.pulled).toEqual(["classes/7B/attendance.csv"]);
    expect(await fs.readText(`${DIR}/classes/7B/attendance.csv`)).toContain("s2");
  });

  it("still pushes local work while a lesson is live", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/behaviour.csv`, "timestamp,student_id,code,points,note\r\n");
    const result = await sync((p) => p.startsWith("classes/7B/"));
    expect(result.pushed).toEqual(["classes/7B/behaviour.csv"]);
  });
});

describe("syncOnce — what it leaves alone", () => {
  it("never syncs the local backups folder", async () => {
    await fs.writeAtomic(`${DIR}/backups/2026-07-25_120000/attendance.csv`, REGISTER);
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);

    await sync();

    expect(drive.livePaths()).toEqual([META_FILE, "classes/7B/attendance.csv"]);
  });

  it("skips leftover temp files from an interrupted write", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv.tmp.classkernel`, "half");
    await sync();
    expect(drive.livePaths()).toEqual([META_FILE]);
  });

  it("reports a failure for one file without abandoning the rest", async () => {
    await fs.writeAtomic(`${DIR}/classes/7B/attendance.csv`, REGISTER);
    await fs.writeAtomic(`${DIR}/classes/8A/attendance.csv`, REGISTER);
    const realUpload = drive.upload.bind(drive);
    drive.upload = async (args) => {
      if (args.relPath === "classes/7B/attendance.csv") throw new Error("Drive said no");
      return realUpload(args);
    };

    const result = await sync();

    expect(result.errors).toEqual([{ path: "classes/7B/attendance.csv", message: "Drive said no" }]);
    expect(result.pushed).toEqual(["classes/8A/attendance.csv"]);
  });
});
