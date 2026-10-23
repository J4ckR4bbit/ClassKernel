import { describe, expect, it } from "vitest";
import { mergeFile } from "./merge";
import { parseCsv, stringifyCsv } from "./csv";

const ATT = "classes/10A/attendance.csv";
const ATT_COLS = ["date", "student_id", "status", "note"];
const att = (...rows: Array<[string, string, string]>) =>
  stringifyCsv(
    rows.map(([date, student_id, status]) => ({ date, student_id, status, note: "" })),
    ATT_COLS,
  );

const merged = (r: ReturnType<typeof mergeFile>) => {
  if (r.status !== "merged") throw new Error(`refused: ${r.reason}`);
  return r;
};
const rowsOf = (text: string) => parseCsv(text);

describe("mergeFile — rows identified by key", () => {
  const base = att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "P"]);

  it("keeps rows added on both sides", () => {
    const ours = att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "P"], ["2026-03-10", "s1", "P"]);
    const theirs = att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "A"], ["2026-03-08", "s1", "L"]);
    const r = merged(mergeFile(ATT, base, ours, theirs));
    expect(rowsOf(r.text).map((x) => `${x.date} ${x.student_id} ${x.status}`)).toEqual([
      "2026-03-09 s1 P",
      "2026-03-09 s2 A",
      "2026-03-08 s1 L",
      "2026-03-10 s1 P",
    ]);
    expect(r.clashes).toEqual([]);
  });

  it("lets this computer win when both changed the same entry, and reports it", () => {
    const ours = att(["2026-03-09", "s1", "A"], ["2026-03-09", "s2", "P"]);
    const theirs = att(["2026-03-09", "s1", "L"], ["2026-03-09", "s2", "P"]);
    const r = merged(mergeFile(ATT, base, ours, theirs));
    expect(rowsOf(r.text).find((x) => x.student_id === "s1")?.status).toBe("A");
    expect(r.clashes).toHaveLength(1);
    expect(r.clashes[0].what).toBe("2026-03-09, s1");
  });

  it("removes a row this computer removed, and keeps a removal over an edit elsewhere", () => {
    const ours = att(["2026-03-09", "s1", "P"]);
    const theirs = att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "E"]);
    const r = merged(mergeFile(ATT, base, ours, theirs));
    expect(rowsOf(r.text).map((x) => x.student_id)).toEqual(["s1"]);
    expect(r.clashes).toHaveLength(1);
  });

  it("changes nothing when run again on its own result", () => {
    const ours = att(["2026-03-09", "s1", "A"], ["2026-03-10", "s1", "P"]);
    const theirs = att(["2026-03-09", "s1", "P"], ["2026-03-09", "s2", "P"], ["2026-03-08", "s3", "L"]);
    const once = merged(mergeFile(ATT, base, ours, theirs)).text;
    const twice = merged(mergeFile(ATT, base, ours, once)).text;
    expect(twice).toBe(once);
  });

  it("never counts a behaviour event twice when a join is retried", () => {
    const rel = "classes/10A/behaviour.csv";
    const cols = ["timestamp", "student_id", "code", "points", "note"];
    const ev = (ts: string, id: string) => ({ timestamp: ts, student_id: id, code: "Q+", points: 1, note: "" });
    const b = stringifyCsv([ev("2026-03-09T08:00:00Z", "s1")], cols);
    const o = stringifyCsv([ev("2026-03-09T08:00:00Z", "s1"), ev("2026-03-10T08:00:00Z", "s2")], cols);
    const t = stringifyCsv([ev("2026-03-09T08:00:00Z", "s1"), ev("2026-03-09T19:00:00Z", "s3")], cols);
    const once = merged(mergeFile(rel, b, o, t)).text;
    expect(rowsOf(once)).toHaveLength(3);
    expect(rowsOf(merged(mergeFile(rel, b, o, once)).text)).toHaveLength(3);
  });

  it("treats 1.50 and 1.5 as the same mark", () => {
    const rel = "classes/10A/marks.csv";
    const cols = ["assessment_id", "student_id", "mark", "comment"];
    const b = stringifyCsv([{ assessment_id: "a", student_id: "s1", mark: "1.50", comment: "" }], cols);
    const o = stringifyCsv([{ assessment_id: "a", student_id: "s1", mark: "1.5", comment: "" }], cols);
    const t = stringifyCsv([{ assessment_id: "a", student_id: "s1", mark: "7", comment: "" }], cols);
    expect(rowsOf(merged(mergeFile(rel, b, o, t)).text)[0].mark).toBe("7");
  });

  it("ignores a report comment's 'updated' time, so an untouched comment never reverts an edit elsewhere", () => {
    const rel = "classes/10A/report_comments.csv";
    const cols = ["student_id", "comment", "updated"];
    const c = (id: string, comment: string, updated: string) => ({ student_id: id, comment, updated });
    const b = stringifyCsv([c("s1", "Friday", "t0"), c("s2", "Friday", "t0")], cols);
    const o = stringifyCsv([c("s1", "Monday at school", "t2"), c("s2", "Friday", "t2")], cols);
    const t = stringifyCsv([c("s1", "Friday", "t0"), c("s2", "Sunday at home", "t1")], cols);
    const r = rowsOf(merged(mergeFile(rel, b, o, t)).text);
    expect(r.map((x) => x.comment)).toEqual(["Monday at school", "Sunday at home"]);
  });

  it("keeps notes that run over several lines", () => {
    const rel = "classes/10A/students.csv";
    const cols = ["id", "first_name", "last_name", "adam_no", "gender", "flags", "notes"];
    const s = (id: string, notes: string) => ({ id, first_name: "A", last_name: "B", adam_no: "", gender: "", flags: "", notes });
    const b = stringifyCsv([s("s1", "line one")], cols);
    const o = stringifyCsv([s("s1", "line one\nline two, with a comma")], cols);
    const t = stringifyCsv([s("s1", "line one"), s("s2", "")], cols);
    const r = rowsOf(merged(mergeFile(rel, b, o, t)).text);
    expect(r[0].notes).toBe("line one\nline two, with a comma");
    expect(r).toHaveLength(2);
  });

  it("joins a file that is new on both sides", () => {
    const r = merged(mergeFile(ATT, null, att(["2026-03-10", "s1", "P"]), att(["2026-03-10", "s2", "A"])));
    expect(rowsOf(r.text)).toHaveLength(2);
  });

  it("keeps a column a newer version of the app added", () => {
    const t = "date,student_id,status,note,minutes_late\r\n2026-03-09,s1,L,,5\r\n2026-03-09,s2,P,,\r\n";
    const r = rowsOf(merged(mergeFile(ATT, base, base, t)).text);
    expect(r[0].minutes_late).toBe("5");
  });
});

