import { describe, expect, it } from "vitest";
import { MemFS, MirrorFS, QueuedFS } from "./fs";

/** A MemFS whose writes take a while and can be told to fail, logging what reached "disk". */
class SlowFS extends MemFS {
  written: string[] = [];
  failNext = false;
  async writeAtomic(path: string, contents: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 5));
    if (this.failNext) {
      this.failNext = false;
      throw new Error("disk full");
    }
    this.written.push(contents);
    await super.writeAtomic(path, contents);
  }
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe("QueuedFS", () => {
  it("collapses a burst of writes to one file into at most two disk writes, ending on the newest", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    const saves = ["1", "12", "12,", "12,5"].map((v) => fs.writeAtomic("d/marks.csv", v));
    await Promise.all(saves);
    expect(disk.written.length).toBeLessThanOrEqual(2);
    expect(disk.written[disk.written.length - 1]).toBe("12,5");
    expect(await disk.readText("d/marks.csv")).toBe("12,5");
  });

  it("keeps writes to one file in order when they arrive while one is running", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    const first = fs.writeAtomic("d/a.csv", "first");
    await new Promise((r) => setTimeout(r, 1)); // first is now on its way to disk
    const second = fs.writeAtomic("d/a.csv", "second");
    await Promise.all([first, second]);
    expect(disk.written).toEqual(["first", "second"]);
  });

  it("writes different files independently", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    await Promise.all([fs.writeAtomic("d/a.csv", "a"), fs.writeAtomic("d/b.csv", "b")]);
    expect(disk.written.sort()).toEqual(["a", "b"]);
  });

  it("treats back- and forward-slashed paths as the same file", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    const a = fs.writeAtomic("C:\\data\\a.csv", "old");
    const b = fs.writeAtomic("C:/data/a.csv", "new");
    await Promise.all([a, b]);
    expect(disk.written).toEqual(["new"]);
  });

  it("makes a read wait for that file's pending write", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    void fs.writeAtomic("d/a.csv", "saved");
    expect(await fs.readText("d/a.csv")).toBe("saved");
    expect(await fs.readTextIfExists("d/a.csv")).toBe("saved");
    expect(await fs.exists("d/a.csv")).toBe(true);
  });

  it("rejects every caller folded into a failed write, and recovers for the next one", async () => {
    const disk = new SlowFS();
    const fs = new QueuedFS(disk);
    disk.failNext = true;
    const a = fs.writeAtomic("d/a.csv", "x");
    const b = fs.writeAtomic("d/a.csv", "y");
    await expect(a).rejects.toThrow("disk full");
    await expect(b).rejects.toThrow("disk full");
    await fs.writeAtomic("d/a.csv", "z");
    expect(await fs.readText("d/a.csv")).toBe("z");
  });

  it("holds writes until a running backup snapshot finishes, but not reads of other files", async () => {
    const disk = new SlowFS();
    await disk.writeAtomic("d/a.csv", "launch");
    await disk.writeAtomic("d/b.csv", "untouched");
    disk.written = [];
    const copying = deferred();
    disk.snapshot = async () => {
      await copying.promise;
      return "d/backups/x";
    };
    const fs = new QueuedFS(disk);
    const snap = fs.snapshot("d", "x", 14);
    const save = fs.writeAtomic("d/a.csv", "edited");
    expect(await fs.readText("d/b.csv")).toBe("untouched");
    await new Promise((r) => setTimeout(r, 20));
    expect(disk.written).toEqual([]);
    copying.resolve();
    await Promise.all([snap, save]);
    expect(disk.written).toEqual(["edited"]);
    // A read of the edited file waited for its write, so it sees the edit.
    expect(await fs.readText("d/a.csv")).toBe("edited");
  });

  it("still saves after a backup snapshot fails", async () => {
    const disk = new SlowFS();
    disk.snapshot = async () => {
      throw new Error("no space");
    };
    const fs = new QueuedFS(disk);
    await expect(fs.snapshot("d", "x", 14)).rejects.toThrow("no space");
    await fs.writeAtomic("d/a.csv", "ok");
    expect(disk.written).toEqual(["ok"]);
  });

  it("returns null for a missing file", async () => {
    const fs = new QueuedFS(new MemFS());
    expect(await fs.readTextIfExists("nowhere.csv")).toBeNull();
  });
});

