import { describe, expect, it } from "vitest";
import { MemFS, QueuedFS } from "./fs";

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
