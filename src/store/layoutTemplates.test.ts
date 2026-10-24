import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "../lib/fs";
import * as repo from "../lib/repo";
import { DEFAULT_ROOM_CONFIG, Desk } from "../lib/types";
import { useApp } from "./appStore";

// Applying a saved room layout: a template that can't be read leaves the room
// alone and says so; one that can't be written shows the save-error banner.

const DIR = "/data";
const CLS = "7B-Science";
const desk = (id: string): Desk => ({ id, label: id, shape: "double", x: 100, y: 100, w: 120, h: 60, rotation: 0, color: "", textColor: "", stripColor: "" });

class Disk extends MemFS {
  /** Writes to paths ending in this fail, as a full or vanished drive would. */
  failing: string | null = null;
  override async writeAtomic(path: string, contents: string, root?: string) {
    if (this.failing && path.endsWith(this.failing)) throw new Error("The drive is full");
    return super.writeAtomic(path, contents, root);
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
