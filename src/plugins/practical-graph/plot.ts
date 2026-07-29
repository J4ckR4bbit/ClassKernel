// Practical graph engine: readings in, a plotted graph out.
//
// The point of a physics practical graph is the gradient, so everything here
// serves that: a least-squares fit, axes on sensible round values, and the
// option to force the line through the origin when the theory says it must be
// proportional. Free of React and of the canvas element so the arithmetic can be
// tested without a browser.

import { MAX_CANVAS_PX, mm } from "../png";
import { formatFixed, formatSigFigs } from "../numbers";
import { Scale, formatTick, niceScale, tickValues } from "../scale";

export interface Reading {
  x: number;
  y: number;
}

export interface PlotSettings {
  title: string;
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
  /** Sheet size in millimetres. */
  widthMm: number;
  heightMm: number;
  showFit: boolean;
  /** Force the fit through (0, 0) — a directly proportional relationship. */
  throughOrigin: boolean;
  /** Include zero on both axes, so proportionality can be read off. */
  startAtZero: boolean;
  showGrid: boolean;
  /** Print the gradient, intercept and R² under the graph. */
  showStats: boolean;
  pointColor: string;
  lineColor: string;
}

export const DEFAULT_PLOT: PlotSettings = {
  title: "",
  xLabel: "",
  xUnit: "",
  yLabel: "",
  yUnit: "",
  widthMm: 160,
  heightMm: 115,
  showFit: true,
  throughOrigin: false,
  startAtZero: true,
  showGrid: true,
  showStats: true,
  pointColor: "#1b2733",
  lineColor: "#c0392b",
};

// ---------- the fit ----------

export interface FitResult {
  gradient: number;
  intercept: number;
  /**
   * How much of the spread the line accounts for. Measured about the mean for
   * an ordinary fit; about zero when the line is forced through the origin,
   * which is the convention for a no-intercept regression.
   */
  r2: number;
  n: number;
  throughOrigin: boolean;
}

/**
 * Least-squares straight line through the readings, or null when there isn't
 * one: fewer than two points, or every reading at the same x (a vertical line
 * has no gradient).
 */
export function fitLine(points: Reading[], throughOrigin = false): FitResult | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  if (pts.every((p) => p.x === pts[0].x)) return null;

  if (throughOrigin) {
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
    if (sumXX === 0) return null;
    const gradient = sumXY / sumXX;
    const ssRes = pts.reduce((s, p) => s + (p.y - gradient * p.x) ** 2, 0);
    const ssTot = pts.reduce((s, p) => s + p.y * p.y, 0);
    return { gradient, intercept: 0, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n, throughOrigin };
  }

  const meanX = pts.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of pts) {
    sxy += (p.x - meanX) * (p.y - meanY);
    sxx += (p.x - meanX) ** 2;
    syy += (p.y - meanY) ** 2;
  }
  if (sxx === 0) return null;
  const gradient = sxy / sxx;
  return {
    gradient,
    intercept: meanY - gradient * meanX,
    r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy),
    n,
    throughOrigin,
  };
}

// ---------- layout ----------

/** Text sizes and spacings, in millimetres — a printed graph, so mm not px. */
const TITLE_MM = 4.6;
const LABEL_MM = 3.8;
const TICK_MM = 3.1;
const STATS_MM = 3.4;
const MARKER_MM = 2.6;

export type { Scale };

export interface PlotLayout {
  width: number;
  height: number;
  /** The plotting area, inside the axes. */
  left: number;
  top: number;
  plotW: number;
  plotH: number;
  xScale: Scale;
  yScale: Scale;
  xTicks: number[];
  yTicks: number[];
  fit: FitResult | null;
  tooLarge: boolean;
  /** No readings to draw yet. */
  empty: boolean;
}

/** Where a data value lands on the canvas. */
export function project(layout: PlotLayout, point: Reading): { x: number; y: number } {
  const { xScale: xs, yScale: ys } = layout;
  return {
    x: layout.left + ((point.x - xs.min) / (xs.max - xs.min)) * layout.plotW,
    y: layout.top + layout.plotH - ((point.y - ys.min) / (ys.max - ys.min)) * layout.plotH,
  };
}

