// Drawing the circuit on a canvas, the way an exam paper draws it: black on
// white, IEC symbols (a lamp is a circle with a cross, a resistor a plain
// rectangle, a cell a long thin and a short thick plate), labels in Arial with
// subscript numbers. On screen it adds the editing aids (grid dots, the
// selection, loose ends), the meter readouts, the lamps' glow and the moving
// current; the saved picture leaves all of that out unless asked for the
// readings.
//
// Everything is drawn in scene units — G per grid step — and the caller sets
// the transform, so the same code fills the screen and a 300 dpi PNG.

import { formatNumber } from "../numbers";
import {
  COLS,
  Circuit,
  Part,
  PartType,
  Pt,
  ROWS,
  edgeEnds,
  isHorizontal,
  junctions,
  labelRuns,
  terminals,
} from "./circuit";
import { PartReading, SHORT_CURRENT, Solution, meterValue } from "./solve";

/** Scene units per grid step. */
export const G = 40;
export const SCENE_W = COLS * G;
export const SCENE_H = ROWS * G;

const INK = "#000";
const PAPER = "#fff";
const FONT = "Arial, Helvetica, sans-serif";
const LABEL_SIZE = 17;
const LINE = 2.2;

export type Precision = "dp2" | "sf3";

export interface Look {
  /** On screen (editing aids, colour), or the plain picture for a paper. */
  screen: boolean;
  grid: boolean;
  junctionDots: boolean;
  /** Meter readouts: shown, shown as "?" for the class to predict, or not drawn. */
  readings: "show" | "hide" | "none";
  /** Lamps glow with their power. */
  glow: boolean;
  precision: Precision;
  selectedPart?: string | null;
  selectedWires?: Set<string>;
  /** A part drawn where it would go (placing or moving one), green if it fits there, red if not. */
  ghost?: { part: Part; ok: boolean } | null;
  /** The part being dragged, drawn faint where it was. */
  moving?: string | null;
  /** A wire being drawn. */
  wirePath?: Pt[] | null;
  /** Wire ends and terminals joined to nothing. */
  looseEnds?: Pt[];
  /** The current, as moving dots (or arrows when the computer asks for less motion). */
  flow?: { phase: Map<string, number>; electrons: boolean; arrows: boolean } | null;
}

/** The extent of everything drawn, for cropping the saved picture. */
export class Bounds {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  add(x: number, y: number, pad = 0) {
    this.x0 = Math.min(this.x0, x - pad);
    this.y0 = Math.min(this.y0, y - pad);
    this.x1 = Math.max(this.x1, x + pad);
    this.y1 = Math.max(this.y1, y + pad);
  }
  get empty() {
    return this.x0 > this.x1;
  }
}

const px = (p: Pt) => ({ x: p.x * G, y: p.y * G });

// ---------- numbers ----------

/** A meter's figure: two decimal places, or three significant figures with the trailing zeros kept. */
export function readingText(value: number, precision: Precision): string {
  if (!Number.isFinite(value) || Math.abs(value) >= SHORT_CURRENT) return "∞";
  if (precision === "dp2") return formatFixedComma(value, 2);
  const a = Math.abs(value);
  if (a < 5e-5) return "0,00";
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(a)));
  return formatFixedComma(value, decimals);
}

function formatFixedComma(n: number, decimals: number): string {
  const s = Math.abs(n).toFixed(decimals);
  const [whole, fraction] = s.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = n < 0 && Number(s) !== 0 ? "−" : "";
  return sign + (fraction ? `${grouped},${fraction}` : grouped);
}

/** A value as it is printed beside a symbol: "12 Ω", "emf = 12 V; r = 1 Ω", "2 A". */
export function valueText(p: Part): string {
  const n = (v: number) => formatNumber(v, 3);
  switch (p.type) {
    case "cell":
      return p.r > 0 ? `emf = ${n(p.emf)} V; r = ${n(p.r)} Ω` : `${n(p.emf)} V`;
    case "resistor":
    case "lamp":
      return `${n(p.R)} Ω`;
    case "rheostat":
      return `${n(Math.min(p.R, p.Rmax))} Ω`;
    case "fuse":
      return `${n(p.rating)} A`;
    default:
      return "";
  }
}

/** How far a symbol reaches either side of its line, in scene units. */
function halfHeight(type: PartType): number {
  switch (type) {
    case "resistor":
    case "fuse":
      return 9;
    case "lamp":
      return 16;
    case "ammeter":
    case "voltmeter":
      return 18;
    case "cell":
      return 17;
    case "switch":
      return 16;
    case "rheostat":
      return 18;
    case "diode":
      return 11;
  }
}

