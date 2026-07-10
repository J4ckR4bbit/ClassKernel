import { describe, expect, it } from "vitest";
import { assignRandomSeats, seatSlots } from "./seating";
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
  w: shape === "double" ? 160 : 80,
  h: 60,
  rotation: 0,
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
