import { describe, expect, it } from "vitest";
import { assignRandomSeats, seatSlots, spreadSlots } from "./seating";
import { Desk, Student } from "./types";
import { mulberry32 } from "./demo";

const mkStudent = (id: string, gender = ""): Student => ({
  id,
  firstName: id.toUpperCase(),
  lastName: "Test",
  gender,
  flags: "",
  notes: "",
});

const mkDesk = (id: string, x: number, y: number, shape: Desk["shape"] = "double"): Desk => ({
  id,
  label: "",
  shape,
  x,
  y,
  w: shape === "double" ? 160 : shape === "group4" ? 160 : 80,
  h: shape === "group4" ? 120 : 60,
  rotation: 0,
  color: "",
});

describe("seatSlots", () => {
  it("gives the right seat count per shape", () => {
    expect(seatSlots(mkDesk("d", 0, 0, "single"))).toHaveLength(1);
    expect(seatSlots(mkDesk("d", 0, 0, "double"))).toHaveLength(2);
    expect(seatSlots(mkDesk("d", 0, 0, "teacher"))).toHaveLength(0);
  });

  it("rotates seat positions with the desk", () => {
    const flat = seatSlots(mkDesk("d", 100, 100, "double"));
    const rotated = seatSlots({ ...mkDesk("d", 100, 100, "double"), rotation: 90 });
    // Unrotated double desk: seats side by side horizontally.
    expect(Math.abs(flat[0].y - flat[1].y)).toBeLessThan(0.01);
    // Rotated 90°: seats stacked vertically.
    expect(Math.abs(rotated[0].x - rotated[1].x)).toBeLessThan(0.01);
    expect(Math.abs(rotated[0].y - rotated[1].y)).toBeGreaterThan(10);
  });
});

describe("assignRandomSeats", () => {
  const desks = [
    mkDesk("d1", 0, 0),
    mkDesk("d2", 300, 0),
    mkDesk("d3", 0, 300),
    mkDesk("d4", 300, 300),
  ]; // 8 seats over 4 desks, two "rows"

  it("seats every student exactly once when capacity allows", () => {
    const students = Array.from({ length: 8 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: [],
      alternateGender: false,
    }, 100, mulberry32(1));
    expect(result.assignments).toHaveLength(8);
    expect(new Set(result.assignments.map((a) => a.studentId)).size).toBe(8);
    expect(new Set(result.assignments.map((a) => `${a.deskId}:${a.seatIndex}`)).size).toBe(8);
  });

  it("keeps apart-pairs off the same desk", () => {
    const students = Array.from({ length: 8 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [["s0", "s1"]],
      togetherPairs: [],
      frontIds: [],
      alternateGender: false,
    }, 400, mulberry32(2));
    expect(result.violations).toEqual([]);
    const deskOf = (id: string) => result.assignments.find((a) => a.studentId === id)?.deskId;
    expect(deskOf("s0")).not.toBe(deskOf("s1"));
  });

  it("puts together-pairs on the same desk", () => {
    const students = Array.from({ length: 8 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [["s2", "s3"]],
      frontIds: [],
      alternateGender: false,
    }, 400, mulberry32(3));
    expect(result.violations).toEqual([]);
    const deskOf = (id: string) => result.assignments.find((a) => a.studentId === id)?.deskId;
    expect(deskOf("s2")).toBe(deskOf("s3"));
  });

  it("pins front students to the front band of the room", () => {
    const students = Array.from({ length: 8 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: ["s7"],
      alternateGender: false,
    }, 400, mulberry32(4));
    expect(result.violations).toEqual([]);
    const a = result.assignments.find((a) => a.studentId === "s7")!;
    // Front row desks are d1/d2 (y=0).
    expect(["d1", "d2"]).toContain(a.deskId);
  });

  it("mixes genders on desks when asked and possible", () => {
    const students = Array.from({ length: 8 }, (_, i) => mkStudent(`s${i}`, i % 2 ? "M" : "F"));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: [],
      alternateGender: true,
    }, 800, mulberry32(5));
    expect(result.violations).toEqual([]);
  });

  it("reports violations instead of failing when constraints are impossible", () => {
    // 2 students, 1 double desk, but they must be apart: impossible.
    const students = [mkStudent("s0"), mkStudent("s1")];
    const result = assignRandomSeats(students, [mkDesk("d1", 0, 0)], "P", {
      apartPairs: [["s0", "s1"]],
      togetherPairs: [],
      frontIds: [],
      alternateGender: false,
    }, 50, mulberry32(6));
    expect(result.assignments).toHaveLength(2);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("spreads students evenly across desks, filling front desks first", () => {
    // Six 4-seaters in two rows, 17 students → 3,3,3 at the front row,
    // 3,3,2 behind: every desk gets 3 except one back desk with 2.
    const groupDesks = [
      mkDesk("f1", 0, 0, "group4"),
      mkDesk("f2", 250, 0, "group4"),
      mkDesk("f3", 500, 0, "group4"),
      mkDesk("b1", 0, 300, "group4"),
      mkDesk("b2", 250, 300, "group4"),
      mkDesk("b3", 500, 300, "group4"),
    ];
    const students = Array.from({ length: 17 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, groupDesks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: [],
      alternateGender: false,
    }, 50, mulberry32(8));
    expect(result.assignments).toHaveLength(17);
    const perDesk = new Map<string, number>();
    for (const a of result.assignments) perDesk.set(a.deskId, (perDesk.get(a.deskId) ?? 0) + 1);
    const counts = [...perDesk.values()].sort();
    expect(counts).toEqual([2, 3, 3, 3, 3, 3]);
    // The desk with only 2 is in the back row.
    const deskWith2 = [...perDesk.entries()].find(([, c]) => c === 2)![0];
    expect(["b1", "b2", "b3"]).toContain(deskWith2);
    // Front-row desks are never emptier than back-row desks.
    for (const f of ["f1", "f2", "f3"]) expect(perDesk.get(f)).toBe(3);
  });

  it("respects a non-top front edge for spreading and front pins", () => {
    // Front on the LEFT: left desks (small x) fill first and take front pins.
    const students = Array.from({ length: 5 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: ["s4"],
      alternateGender: false,
      frontEdge: "left",
    }, 400, mulberry32(9));
    expect(result.violations).toEqual([]);
    const perDesk = new Map<string, number>();
    for (const a of result.assignments) perDesk.set(a.deskId, (perDesk.get(a.deskId) ?? 0) + 1);
    // Even spread: every desk seats 1 first, then the 5th student goes to the
    // front-most (left) desk — so the left desks d1/d3 hold 3 of the 5.
    expect((perDesk.get("d1") ?? 0) + (perDesk.get("d3") ?? 0)).toBe(3);
    const pinned = result.assignments.find((a) => a.studentId === "s4")!;
    expect(["d1", "d3"]).toContain(pinned.deskId);
  });

  it("spreadSlots never exceeds desk capacity", () => {
    const slots = spreadSlots(50, desks, "top");
    expect(slots).toHaveLength(8);
    const unique = new Set(slots.map((s) => `${s.deskId}:${s.seatIndex}`));
    expect(unique.size).toBe(8);
  });

  it("seats only up to capacity when the class is bigger than the room", () => {
    const students = Array.from({ length: 20 }, (_, i) => mkStudent(`s${i}`));
    const result = assignRandomSeats(students, desks, "P", {
      apartPairs: [],
      togetherPairs: [],
      frontIds: [],
      alternateGender: false,
    }, 50, mulberry32(7));
    expect(result.assignments).toHaveLength(8);
  });
});
