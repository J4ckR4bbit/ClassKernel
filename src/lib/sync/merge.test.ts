import { describe, expect, it } from "vitest";
import { parseCsvTable } from "../csv";
import { unionCsv } from "./merge";

const attendance = (rows: string[]) => "date,student_id,status,note\r\n" + rows.join("\r\n") + "\r\n";

describe("unionCsv", () => {
  it("keeps rows that exist on only one side", () => {
    const mine = attendance(["2026-07-20,s1,P,", "2026-07-20,s2,A,"]);
    const theirs = attendance(["2026-07-20,s3,L,"]);
    const merged = unionCsv(mine, theirs, ["date", "student_id"], false);
    const { rows } = parseCsvTable(merged);
    expect(rows.map((r) => r.student_id).sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("does not lose a lesson logged on the other device", () => {
    // The case that matters: two devices logging different behaviour events in
    // the same lesson must end up with both sets.
    const columns = "timestamp,student_id,code,points,note\r\n";
    const mine = columns + "2026-07-20T09:00:00Z,s1,GOOD,1,\r\n";
    const theirs = columns + "2026-07-20T09:05:00Z,s2,LATE,-1,\r\n";
    const merged = unionCsv(mine, theirs, ["timestamp", "student_id", "code"], false);
    expect(parseCsvTable(merged).rows).toHaveLength(2);
  });

  it("lets the newer side win a row both changed", () => {
    const mine = attendance(["2026-07-20,s1,P,"]);
    const theirs = attendance(["2026-07-20,s1,A,late bus"]);
    expect(parseCsvTable(unionCsv(mine, theirs, ["date", "student_id"], true)).rows[0]).toMatchObject({
      status: "A",
      note: "late bus",
    });
    expect(parseCsvTable(unionCsv(mine, theirs, ["date", "student_id"], false)).rows[0]).toMatchObject({
      status: "P",
    });
  });

  it("treats a multi-column key as a whole", () => {
    const columns = "assessment_id,student_id,q_number,mark\r\n";
    const mine = columns + "a1,s1,1,5\r\n" + "a1,s1,2,3\r\n";
    const theirs = columns + "a1,s1,1,4\r\n" + "a1,s2,1,7\r\n";
    const rows = parseCsvTable(
      unionCsv(mine, theirs, ["assessment_id", "student_id", "q_number"], true),
    ).rows;
    // q1 taken from theirs, q2 kept from mine, s2's row added.
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.student_id === "s1" && r.q_number === "1")?.mark).toBe("4");
    expect(rows.find((r) => r.student_id === "s1" && r.q_number === "2")?.mark).toBe("3");
  });

  it("keeps the header and CRLF conventions the rest of the app writes", () => {
    const mine = attendance(["2026-07-20,s1,P,"]);
    const merged = unionCsv(mine, attendance([]), ["date", "student_id"], false);
    expect(merged.startsWith("date,student_id,status,note")).toBe(true);
    expect(merged.includes("\r\n")).toBe(true);
    expect(merged.endsWith("\r\n")).toBe(true);
  });

  it("survives an empty side without dropping the other", () => {
    const mine = attendance(["2026-07-20,s1,P,"]);
    expect(parseCsvTable(unionCsv(mine, "", ["date", "student_id"], false)).rows).toHaveLength(1);
    expect(parseCsvTable(unionCsv("", mine, ["date", "student_id"], true)).rows).toHaveLength(1);
  });

  it("keeps columns the other side does not know about", () => {
    const mine = "id,first_name,last_name\r\ns1,Ada,L\r\n";
    const theirs = "id,first_name,last_name,pronouns\r\ns2,Grace,H,they/them\r\n";
    const merged = unionCsv(mine, theirs, ["id"], true);
    expect(parseCsvTable(merged).columns).toContain("pronouns");
    expect(parseCsvTable(merged).rows).toHaveLength(2);
  });
});