export function computePlotLayout(readings: Reading[], v: PlotSettings): PlotLayout {
  const points = readings.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const width = Math.round(mm(v.widthMm));
  const height = Math.round(mm(v.heightMm));

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xScale = niceScale(Math.min(...xs), Math.max(...xs), v.startAtZero || v.throughOrigin);
  const yScale = niceScale(Math.min(...ys), Math.max(...ys), v.startAtZero || v.throughOrigin);
  const xTicks = tickValues(xScale);
  const yTicks = tickValues(yScale);

  // Margins are estimated from the text rather than measured, so the layout
  // stays pure: a digit is about 0.6 of the font size at this size.
  const widestYTick = Math.max(...yTicks.map((t) => formatTick(t, yScale.step).length), 1);
  const left = mm(3 + widestYTick * TICK_MM * 0.62 + (v.yLabel ? LABEL_MM + 2 : 0));
  const right = mm(4 + (xTicks.length ? formatTick(xScale.max, xScale.step).length * TICK_MM * 0.31 : 0));
  const top = mm(v.title ? TITLE_MM + 5 : 4);
  const bottom = mm(
    TICK_MM + 4 + (v.xLabel ? LABEL_MM + 2 : 0) + (v.showStats && v.showFit ? STATS_MM + 3 : 0),
  );

  return {
    width,
    height,
    left,
    top,
    plotW: Math.max(10, width - left - right),
    plotH: Math.max(10, height - top - bottom),
    xScale,
    yScale,
    xTicks,
    yTicks,
    fit: v.showFit ? fitLine(points, v.throughOrigin) : null,
    tooLarge: width > MAX_CANVAS_PX || height > MAX_CANVAS_PX,
    empty: points.length === 0,
  };
}

// ---------- painting ----------

/** The slice of a 2D context the painter uses (so tests can stand in for one). */
export interface PlotContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}

const font = (sizeMm: number, weight = "") => `${weight} ${Math.round(mm(sizeMm))}px "Segoe UI", Arial, sans-serif`.trim();

/** An axis title with its unit in brackets, e.g. "Extension (m)". */
export function axisCaption(label: string, unit: string): string {
  if (!label) return unit ? `(${unit})` : "";
  return unit ? `${label} (${unit})` : label;
}

/** "gradient = 2,45 N/m · intercept = 0,10 N · R² = 0,998" */
export function describeFit(fit: FitResult, v: PlotSettings): string {
  const gradientUnit = v.yUnit && v.xUnit ? ` ${v.yUnit}/${v.xUnit}` : "";
  const parts = [`gradient = ${formatSigFigs(fit.gradient)}${gradientUnit}`];
  if (!fit.throughOrigin) {
    parts.push(`intercept = ${formatSigFigs(fit.intercept)}${v.yUnit ? ` ${v.yUnit}` : ""}`);
  } else {
    parts.push("through the origin");
  }
  parts.push(`R² = ${formatFixed(fit.r2, 4)}`);
  parts.push(`n = ${fit.n}`);
  return parts.join("   ·   ");
}

/** Clip the fitted line to the plot area, or null if it never crosses it. */
export function fitSegment(layout: PlotLayout, fit: FitResult): [Reading, Reading] | null {
  const { xScale: xs, yScale: ys } = layout;
  const at = (x: number) => fit.gradient * x + fit.intercept;
  let x1 = xs.min;
  let x2 = xs.max;
  let y1 = at(x1);
  let y2 = at(x2);

  // Walk the ends in until both sit inside the y range.
  const clipEnd = (x: number, y: number): [number, number] | null => {
    if (y >= ys.min && y <= ys.max) return [x, y];
    if (fit.gradient === 0) return null;
    const bound = y < ys.min ? ys.min : ys.max;
    const cx = (bound - fit.intercept) / fit.gradient;
    if (cx < xs.min || cx > xs.max) return null;
    return [cx, bound];
  };

  const start = clipEnd(x1, y1);
  const end = clipEnd(x2, y2);
  if (!start || !end) return null;
  [x1, y1] = start;
  [x2, y2] = end;
  if (x1 === x2) return null;
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
}