// ---------- text ----------

/** Text with subscript numbers ("R1" → R₁), aligned on (x, y); returns its width. */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { align: CanvasTextAlign; baseline: "top" | "middle" | "bottom"; size?: number; subs?: boolean; weight?: string; colour?: string; box?: Bounds },
): number {
  const size = opts.size ?? LABEL_SIZE;
  const sub = Math.round(size * 0.68);
  const runs = opts.subs === false ? ([[text, false]] as Array<[string, boolean]>) : labelRuns(text);
  const weight = opts.weight ?? "400";
  const fontFor = (isSub: boolean) => `${weight} ${isSub ? sub : size}px ${FONT}`;
  const widths = runs.map(([t, isSub]) => {
    ctx.font = fontFor(isSub);
    return ctx.measureText(t).width;
  });
  const total = widths.reduce((s, w) => s + w, 0);
  let left = opts.align === "left" ? x : opts.align === "right" ? x - total : x - total / 2;
  const mid = opts.baseline === "top" ? y + size * 0.55 : opts.baseline === "bottom" ? y - size * 0.45 : y;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = opts.colour ?? INK;
  runs.forEach(([t, isSub], i) => {
    ctx.font = fontFor(isSub);
    ctx.fillText(t, left, isSub ? mid + size * 0.3 : mid);
    left += widths[i];
  });
  const leftEdge = opts.align === "left" ? x : opts.align === "right" ? x - total : x - total / 2;
  opts.box?.add(leftEdge, mid - size * 0.6);
  opts.box?.add(leftEdge + total, mid + size * 0.75);
  return total;
}

// ---------- symbols ----------

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

/** A lamp's fill for a brightness (fraction of full glow): white when out, warm yellow when lit. */
function lampFill(glow: number): string {
  if (glow < 0.005) return PAPER;
  // In proportion to the power, so a lamp at a quarter of full glow looks a quarter as bright.
  const g = Math.min(1, glow);
  return `rgba(255, 205, 40, ${(0.12 + 0.88 * g).toFixed(3)})`;
}

/**
 * One part's symbol, in its own frame: centre at the origin, terminal a at
 * (−G, 0), terminal b at (G, 0). The caller rotates the frame.
 */
function drawSymbol(ctx: CanvasRenderingContext2D, p: Part, ink: string, reading: PartReading | undefined, look: Look) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = LINE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const leads = (half: number) => {
    line(ctx, -G, 0, -half, 0);
    line(ctx, half, 0, G, 0);
  };
  switch (p.type) {
    case "resistor": {
      leads(23);
      ctx.fillStyle = PAPER;
      ctx.fillRect(-23, -9, 46, 18);
      ctx.strokeRect(-23, -9, 46, 18);
      break;
    }
    case "rheostat": {
      leads(23);
      ctx.fillStyle = PAPER;
      ctx.fillRect(-23, -9, 46, 18);
      ctx.strokeRect(-23, -9, 46, 18);
      // The IEC variable arrow, corner to corner and out past the box.
      line(ctx, -18, 16, 18, -16);
      ctx.beginPath();
      ctx.moveTo(22, -19.5);
      ctx.lineTo(11.5, -15);
      ctx.lineTo(18, -9);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    }
    case "fuse": {
      ctx.strokeRect(-21, -8, 42, 16);
      if (p.blown) {
        line(ctx, -G, 0, -6, 0);
        line(ctx, 6, 0, G, 0);
        if (look.screen) {
          ctx.strokeStyle = "#c62828";
          line(ctx, -5, -6, 5, 6);
          line(ctx, -5, 6, 5, -6);
        }
      } else line(ctx, -G, 0, G, 0);
      break;
    }
    case "lamp": {
      leads(16);
      circle(ctx, 0, 0, 16, look.glow ? lampFill(reading?.glow ?? 0) : PAPER);
      const d = 16 / Math.SQRT2;
      line(ctx, -d, -d, d, d);
      line(ctx, -d, d, d, -d);
      break;
    }
    case "ammeter":
    case "voltmeter": {
      leads(18);
      circle(ctx, 0, 0, 18, PAPER);
      break; // the letter goes on upright, after the frame is restored
    }
    case "cell": {
      const n = Math.max(1, Math.min(4, Math.round(p.cells)));
      const plate = 8;
      const between = 10;
      const width = n * plate + (n - 1) * between;
      const x0 = -width / 2;
      line(ctx, -G, 0, x0, 0);
      line(ctx, x0 + width, 0, G, 0);
      for (let k = 0; k < n; k++) {
        const xs = x0 + k * (plate + between);
        // − plate: short and thick; + plate: long and thin.
        ctx.lineWidth = 5;
        ctx.lineCap = "butt";
        line(ctx, xs, -8, xs, 8);
        ctx.lineWidth = LINE;
        ctx.lineCap = "round";
        line(ctx, xs + plate, -17, xs + plate, 17);
        if (k < n - 1) line(ctx, xs + plate, 0, xs + plate + between, 0);
      }
      break;
    }
    case "switch": {
      line(ctx, -G, 0, -14, 0);
      line(ctx, 14, 0, G, 0);
      if (p.closed) line(ctx, -14, 0, 14, 0);
      else line(ctx, -14, 0, 11, -14);
      circle(ctx, -14, 0, 3.4, ink);
      circle(ctx, 14, 0, 3.4, ink);
      break;
    }
    case "diode": {
      leads(10);
      ctx.beginPath();
      ctx.moveTo(-10, -11);
      ctx.lineTo(-10, 11);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.stroke();
      line(ctx, 10, -11, 10, 11);
      break;
    }
  }
}

