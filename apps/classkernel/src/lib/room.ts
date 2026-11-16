// Room canvas dimensions, shared by geometry code and the SVG views.

import type { Desk } from "./types";

export const ROOM_W = 900;
export const ROOM_H = 640;
export const GRID = 20;

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room units kept around the furniture, so the front-of-room marker still fits. */
const FIT_MARGIN = 30;

/**
 * The part of the room the furniture occupies, plus a margin: what the Seats
 * and Lesson views zoom to when no view crop has been set, so seats and names
 * come out as large as the screen allows. The whole room when there are no desks.
 */
export function fitView(desks: Desk[]): ViewBox {
  if (desks.length === 0) return { x: 0, y: 0, w: ROOM_W, h: ROOM_H };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of desks) {
    // A rotated desk's corners, about its centre (as the SVG rotates it).
    const rad = ((d.rotation % 360) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const halfW = (d.w * cos + d.h * sin) / 2;
    const halfH = (d.w * sin + d.h * cos) / 2;
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    minX = Math.min(minX, cx - halfW);
    minY = Math.min(minY, cy - halfH);
    maxX = Math.max(maxX, cx + halfW);
    maxY = Math.max(maxY, cy + halfH);
  }
  const x = Math.max(0, Math.floor(minX - FIT_MARGIN));
  const y = Math.max(0, Math.floor(minY - FIT_MARGIN));
  const w = Math.min(ROOM_W, Math.ceil(maxX + FIT_MARGIN)) - x;
  const h = Math.min(ROOM_H, Math.ceil(maxY + FIT_MARGIN)) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : { x: 0, y: 0, w: ROOM_W, h: ROOM_H };
}
