import { describe, expect, it } from "vitest";
import { ROOM_H, ROOM_W, fitView } from "./room";
import type { Desk } from "./types";

const desk = (x: number, y: number, w = 80, h = 60, rotation = 0): Desk => ({
  id: `d${x}-${y}`,
  label: "",
  shape: "double",
  x,
  y,
  w,
  h,
  rotation,
  color: "",
  textColor: "",
  stripColor: "",
});

describe("fitView", () => {
  it("is the whole room when there are no desks", () => {
    expect(fitView([])).toEqual({ x: 0, y: 0, w: ROOM_W, h: ROOM_H });
  });

  it("frames the furniture with a margin", () => {
    expect(fitView([desk(300, 200), desk(500, 400)])).toEqual({ x: 270, y: 170, w: 340, h: 320 });
  });

  it("allows for a rotated desk's corners", () => {
    // 80×60 turned 90° is 60 wide and 80 tall about the same centre (340, 230).
    expect(fitView([desk(300, 200, 80, 60, 90)])).toEqual({ x: 280, y: 160, w: 120, h: 140 });
  });

  it("never reaches outside the room", () => {
    const v = fitView([desk(0, 0), desk(ROOM_W - 80, ROOM_H - 60)]);
    expect(v).toEqual({ x: 0, y: 0, w: ROOM_W, h: ROOM_H });
  });
});