/** Where a part's label (side "label") and its value and reading (side "value") go. */
function sides(p: Part) {
  const h = isHorizontal(p.rot);
  const d = halfHeight(p.type) + 7;
  const above = { x: p.x * G, y: p.y * G - d, align: "center" as CanvasTextAlign, baseline: "bottom" as const, dx: 0, dy: -1 };
  const below = { x: p.x * G, y: p.y * G + d, align: "center" as CanvasTextAlign, baseline: "top" as const, dx: 0, dy: 1 };
  const left = { x: p.x * G - d, y: p.y * G, align: "right" as CanvasTextAlign, baseline: "middle" as const, dx: -1, dy: 0 };
  const right = { x: p.x * G + d, y: p.y * G, align: "left" as CanvasTextAlign, baseline: "middle" as const, dx: 1, dy: 0 };
  const [first, second] = h ? [above, below] : [left, right];
  return p.flip ? { label: second, value: first } : { label: first, value: second };
}

/** A meter's readout box beside it. */
function drawReadout(ctx: CanvasRenderingContext2D, p: Part, text: string, look: Look, box?: Bounds) {
  const s = sides(p).value;
  const size = 15;
  ctx.font = `700 ${size}px ${FONT}`;
  const w = Math.max(46, ctx.measureText(text).width + 14);
  const h = 22;
  const cx = s.dx < 0 ? s.x - w / 2 : s.dx > 0 ? s.x + w / 2 : s.x;
  const cy = s.dy < 0 ? s.y - h / 2 : s.dy > 0 ? s.y + h / 2 : s.y;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fillStyle = look.screen ? "#1d2733" : PAPER;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = look.screen ? "#1d2733" : INK;
  ctx.stroke();
  ctx.fillStyle = look.screen ? "#b9f6ca" : INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
  box?.add(x, y);
  box?.add(x + w, y + h);
}

// ---------- the whole circuit ----------

