import { describe, expect, it } from "vitest";
import { deskDisplayLabels, groupSeatsByTable } from "./tables";
import { Desk, SeatAssignment } from "./types";

const mkDesk = (id: string, x: number, y: number, label = "", shape: Desk["shape"] = "double"): Desk => ({
  id,
  label,
  shape,
  x,
  y,
  w: 160,
  h: 60,
  rotation: 0,
  color: "",
  textColor: "",
  stripColor: "",
});

const seat = (deskId: string, seatIndex: number, studentId: string): SeatAssignment => ({
  planName: "Default",
  deskId,
  seatIndex,
  studentId,
});

describe("deskDisplayLabels", () => {
  it("uses the desk's label, else counts seat-bearing desks in layout order", () => {
    const desks = [mkDesk("a", 0, 0), mkDesk("t", 0, 0, "", "teacher"), mkDesk("b", 0, 0, "Lab bench"), mkDesk("c", 0, 0)];
    const labels = deskDisplayLabels(desks);
    expect(labels.get("a")).toBe("Desk 1");
    expect(labels.has("t")).toBe(false);
    expect(labels.get("b")).toBe("Lab bench");
    expect(labels.get("c")).toBe("Desk 3");
  });
});

describe("groupSeatsByTable", () => {
  // Two rows of two desks; the back-left desk is listed first in the layout.
  const desks = [mkDesk("backL", 100, 400), mkDesk("frontR", 500, 100), mkDesk("frontL", 100, 110), mkDesk("backR", 500, 400)];
  const seats = [
    seat("frontL", 1, "s2"),
    seat("frontL", 0, "s1"),
    seat("frontR", 0, "s3"),
    seat("backL", 0, "s4"),
    seat("backR", 1, "s5"),
  ];

  it("orders tables front row first, then across the row, students in seat order", () => {
    const groups = groupSeatsByTable(desks, seats, "top");
    expect(groups.map((g) => g.deskId)).toEqual(["frontL", "frontR", "backL", "backR"]);
    expect(groups[0].studentIds).toEqual(["s1", "s2"]);
  });

  it("follows the room's front edge", () => {
    const groups = groupSeatsByTable(desks, seats, "bottom");
    expect(groups.map((g) => g.deskId)).toEqual(["backL", "backR", "frontL", "frontR"]);
    const left = groupSeatsByTable(desks, seats, "left");
    expect(left.map((g) => g.deskId)).toEqual(["frontL", "backL", "frontR", "backR"]);
  });

  it("leaves out empty desks and keeps the shared labels", () => {
    const groups = groupSeatsByTable([...desks, mkDesk("empty", 900, 100)], seats, "top");
    expect(groups.find((g) => g.deskId === "empty")).toBeUndefined();
    expect(groups.find((g) => g.deskId === "backL")?.label).toBe("Desk 1");
  });
});
