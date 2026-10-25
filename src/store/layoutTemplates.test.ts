import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "../lib/fs";
import * as repo from "../lib/repo";
import { DEFAULT_ROOM_CONFIG, Desk } from "../lib/types";
import { useApp } from "./appStore";

// Room layout templates: one that can't be read leaves the room alone and says
// so; one that can't be written shows the save-error banner; one that can't be
// deleted stays in the list and says so.

const DIR = "/data";
const CLS = "7B-Science";
const desk = (id: string): Desk => ({ id, label: id, shape: "double", x: 100, y: 100, w: 120, h: 60, rotation: 0, color: "", textColor: "", stripColor: "" });

class Disk extends MemFS {
  /** Writes to paths ending in this fail, as a full or vanished drive would. */
  failing: string | null = null;
  /** Renames fail, as for a folder another program has open. */
  renameFails = false;
  override async writeAtomic(path: string, contents: string, root?: string) {
    if (this.failing && path.endsWith(this.failing)) throw new Error("The drive is full");
    return super.writeAtomic(path, contents, root);
  }
  override async rename(from: string, to: string) {
    if (this.renameFails) throw new Error("The folder is in use");
    return super.rename(from, to);
  }
}

let disk: Disk;
const toasts: string[] = [];

beforeEach(async () => {
  disk = new Disk();
  setFS(disk);
  await repo.ensureDataDir(DIR);
  await repo.saveClassInfo(DIR, { name: CLS, year: "7", subject: "Science", room: "Lab 2", notes: "", archived: false, color: "" });
  await repo.saveLayoutTemplate(DIR, "Lab", [desk("a"), desk("b")], DEFAULT_ROOM_CONFIG);
  toasts.length = 0;
  useApp.setState({
    dataDir: DIR,
    currentClass: CLS,
    desks: [desk("old")],
    roomConfig: DEFAULT_ROOM_CONFIG,
    layoutTemplates: ["Lab"],
    folderStatus: null,
    saveError: null,
    showToast: (message: string) => void toasts.push(message),
  });
});

describe("applying a room layout template", () => {
  it("applies and saves it", async () => {
    expect(await useApp.getState().applyLayoutTemplate("Lab")).toBe(true);
    expect(useApp.getState().desks.map((d) => d.id)).toEqual(["a", "b"]);
    expect((await repo.loadDesks(DIR, CLS)).map((d) => d.id)).toEqual(["a", "b"]);
    expect(useApp.getState().saveError).toBeNull();
  });

  it("shows the save-error banner when the room can't be written, keeping the layout on screen", async () => {
    disk.failing = "desks.csv";
    expect(await useApp.getState().applyLayoutTemplate("Lab")).toBe(true);
    expect(useApp.getState().saveError).toEqual({ label: "the room layout" });
    expect(useApp.getState().desks.map((d) => d.id)).toEqual(["a", "b"]);

    // Try again on the banner saves it once the drive is back.
    disk.failing = null;
    await useApp.getState().retrySave();
    expect(useApp.getState().saveError).toBeNull();
    expect((await repo.loadDesks(DIR, CLS)).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("leaves the room as it was, and says so, when the template's files are gone", async () => {
    // Listed here, but deleted on another computer before the sync caught up.
    expect(await useApp.getState().applyLayoutTemplate("Gone")).toBe(false);
    expect(useApp.getState().desks.map((d) => d.id)).toEqual(["old"]);
    expect((await repo.loadDesks(DIR, CLS)).length).toBe(0);
    expect(toasts).toEqual([`Couldn't read the layout "Gone" — this room is unchanged`]);
  });

  it("leaves the room as it was when reading the template fails", async () => {
    const read = disk.readTextIfExists.bind(disk);
    disk.readTextIfExists = async (path: string) => {
      if (path.includes("/layouts/")) throw new Error("Access denied");
      return read(path);
    };
    expect(await useApp.getState().applyLayoutTemplate("Lab")).toBe(false);
    expect(useApp.getState().desks.map((d) => d.id)).toEqual(["old"]);
    expect(toasts).toHaveLength(1);
  });
});

describe("saving a room layout template", () => {
  it("saves and lists it", async () => {
    expect(await useApp.getState().saveLayoutTemplate("Lab 3")).toBe(true);
    expect(useApp.getState().layoutTemplates).toEqual(["Lab", "Lab 3"]);
    expect((await repo.loadLayoutTemplate(DIR, "Lab 3")).desks.map((d) => d.id)).toEqual(["old"]);
    expect(useApp.getState().saveError).toBeNull();
  });

  it("shows the save-error banner when it can't be written, and Try again saves it", async () => {
    disk.failing = "desks.csv";
    expect(await useApp.getState().saveLayoutTemplate("Lab 3")).toBe(false);
    expect(useApp.getState().saveError).toEqual({ label: `the layout template "Lab 3"` });
    expect(useApp.getState().layoutTemplates).toEqual(["Lab"]);

    disk.failing = null;
    await useApp.getState().retrySave();
    expect(useApp.getState().saveError).toBeNull();
    expect(useApp.getState().layoutTemplates).toEqual(["Lab", "Lab 3"]);
    expect((await repo.loadLayoutTemplate(DIR, "Lab 3")).desks.map((d) => d.id)).toEqual(["old"]);
  });
});

describe("deleting a room layout template", () => {
  it("deletes it", async () => {
    expect(await useApp.getState().deleteLayoutTemplate("Lab")).toBe(true);
    expect(useApp.getState().layoutTemplates).toEqual([]);
    expect(await repo.listLayoutTemplates(DIR)).toEqual([]);
  });

  it("keeps it in the list, and says so, when it can't be deleted", async () => {
    disk.renameFails = true;
    expect(await useApp.getState().deleteLayoutTemplate("Lab")).toBe(false);
    expect(useApp.getState().layoutTemplates).toEqual(["Lab"]);
    expect(toasts).toEqual([`Couldn't delete the template "Lab" — it's still there`]);
  });

  it("counts it as deleted when it was already gone", async () => {
    // Deleted on another computer; this one's list hadn't caught up.
    await repo.deleteLayoutTemplate(DIR, "Lab");
    disk.renameFails = true;
    expect(await useApp.getState().deleteLayoutTemplate("Lab")).toBe(true);
    expect(useApp.getState().layoutTemplates).toEqual([]);
    expect(toasts).toEqual([]);
  });
});