/** Where the dots are along one straight run of current (scene units), for a phase. */
function dotsAlong(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, phase: number, spacing: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  for (let t = ((phase % spacing) + spacing) % spacing; t < len; t += spacing) {
    ctx.beginPath();
    ctx.arc(a.x + ux * t, a.y + uy * t, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function arrowAlong(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, forward: boolean) {
  const [from, to] = forward ? [a, b] : [b, a];
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  ctx.beginPath();
  ctx.moveTo(mx + ux * 6, my + uy * 6);
  ctx.lineTo(mx - ux * 4 - uy * 5, my - uy * 4 + ux * 5);
  ctx.lineTo(mx - ux * 4 + uy * 5, my - uy * 4 - ux * 5);
  ctx.closePath();
  ctx.fill();
}

/** Parts that carry current along their own line (a voltmeter, an open switch and a blocking diode don't). */
function carries(r: PartReading | undefined): boolean {
  return !!r && Math.abs(r.I) > 1e-9 && Math.abs(r.I) < SHORT_CURRENT;
}

export const DOT_SPACING = 26;

/**
 * Draw the circuit. `solution` gives the readings and the glow; `box`, when
 * passed, collects the extent of everything drawn.
 */
export function drawCircuit(ctx: CanvasRenderingContext2D, c: Circuit, solution: Solution | null, look: Look, box?: Bounds) {
  if (look.screen) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  }
  if (look.screen && look.grid) {
    ctx.fillStyle = "#c3c9d2";
    for (let x = 1; x < COLS; x++)
      for (let y = 1; y < ROWS; y++) {
        ctx.beginPath();
        ctx.arc(x * G, y * G, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
  }

  // The lamps' glow, under everything.
  if (look.glow && solution) {
    for (const p of c.parts) {
      if (p.type !== "lamp") continue;
      const g = solution.parts[p.id]?.glow ?? 0;
      if (g < 0.005) continue;
      const strength = Math.min(1.5, g);
      const radius = 18 + 34 * Math.sqrt(strength);
      const halo = ctx.createRadialGradient(p.x * G, p.y * G, 10, p.x * G, p.y * G, radius);
      halo.addColorStop(0, `rgba(255, 214, 51, ${(0.8 * Math.min(1, g)).toFixed(3)})`);
      halo.addColorStop(1, "rgba(255, 214, 51, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x * G, p.y * G, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Selection, under the wire it highlights.
  const selectedWires = look.selectedWires ?? new Set<string>();
  if (look.screen && selectedWires.size) {
    ctx.strokeStyle = "rgba(21, 101, 192, 0.35)";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    for (const w of selectedWires) {
      const [p, q] = edgeEnds(w).map(px);
      line(ctx, p.x, p.y, q.x, q.y);
    }
  }
  if (look.screen && look.selectedPart) {
    const p = c.parts.find((q) => q.id === look.selectedPart);
    if (p) {
      const h = isHorizontal(p.rot);
      const half = halfHeight(p.type) + 8;
      ctx.fillStyle = "rgba(21, 101, 192, 0.12)";
      ctx.strokeStyle = "rgba(21, 101, 192, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(p.x * G - (h ? G - 4 : half), p.y * G - (h ? half : G - 4), h ? 2 * G - 8 : 2 * half, h ? 2 * half : 2 * G - 8, 8);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Wires, as one path: stroked step by step, the anti-aliased ends would overlap into bumps at every grid point.
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const w of c.wires) {
    const [p, q] = edgeEnds(w).map(px);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    box?.add(p.x, p.y, LINE);
    box?.add(q.x, q.y, LINE);
  }
  ctx.stroke();

  // The current, between the wires and the parts' bodies so it seems to pass through them.
  if (look.flow && solution) {
    const sign = look.flow.electrons ? -1 : 1;
    ctx.fillStyle = look.flow.electrons ? "#1565c0" : "#d84315";
    for (const w of c.wires) {
      const I = solution.wires[w] ?? 0;
      if (Math.abs(I) < 1e-9 || Math.abs(I) >= SHORT_CURRENT) continue;
      const [p, q] = edgeEnds(w).map(px);
      if (look.flow.arrows) arrowAlong(ctx, p, q, I * sign > 0);
      else dotsAlong(ctx, p, q, look.flow.phase.get(w) ?? 0, DOT_SPACING);
    }
    for (const p of c.parts) {
      const r = solution.parts[p.id];
      if (!carries(r) || look.flow.arrows) continue;
      const t = terminals(p);
      dotsAlong(ctx, px(t.a), px(t.b), look.flow.phase.get(p.id) ?? 0, DOT_SPACING);
    }
  }

  // Parts.
  const ghost = look.ghost;
  for (const p of c.parts) {
    const faint = look.moving === p.id;
    drawPart(ctx, p, solution?.parts[p.id], look, faint ? "rgba(0,0,0,0.25)" : INK, faint ? undefined : box);
  }
  if (ghost) drawPart(ctx, ghost.part, undefined, { ...look, glow: false }, ghost.ok ? "rgba(46, 125, 50, 0.85)" : "rgba(198, 40, 40, 0.85)");

  // Junction dots, loose ends, a wire being drawn.
  if (look.junctionDots) {
    ctx.fillStyle = INK;
    for (const j of junctions(c)) {
      ctx.beginPath();
      ctx.arc(j.x * G, j.y * G, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (look.screen && look.looseEnds?.length) {
    ctx.strokeStyle = "#c62828";
    ctx.lineWidth = 2;
    for (const e of look.looseEnds) circle(ctx, e.x * G, e.y * G, 5.5, null);
  }
  if (look.screen && look.wirePath && look.wirePath.length > 1) {
    ctx.strokeStyle = "#1565c0";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    look.wirePath.forEach((p, i) => (i ? ctx.lineTo(p.x * G, p.y * G) : ctx.moveTo(p.x * G, p.y * G)));
    ctx.stroke();
  }

  // Readouts last, so nothing covers them.
  if (look.readings !== "none" && solution) {
    for (const p of c.parts) {
      if (p.type !== "ammeter" && p.type !== "voltmeter") continue;
      const unit = p.type === "ammeter" ? "A" : "V";
      const text = look.readings === "hide" ? "?" : `${readingText(meterValue(p, solution.parts[p.id]), look.precision)} ${unit}`;
      drawReadout(ctx, p, text, look, box);
    }
  }
}

/** One part: its symbol in its rotated frame, then its upright letter, label and value. */
function drawPart(ctx: CanvasRenderingContext2D, p: Part, reading: PartReading | undefined, look: Look, ink: string, box?: Bounds) {
  ctx.save();
  ctx.translate(p.x * G, p.y * G);
  ctx.rotate((p.rot * Math.PI) / 2);
  drawSymbol(ctx, p, ink, reading, look);
  ctx.restore();
  const t = terminals(p);
  box?.add(t.a.x * G, t.a.y * G, LINE);
  box?.add(t.b.x * G, t.b.y * G, LINE);
  const half = halfHeight(p.type);
  box?.add(p.x * G, p.y * G, half + 2);

  const s = sides(p);
  if (p.type === "ammeter" || p.type === "voltmeter") {
    const letter = p.label || (p.type === "ammeter" ? "A" : "V");
    drawText(ctx, letter, p.x * G, p.y * G, { align: "center", baseline: "middle", size: letter.length > 2 ? 14 : 18, colour: ink });
  } else if (p.label) {
    drawText(ctx, p.label, s.label.x, s.label.y, { align: s.label.align, baseline: s.label.baseline, colour: ink, box });
  }
  if (p.showValue) {
    const v = valueText(p);
    if (v) drawText(ctx, v, s.value.x, s.value.y, { align: s.value.align, baseline: s.value.baseline, subs: false, colour: ink, box });
  }
}

/** Advance each wire's and part's dots by its current over `dt` seconds; the biggest current moves at `speed` units a second. */
export function advanceFlow(phase: Map<string, number>, c: Circuit, solution: Solution, dt: number, electrons: boolean, speed = 70) {
  const currents: Array<[string, number]> = [
    ...c.wires.map((w): [string, number] => [w, solution.wires[w] ?? 0]),
    ...c.parts.map((p): [string, number] => [p.id, solution.parts[p.id]?.I ?? 0]),
  ].filter(([, I]) => Math.abs(I) < SHORT_CURRENT);
  const biggest = Math.max(0, ...currents.map(([, I]) => Math.abs(I)));
  if (biggest < 1e-9) return;
  const k = (speed / biggest) * (electrons ? -1 : 1);
  for (const [key, I] of currents) {
    // Ends the dots along whichever way the edge or part is drawn: first point to second.
    phase.set(key, ((phase.get(key) ?? 0) + I * k * dt) % (DOT_SPACING * 1000));
  }
}

/** The extent of the drawing (empty circuit: null), measured by a dry run on a scratch canvas. */
export function measure(ctx: CanvasRenderingContext2D, c: Circuit, solution: Solution | null, look: Look): Bounds | null {
  const box = new Bounds();
  ctx.save();
  drawCircuit(ctx, c, solution, { ...look, screen: false, grid: false }, box);
  ctx.restore();
  return box.empty ? null : box;
}

/** A part's symbol on its own, for the palette buttons: centred and scaled to a w × h canvas. */
export function drawPaletteIcon(ctx: CanvasRenderingContext2D, type: PartType | "wire", w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (type === "wire") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.75);
    ctx.lineTo(w * 0.5, h * 0.75);
    ctx.lineTo(w * 0.5, h * 0.25);
    ctx.lineTo(w * 0.88, h * 0.25);
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const [x, y] of [
      [0.12, 0.75],
      [0.88, 0.25],
    ]) {
      ctx.beginPath();
      ctx.arc(w * x, h * y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const p: Part = {
    id: "icon",
    type,
    x: 0,
    y: 0,
    rot: 0,
    label: "",
    emf: 0,
    r: 0,
    cells: 2,
    R: 1,
    Rmax: 1,
    closed: false,
    rating: 1,
    blown: false,
    showValue: false,
    flip: false,
  };
  const scale = Math.min(w / (2 * G + 6), h / (2 * halfHeight(type) + 10));
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  drawSymbol(ctx, p, INK, undefined, { screen: false, grid: false, junctionDots: false, readings: "none", glow: false, precision: "dp2" });
  if (type === "ammeter" || type === "voltmeter") {
    drawText(ctx, type === "ammeter" ? "A" : "V", 0, 0, { align: "center", baseline: "middle", size: 18 });
  }
  ctx.restore();
}
