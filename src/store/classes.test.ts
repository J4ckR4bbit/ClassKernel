import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "../lib/fs";
import * as repo from "../lib/repo";
import { ClassInfo } from "../lib/types";
import { useApp } from "./appStore";

// Creating, renaming and editing classes. A class's name is its folder, so a
// second class of the same name (in any capitals) would land on the first:
// both are refused, with a message. A save that fails shows the save-error
// banner and reports false, so the screen doesn't say "saved".

const DIR = "/data";
const info = (name: string, over: Partial<ClassInfo> = {}): ClassInfo => ({
  name,
  year: "10",
  subject: "Physical Sciences",
  room: "Lab 1",
  notes: "",
  archived: false,
  color: "",
  ...over,
});

class Disk extends MemFS {
  /** Writes fail, as a full or vanished drive would. */
  writesFail = false;
  /** Renames fail, as for a folder another program has open. */
  renameFails = false;
  override async writeAtomic(path: string, contents: string, root?: string) {
    if (this.writesFail) throw new Error("The drive is full");
    return super.writeAtomic(path, contents, root);
  }
  override async rename(from: string, to: string) {
    if (this.renameFails) throw new Error("The folder is in use");
    return super.rename(from, to);
  }
}

let disk: Disk;
const toasts: string[] = [];
const names = async () => (await repo.listClasses(DIR)).map((c) => c.name);

beforeEach(async () => {
  disk = new Disk();
  setFS(disk);
  await repo.ensureDataDir(DIR);
  await repo.saveClassInfo(DIR, info("10A", { notes: "# Scheme of work\n\nWeek 1: vectors" }));
  await repo.saveClassInfo(DIR, info("11B", { archived: true }));
  toasts.length = 0;
  useApp.setState({
    dataDir: DIR,
    classes: await repo.listClasses(DIR),
    currentClass: "10A",
    folderStatus: null,
    saveError: null,
    showToast: (message: string) => void toasts.push(message),
  });
});

describe("creating a class", () => {
  it("creates and opens it", async () => {
    expect(await useApp.getState().createClass(info("12C"))).toBe(true);
    expect(await names()).toEqual(["10A", "11B", "12C"]);
    expect(useApp.getState().currentClass).toBe("12C");
  });

  it("refuses a name another class has, in any capitals, leaving that class's notes alone", async () => {
    expect(await useApp.getState().createClass(info("10a"))).toBe(false);
    expect(toasts).toEqual(["There is already a class called 10A"]);
    expect(await names()).toEqual(["10A", "11B"]);
    expect((await repo.listClasses(DIR))[0].notes).toContain("Week 1: vectors");
    expect(useApp.getState().currentClass).toBe("10A");
  });

  it("says when the class of that name is archived", async () => {
    expect(await useApp.getState().createClass(info("11B"))).toBe(false);
    expect(toasts).toEqual(["There is already a class called 11B (archived)"]);
  });

  it("shows the save-error banner when it can't be written", async () => {
    disk.writesFail = true;
    expect(await useApp.getState().createClass(info("12C"))).toBe(false);
    expect(useApp.getState().saveError).toEqual({ label: "the new class" });
    expect(useApp.getState().currentClass).toBe("10A");
  });
});

describe("renaming a class", () => {
  it("renames its folder and stays on it", async () => {
    expect(await useApp.getState().renameClass("10A", "10 Alpha")).toBe(true);
    expect(await names()).toEqual(["10 Alpha", "11B"]);
    expect(useApp.getState().currentClass).toBe("10 Alpha");
    expect((await repo.listClasses(DIR))[0].notes).toContain("Week 1: vectors");
  });

  it("can change only the capitals", async () => {
    expect(await useApp.getState().renameClass("10A", "10a")).toBe(true);
    expect(await names()).toEqual(["10a", "11B"]);
  });

  it("refuses the name of another class", async () => {
    expect(await useApp.getState().renameClass("10A", "11b")).toBe(false);
    expect(toasts).toEqual(["There is already a class called 11B (archived)"]);
    expect(await names()).toEqual(["10A", "11B"]);
  });

  it("says so when the folder can't be moved", async () => {
    disk.renameFails = true;
    expect(await useApp.getState().renameClass("10A", "10 Alpha")).toBe(false);
    expect(toasts).toEqual(["Couldn't rename the class: The folder is in use"]);
    expect(await names()).toEqual(["10A", "11B"]);
    expect(useApp.getState().currentClass).toBe("10A");
  });
});

describe("saving a class's details", () => {
  it("saves them", async () => {
    expect(await useApp.getState().updateClassInfo(info("10A", { room: "Lab 3" }))).toBe(true);
    expect(useApp.getState().classes.find((c) => c.name === "10A")?.room).toBe("Lab 3");
  });

  it("reports a failed save instead of passing it off as saved", async () => {
    disk.writesFail = true;
    expect(await useApp.getState().updateClassInfo(info("10A", { room: "Lab 3" }))).toBe(false);
    expect(useApp.getState().saveError).toEqual({ label: "the class details" });
  });
});