describe("mergeFile — files it won't join on its own", () => {
  it("refuses when the data folder's copy is empty but wasn't before", () => {
    const base = att(["2026-03-09", "s1", "P"]);
    const r = mergeFile(ATT, base, att(["2026-03-09", "s1", "A"]), "");
    expect(r.status).toBe("refused");
  });

  it("refuses when a version can't be read", () => {
    const r = mergeFile(ATT, att(["2026-03-09", "s1", "P"]), att(["2026-03-09", "s1", "A"]), 'date,student_id\r\n"2026-03-09,s1\r\n');
    expect(r.status).toBe("refused");
  });
});

describe("mergeFile — units that move as a whole", () => {
  const SEAT = "classes/10A/seating.csv";
  const cols = ["plan_name", "desk_id", "seat_index", "student_id"];
  const plan = (name: string, ...ids: string[]) => ids.map((id, i) => ({ plan_name: name, desk_id: "d1", seat_index: i, student_id: id }));

  it("never seats a student twice when both computers rearranged the same plan", () => {
    const b = stringifyCsv(plan("Default", "s1", "s2", "s3"), cols);
    const o = stringifyCsv(plan("Default", "s3", "s1", "s2"), cols);
    const t = stringifyCsv(plan("Default", "s2", "s3", "s1"), cols);
    const r = merged(mergeFile(SEAT, b, o, t));
    expect(rowsOf(r.text).map((x) => x.student_id)).toEqual(["s3", "s1", "s2"]);
    expect(r.clashes).toHaveLength(1);
  });

  it("keeps changes to different plans from each side", () => {
    const b = stringifyCsv([...plan("Default", "s1"), ...plan("Test", "s1")], cols);
    const o = stringifyCsv([...plan("Default", "s2"), ...plan("Test", "s1")], cols);
    const t = stringifyCsv([...plan("Default", "s1"), ...plan("Test", "s3")], cols);
    const r = rowsOf(merged(mergeFile(SEAT, b, o, t)).text);
    expect(r.map((x) => `${x.plan_name}:${x.student_id}`)).toEqual(["Default:s2", "Test:s3"]);
  });

  it("takes this computer's room layout when both changed it", () => {
    const rel = "classes/10A/desks.csv";
    const r = merged(mergeFile(rel, "desk_id\r\nd1\r\n", "desk_id\r\nd1\r\nd2\r\n", "desk_id\r\nd9\r\n"));
    expect(r.text).toBe("desk_id\r\nd1\r\nd2\r\n");
    expect(r.clashes).toHaveLength(1);
  });

  it("takes the data folder's layout when only it changed", () => {
    const rel = "classes/10A/desks.csv";
    expect(merged(mergeFile(rel, "a\r\n", "a\r\n", "b\r\n")).text).toBe("b\r\n");
  });
});

describe("mergeFile — class.md", () => {
  it("joins the class details field by field", () => {
    const rel = "classes/10A/class.md";
    const md = (archived: boolean, notes: string) =>
      `---\nname: 10A\nyear: 10\nsubject: PS\nroom: Lab 3\narchived: ${archived}\ncolor: \n---\n${notes}`;
    const r = merged(mergeFile(rel, md(false, "old"), md(false, "new notes"), md(true, "old")));
    expect(r.text).toContain("archived: true");
    expect(r.text).toContain("new notes");
    expect(r.clashes).toEqual([]);
  });
});
