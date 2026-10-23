import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, getFS, setFS } from "./fs";
import { stringifyCsv, parseCsv } from "./csv";
import * as repo from "./repo";
import {
  LocalPaths,
  SettleTracker,
  changedFiles,
  decideBoot,
  isReady,
  localPaths,
  readSession,
  startOfflineSession,
  syncBack,
} from "./offline";

const REAL = "G:/My Drive/ClassKernel";
const CLS = "10A";
let disk: MemFS;
let paths: LocalPaths;

const ATT_COLS = ["date", "student_id", "status", "note"];
const att = (...rows: Array<[string, string, string]>) =>
  stringifyCsv(
    rows.map(([date, student_id, status]) => ({ date, student_id, status, note: "" })),
    ATT_COLS,
  );

/** The data folder as it was when this computer last refreshed its copy. */
async function seed() {
  await repo.ensureDataDir(REAL);
  await repo.saveClassInfo(REAL, { name: CLS, year: "10", subject: "PS", room: "Lab 3", notes: "", archived: false, color: "" });
  await disk.writeAtomic(`${REAL}/classes/${CLS}/attendance.csv`, att(["2026-03-09", "s1", "P"]));
  await disk.snapshot(REAL, "2026-03-09_070000", 14, { to: paths.copy, guard: paths.session });
}

beforeEach(async () => {
  disk = new MemFS();
  setFS(disk);
  paths = await localPaths();
  await seed();
});

describe("decideBoot", () => {
  const source = { realDir: REAL, refreshedAt: "t" };
  it("works from the copy whenever changes are waiting", () => {
    expect(decideBoot({ savedDir: REAL, session: { realDir: REAL, since: "", copyRefreshedAt: "" }, ready: true, source })).toEqual({
      kind: "copy",
      realDir: REAL,
    });
  });
  it("opens a ready folder, waits for a missing one, and asks when there is none", () => {
    expect(decideBoot({ savedDir: REAL, session: null, ready: true, source })).toEqual({ kind: "open", dir: REAL });
    expect(decideBoot({ savedDir: REAL, session: null, ready: false, source })).toEqual({ kind: "wait", realDir: REAL, copyAvailable: true });
    expect(decideBoot({ savedDir: null, session: null, ready: false, source: null })).toEqual({ kind: "onboarding" });
  });
  it("only offers a copy taken from the same folder", () => {
    const plan = decideBoot({ savedDir: "D:/Other", session: null, ready: false, source });
    expect(plan).toEqual({ kind: "wait", realDir: "D:/Other", copyAvailable: false });
    expect(decideBoot({ savedDir: "g:\\My Drive\\ClassKernel\\", session: null, ready: false, source })).toMatchObject({ copyAvailable: true });
  });
});

describe("isReady", () => {
  it("needs behaviours.csv to read with content", async () => {
    expect(await isReady(REAL)).toBe(true);
    expect(await isReady("H:/nowhere")).toBe(false);
  });
  it("treats a folder that errors or hangs as not ready", async () => {
    disk.readTextIfExists = () => Promise.reject(new Error("The cloud file provider is not running"));
    expect(await isReady(REAL)).toBe(false);
    disk.readTextIfExists = () => new Promise(() => {});
    expect(await isReady(REAL, 20)).toBe(false);
  });
});

describe("an offline period", () => {
  it("keeps its starting point once, even across launches", async () => {
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/classes/${CLS}/attendance.csv`, att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    // Next launch, Drive still missing: the session carries on, the base stays.
    await startOfflineSession(await localPaths(), REAL);
    expect(await disk.readText(`${paths.base}/classes/${CLS}/attendance.csv`)).toBe(att(["2026-03-09", "s1", "P"]));
    expect(await changedFiles(paths)).toEqual([`classes/${CLS}/attendance.csv`]);
  });

  it("isn't overwritten by a refresh while it lasts", async () => {
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/classes/${CLS}/attendance.csv`, "offline work");
    await disk.snapshot(REAL, "2026-03-11_070000", 14, { to: paths.copy, guard: paths.session });
    expect(await disk.readText(`${paths.copy}/classes/${CLS}/attendance.csv`)).toBe("offline work");
  });
});