describe("MirrorFS", () => {
  const setup = () => {
    const disk = new MemFS();
    void disk.mkdirs("G:/Drive/CK");
    const mirror = new MirrorFS(disk);
    mirror.useFolder("G:\\Drive\\CK", "/this-computer/local-copy");
    return { disk, fs: new QueuedFS(mirror), mirror };
  };

  it("repeats each save inside the data folder in this computer's copy", async () => {
    const { disk, fs } = setup();
    await fs.writeAtomic("G:\\Drive\\CK/classes/10A/marks.csv", "m");
    expect(await disk.readText("/this-computer/local-copy/classes/10A/marks.csv")).toBe("m");
  });

  it("leaves backups, exports and files outside the folder alone", async () => {
    const { disk, fs } = setup();
    await fs.writeAtomic("G:/Drive/CK/backups/x/a.csv", "b");
    await fs.writeAtomic("G:/Drive/CK/exports/a.csv", "e");
    await fs.writeAtomic("C:/elsewhere/a.csv", "o");
    expect([...disk.files.keys()].some((k) => k.startsWith("/this-computer"))).toBe(false);
  });

  it("follows a renamed class into the copy", async () => {
    const { disk, fs } = setup();
    await fs.writeAtomic("G:/Drive/CK/classes/9C/class.md", "c");
    await fs.rename("G:/Drive/CK/classes/9C", "G:/Drive/CK/classes/9C Science");
    expect(await disk.readTextIfExists("/this-computer/local-copy/classes/9C Science/class.md")).toBe("c");
    expect(await disk.readTextIfExists("/this-computer/local-copy/classes/9C/class.md")).toBeNull();
  });

  it("refuses to save into a data folder that has gone, instead of re-creating it", async () => {
    const disk = new MemFS();
    const mirror = new MirrorFS(disk);
    mirror.useFolder("G:/Drive/CK", "/this-computer/local-copy");
    const fs = new QueuedFS(mirror);
    await expect(fs.writeAtomic("G:/Drive/CK/classes/10A/marks.csv", "m")).rejects.toThrow(/isn't available/);
    expect(await disk.exists("G:/Drive/CK")).toBe(false);
  });

  it("stops copying once mirroring is switched off", async () => {
    const { disk, fs, mirror } = setup();
    mirror.useFolder("G:/Drive/CK", null);
    await fs.writeAtomic("G:/Drive/CK/a.csv", "x");
    expect(await disk.readTextIfExists("/this-computer/local-copy/a.csv")).toBeNull();
  });
});

describe("MemFS copies", () => {
  it("refreshes the copy in the same pass as the backup, without exports, and drops what's gone", async () => {
    const disk = new MemFS();
    await disk.writeAtomic("D/behaviours.csv", "b");
    await disk.writeAtomic("D/exports/r.xlsx", "x");
    await disk.writeAtomic("/this-computer/local-copy/classes/old/class.md", "gone");
    await disk.writeAtomic("/this-computer/local-copy/.source.json", "{}");
    await disk.snapshot("D", "2026-01-01_080000", 14, { to: "/this-computer/local-copy", guard: "/this-computer/offline-session.json" });
    expect(await disk.readText("D/backups/2026-01-01_080000/behaviours.csv")).toBe("b");
    expect(await disk.readText("/this-computer/local-copy/behaviours.csv")).toBe("b");
    expect(await disk.readTextIfExists("/this-computer/local-copy/exports/r.xlsx")).toBeNull();
    expect(await disk.readTextIfExists("/this-computer/local-copy/classes/old/class.md")).toBeNull();
    expect(await disk.readTextIfExists("/this-computer/local-copy/.source.json")).toBe("{}");
  });

  it("doesn't refresh the copy while its guard file exists", async () => {
    const disk = new MemFS();
    await disk.writeAtomic("D/behaviours.csv", "drive");
    await disk.writeAtomic("/this-computer/local-copy/behaviours.csv", "offline edit");
    await disk.writeAtomic("/this-computer/offline-session.json", "{}");
    await disk.snapshot("D", "s", 14, { to: "/this-computer/local-copy", guard: "/this-computer/offline-session.json" });
    expect(await disk.readText("/this-computer/local-copy/behaviours.csv")).toBe("offline edit");
  });

  it("only copies and removes inside the app's local folder", async () => {
    const disk = new MemFS();
    await disk.writeAtomic("D/a.csv", "a");
    await expect(disk.copyFolder("/this-computer/x", "D", [])).rejects.toThrow(/local folder/);
    await expect(disk.removeLocal("D")).rejects.toThrow(/local folder/);
    await disk.writeAtomic("/this-computer/local-copy/a.csv", "a");
    await disk.copyFolder("/this-computer/local-copy", "/this-computer/offline-base", []);
    expect(await disk.readText("/this-computer/offline-base/a.csv")).toBe("a");
    await disk.removeLocal("/this-computer/offline-base");
    expect(await disk.exists("/this-computer/offline-base")).toBe(false);
  });
});