export function paintPlot(ctx: PlotContext, readings: Reading[], v: PlotSettings, layout: PlotLayout): void {
  const points = readings.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const { left, top, plotW, plotH } = layout;
  const bottom = top + plotH;
  const right = left + plotW;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Gridlines first, so everything else sits on top of them.
  if (v.showGrid) {
    ctx.strokeStyle = "#d7dee6";
    ctx.lineWidth = Math.max(1, mm(0.18));
    ctx.beginPath();
    for (const t of layout.xTicks) {
      const { x } = project(layout, { x: t, y: layout.yScale.min });
      ctx.moveTo(Math.round(x) + 0.5, top);
      ctx.lineTo(Math.round(x) + 0.5, bottom);
    }
    for (const t of layout.yTicks) {
      const { y } = project(layout, { x: layout.xScale.min, y: t });
      ctx.moveTo(left, Math.round(y) + 0.5);
      ctx.lineTo(right, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  // Axes.
  ctx.strokeStyle = "#1b2733";
  ctx.lineWidth = Math.max(1, mm(0.45));
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  // Tick marks and their numbers.
  ctx.fillStyle = "#1b2733";
  ctx.font = font(TICK_MM);
  ctx.lineWidth = Math.max(1, mm(0.35));
  const tickLen = mm(1.4);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.beginPath();
  for (const t of layout.xTicks) {
    const { x } = project(layout, { x: t, y: layout.yScale.min });
    ctx.moveTo(Math.round(x) + 0.5, bottom);
    ctx.lineTo(Math.round(x) + 0.5, bottom + tickLen);
  }
  ctx.stroke();
  for (const t of layout.xTicks) {
    const { x } = project(layout, { x: t, y: layout.yScale.min });
    ctx.fillText(formatTick(t, layout.xScale.step), x, bottom + tickLen + mm(1));
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  for (const t of layout.yTicks) {
    const { y } = project(layout, { x: layout.xScale.min, y: t });
    ctx.moveTo(left - tickLen, Math.round(y) + 0.5);
    ctx.lineTo(left, Math.round(y) + 0.5);
  }
  ctx.stroke();
  for (const t of layout.yTicks) {
    const { y } = project(layout, { x: layout.xScale.min, y: t });
    ctx.fillText(formatTick(t, layout.yScale.step), left - tickLen - mm(1), y);
  }

  // Titles.
  if (v.title) {
    ctx.font = font(TITLE_MM, "600");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(v.title, left + plotW / 2, mm(2));
  }

  const xCaption = axisCaption(v.xLabel, v.xUnit);
  if (xCaption) {
    ctx.font = font(LABEL_MM);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(xCaption, left + plotW / 2, bottom + tickLen + mm(1) + mm(TICK_MM + 1.5));
  }

  const yCaption = axisCaption(v.yLabel, v.yUnit);
  if (yCaption) {
    // Rotated up the left-hand side, the way it is written on paper.
    ctx.save();
    ctx.translate(mm(LABEL_MM), top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = font(LABEL_MM);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(yCaption, 0, 0);
    ctx.restore();
  }

  // The fitted line, under the points so the readings stay readable.
  if (v.showFit && layout.fit) {
    const segment = fitSegment(layout, layout.fit);
    if (segment) {
      const a = project(layout, segment[0]);
      const b = project(layout, segment[1]);
      ctx.strokeStyle = v.lineColor;
      ctx.lineWidth = Math.max(1, mm(0.4));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Readings as crosses — the convention on a practical graph, and easier to
  // read a value off than a filled dot.
  ctx.strokeStyle = v.pointColor;
  ctx.lineWidth = Math.max(1, mm(0.4));
  const arm = mm(MARKER_MM) / 2;
  ctx.beginPath();
  for (const p of points) {
    const { x, y } = project(layout, p);
    ctx.moveTo(x - arm, y - arm);
    ctx.lineTo(x + arm, y + arm);
    ctx.moveTo(x - arm, y + arm);
    ctx.lineTo(x + arm, y - arm);
  }
  ctx.stroke();

  if (v.showStats && v.showFit && layout.fit) {
    ctx.fillStyle = "#1b2733";
    ctx.font = font(STATS_MM);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(describeFit(layout.fit, v), left + plotW / 2, layout.height - mm(1.5));
  }
}

/** Size the canvas from the settings and draw. Returns the layout used. */
export function drawPlot(canvas: HTMLCanvasElement, readings: Reading[], v: PlotSettings): PlotLayout {
  const layout = computePlotLayout(readings, v);
  if (layout.tooLarge) return layout;
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (ctx) paintPlot(ctx, readings, v, layout);
  return layout;
}

// ---------- readings in ----------

/** One field of pasted data, allowing for a decimal comma. */
function toNumber(field: string): number {
  const cleaned = field.trim().replace(/ /g, "");
  return Number(/^-?\d+,\d+$/.test(cleaned) ? cleaned.replace(",", ".") : cleaned);
}

/**
 * Readings pasted from a spreadsheet or typed by hand: one pair per line,
 * separated by a tab, semicolon, spaces or a comma. A header row is skipped,
 * and "1,5" is read as a decimal comma unless the comma is doing the splitting.
 */
export function parseReadings(text: string): Reading[] {
  const out: Reading[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.includes("\t")
      ? line.split("\t")
      : line.includes(";")
        ? line.split(";")
        : /\s/.test(line.trim())
          ? line.trim().split(/\s+/)
          : line.split(",");
    if (fields.length < 2) continue;
    const x = toNumber(fields[0]);
    const y = toNumber(fields[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

/** File name for a saved graph, from its title. */
export function fileNameFor(v: PlotSettings): string {
  const stem = v.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${stem || "practical_graph"}.png`;
}