describe("syncBack", () => {
  const ATT = `classes/${CLS}/attendance.csv`;
  const offline = async (rel: string, text: string) => {
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/${rel}`, text);
  };

  it("copies a change across when the data folder hasn't changed, keeping the original", async () => {
    await offline(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    const r = await syncBack(paths, REAL, "s1");
    expect(r.copied).toEqual([ATT]);
    expect(await disk.readText(`${REAL}/${ATT}`)).toBe(att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    expect(await disk.readText(`${REAL}/backups/.sync/s1/drive/${ATT}`)).toBe(att(["2026-03-09", "s1", "P"]));
    expect(await readSession(paths)).toBeNull();
    expect(await disk.exists(paths.base)).toBe(false);
  });

  it("joins with work done on another computer since the copy was taken", async () => {
    await offline(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    await disk.writeAtomic(`${REAL}/${ATT}`, att(["2026-03-09", "s1", "L"], ["2026-03-09", "s2", "P"]));
    const r = await syncBack(paths, REAL, "s1");
    expect(r.joined).toEqual([ATT]);
    const rows = parseCsv(await disk.readText(`${REAL}/${ATT}`)).map((x) => `${x.date} ${x.student_id} ${x.status}`);
    expect(rows).toEqual(["2026-03-09 s1 L", "2026-03-09 s2 P", "2026-03-10 s1 A"]);
    expect(await disk.readTextIfExists(`${REAL}/backups/.sync/s1/this-computer/${ATT}`)).not.toBeNull();
  });

  it("joins work from a session that was closed before Drive came back", async () => {
    await offline(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    // The app closes; next morning Drive is up. Boot sees the marker first.
    const next = await localPaths();
    const session = await readSession(next);
    expect(decideBoot({ savedDir: REAL, session, ready: true, source: null }).kind).toBe("copy");
    await syncBack(next, REAL, "s2");
    expect(await disk.readText(`${REAL}/${ATT}`)).toContain("2026-03-10,s1,A");
  });

  it("doesn't re-create a class renamed on another computer", async () => {
    await offline(ATT, att(["2026-03-09", "s1", "P"], ["2026-03-10", "s1", "A"]));
    await disk.rename(`${REAL}/classes/${CLS}`, `${REAL}/classes/10A Physics`);
    const r = await syncBack(paths, REAL, "s1");
    expect(r.keptAside).toHaveLength(1);
    expect(r.keptAside[0].reason).toMatch(/renamed or removed/);
    expect(await disk.exists(`${REAL}/classes/${CLS}/attendance.csv`)).toBe(false);
    expect(await disk.readTextIfExists(`${REAL}/backups/.sync/s1/this-computer/${ATT}`)).not.toBeNull();
  });

  it("writes a class created while offline", async () => {
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/classes/11B/class.md`, "---\nname: 11B\n---\n");
    const r = await syncBack(paths, REAL, "s1");
    expect(r.copied).toEqual(["classes/11B/class.md"]);
    expect(await disk.exists(`${REAL}/classes/11B/class.md`)).toBe(true);
  });

  it("leaves a file it can't safely join, with both versions kept", async () => {
    await offline(ATT, att(["2026-03-09", "s1", "A"]));
    await disk.writeAtomic(`${REAL}/${ATT}`, "");
    const r = await syncBack(paths, REAL, "s1");
    expect(r.keptAside[0].reason).toMatch(/empty/);
    expect(await disk.readText(`${REAL}/${ATT}`)).toBe("");
  });

  it("picks up where it stopped after a failure, without doubling anything", async () => {
    const BEH = `classes/${CLS}/behaviour.csv`;
    const cols = ["timestamp", "student_id", "code", "points", "note"];
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/${BEH}`, stringifyCsv([{ timestamp: "t1", student_id: "s1", code: "Q+", points: 1, note: "" }], cols));
    await disk.writeAtomic(`${paths.copy}/${ATT}`, att(["2026-03-10", "s1", "A"]));
    await disk.writeAtomic(`${REAL}/${BEH}`, stringifyCsv([{ timestamp: "t0", student_id: "s2", code: "Q+", points: 1, note: "" }], cols));
    // The data folder drops out after the first file.
    const real = disk.writeAtomic.bind(disk);
    let writes = 0;
    disk.writeAtomic = async (path, text, root) => {
      if (path.startsWith(`${REAL}/classes`) && ++writes > 1) throw new Error("Drive went away");
      return real(path, text, root);
    };
    await expect(syncBack(paths, REAL, "s1")).rejects.toThrow("Drive went away");
    expect(await readSession(paths)).not.toBeNull();
    disk.writeAtomic = real;
    await syncBack(paths, REAL, "s2");
    expect(parseCsv(await getFS().readText(`${REAL}/${BEH}`))).toHaveLength(2);
    expect(await getFS().readText(`${REAL}/${ATT}`)).toContain("2026-03-10,s1,A");
  });

  it("works test totals out again from the joined question marks", async () => {
    await repo.saveAssessmentQuestions(REAL, CLS, [
      { assessmentId: "t1", number: 1, topic: "", marks: 5, cognitiveLevel: "" },
      { assessmentId: "t1", number: 2, topic: "", marks: 5, cognitiveLevel: "" },
    ]);
    await repo.saveQuestionMarks(REAL, CLS, [{ assessmentId: "t1", studentId: "s1", number: 1, mark: 2 }]);
    await repo.saveMarks(REAL, CLS, [{ assessmentId: "t1", studentId: "s1", mark: 2, comment: "" }]);
    await disk.snapshot(REAL, "x", 14, { to: paths.copy, guard: paths.session });
    await startOfflineSession(paths, REAL);
    // Offline: Q1 changes to 4 (total 4). At home: Q2 entered as 3 (total 5).
    const QM = `classes/${CLS}/question_marks.csv`;
    const MK = `classes/${CLS}/marks.csv`;
    const qcols = ["assessment_id", "student_id", "q_number", "mark"];
    const mcols = ["assessment_id", "student_id", "mark", "comment"];
    await disk.writeAtomic(`${paths.copy}/${QM}`, stringifyCsv([{ assessment_id: "t1", student_id: "s1", q_number: 1, mark: 4 }], qcols));
    await disk.writeAtomic(`${paths.copy}/${MK}`, stringifyCsv([{ assessment_id: "t1", student_id: "s1", mark: 4, comment: "" }], mcols));
    await disk.writeAtomic(
      `${REAL}/${QM}`,
      stringifyCsv(
        [
          { assessment_id: "t1", student_id: "s1", q_number: 1, mark: 2 },
          { assessment_id: "t1", student_id: "s1", q_number: 2, mark: 3 },
        ],
        qcols,
      ),
    );
    await disk.writeAtomic(`${REAL}/${MK}`, stringifyCsv([{ assessment_id: "t1", student_id: "s1", mark: 5, comment: "" }], mcols));
    await syncBack(paths, REAL, "s1");
    const marks = await repo.loadMarks(REAL, CLS);
    expect(marks.find((m) => m.studentId === "s1")?.mark).toBe(7);
  });

  it("points out a student added on both computers", async () => {
    const ST = `classes/${CLS}/students.csv`;
    const cols = ["id", "first_name", "last_name", "adam_no", "gender", "flags", "notes"];
    const s = (id: string) => ({ id, first_name: "Thabo", last_name: "Mokoena", adam_no: "", gender: "", flags: "", notes: "" });
    await startOfflineSession(paths, REAL);
    await disk.writeAtomic(`${paths.copy}/${ST}`, stringifyCsv([s("a1")], cols));
    await disk.writeAtomic(`${REAL}/${ST}`, stringifyCsv([s("b2")], cols));
    const r = await syncBack(paths, REAL, "s1");
    expect(r.notes.some((n) => n.includes("Thabo Mokoena appears twice"))).toBe(true);
  });

  it("points out a sync client's conflict copy", async () => {
    await offline(ATT, att(["2026-03-10", "s1", "A"]));
    await disk.writeAtomic(`${REAL}/classes/${CLS}/attendance (1).csv`, "x");
    const r = await syncBack(paths, REAL, "s1");
    expect(r.notes.some((n) => n.includes("attendance (1).csv"))).toBe(true);
  });
});

describe("SettleTracker", () => {
  it("needs the folder ready on polls far enough apart", () => {
    const t = new SettleTracker(30_000);
    expect(t.poll(true, 0)).toBe(false);
    expect(t.poll(true, 10_000)).toBe(false);
    expect(t.poll(false, 20_000)).toBe(false);
    expect(t.poll(true, 25_000)).toBe(false);
    expect(t.poll(true, 55_000)).toBe(true);
  });
});
