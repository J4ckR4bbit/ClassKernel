// Axes for the simulations' graphs: a plotting frame on nice scales, drawn the
// way a paper draws them — arrows on the axes, the x-axis through zero, labels
// with their units, and (optionally) the grid and numbers.

import { Scale, formatTick, tickValues } from "../scale";
import { INK, arrowHead, line, richText, text } from "./canvas";

export interface Frame {
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: Scale;
  y: Scale;
  X(v: number): number;
  Y(v: number): number;
}

export function frame(left: number, right: number, top: number, bottom: number, x: Scale, y: Scale): Frame {
  return {
    left,
    right,
    top,
    bottom,
    x,
    y,
    X: (v) => left + ((v - x.min) / (x.max - x.min)) * (right - left),
    Y: (v) => bottom - ((v - y.min) / (y.max - y.min)) * (bottom - top),
  };
}

export interface AxesLook {
  xLabel: string;
  yLabel: string;
  /** Grid lines and numbers on the axes. */
  values: boolean;
  screen: boolean;
  /** How a tick's number is written; the scale's own decimals by default. */
  xTick?: (v: number) => string;
  yTick?: (v: number) => string;
}

const minus = (s: string) => s.replace(/^-/, "−");

/** The grid, numbers and the two axes, with the x-axis along y = 0 when zero is on the scale. */
export function drawAxes(ctx: CanvasRenderingContext2D, f: Frame, look: AxesLook) {
  const zeroY = f.y.min <= 0 && f.y.max >= 0 ? f.Y(0) : f.bottom;
  const zeroX = f.x.min <= 0 && f.x.max >= 0 ? f.X(0) : f.left;
  ctx.lineWidth = 1;
  if (look.values) {
    ctx.strokeStyle = look.screen ? "#e6eaee" : "#ddd";
    for (const v of tickValues(f.x)) line(ctx, f.X(v), f.top, f.X(v), f.bottom);
    for (const v of tickValues(f.y)) line(ctx, f.left, f.Y(v), f.right, f.Y(v));
    for (const v of tickValues(f.x)) {
      if (Math.abs(v) < 1e-12 && zeroX > f.left) continue;
      text(ctx, minus(look.xTick ? look.xTick(v) : formatTick(v, f.x.step)), f.X(v), Math.min(f.bottom, zeroY) + 15, "center", 13, "#5f6b76");
    }
    for (const v of tickValues(f.y)) {
      text(ctx, minus(look.yTick ? look.yTick(v) : formatTick(v, f.y.step)), zeroX - 8, f.Y(v), "right", 13, "#5f6b76");
    }
  }
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.8;
  line(ctx, zeroX, f.bottom, zeroX, f.top - 4);
  arrowHead(ctx, zeroX, f.top - 10, -Math.PI / 2, 9);
  line(ctx, f.left, zeroY, f.right + 8, zeroY);
  arrowHead(ctx, f.right + 14, zeroY, 0, 9);
  richText(ctx, look.yLabel, zeroX + 10, f.top - 6, "left", 15, INK);
  richText(ctx, look.xLabel, f.right + 12, zeroY + (look.values ? 34 : 18), "right", 15, INK);
}

/** A polyline through the points in plotting units, solid or dashed. */
export function plot(ctx: CanvasRenderingContext2D, f: Frame, points: Array<[number, number]>, colour: string, width = 2.6, dash: number[] = []) {
  if (points.length < 2) return;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(f.X(x), f.Y(y)) : ctx.moveTo(f.X(x), f.Y(y))));
  ctx.stroke();
  ctx.setLineDash([]);
}
