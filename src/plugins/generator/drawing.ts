// Drawing the generator and its graphs.
//
// The apparatus is drawn the way the papers draw it: two magnet poles, N on
// the left and S on the right, a rectangular coil between them on a dashed
// axis, slip rings (or a split-ring commutator) at the front with brushes
// leading to the terminals X and Y and a centre-zero meter; beside it the view
// along the axis, where the coil is a line between the poles, its sides
// marked ⊙ or ⊗ with the induced current, and a crank to turn it by.
//
// The graphs are the three the papers ask for — Φ, ΔΦ/Δt and the emf against
// time — drawn as the coil turns, with an optional held trace to compare.

import { Scale, formatTick, niceScale, tickValues } from "../scale";
import { GenParams, Sample, coilEmf, crossings, degrees } from "./generator";

export const APP_W = 1000;
export const APP_H = 600;
export const GRAPH_W = 1000;
export const GRAPH_H = 690;

/** The end-on view's centre and the crank's reach, in scene units: what the view hit-tests against. */
export const END_VIEW = { cx: 812, cy: 262, reach: 96 };

const INK = "#000";
const FONT = "Arial, Helvetica, sans-serif";
const COLOURS = { flux: "#1565c0", rate: "#6a1b9a", emf: "#c62828", held: "#90a4ae", current: "#d84315" };

export interface Look {
  screen: boolean;
  /** Show the induced current's direction on the coil. */
  current: boolean;
  /** Show the normal to the coil and the angle θ in the end-on view. */
  normal: boolean;
}

// ---------- small helpers ----------

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(angle) * size - Math.sin(angle) * size * 0.45, y - Math.sin(angle) * size + Math.cos(angle) * size * 0.45);
  ctx.lineTo(x - Math.cos(angle) * size + Math.sin(angle) * size * 0.45, y - Math.sin(angle) * size - Math.cos(angle) * size * 0.45);
  ctx.closePath();
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, align: CanvasTextAlign = "center", size = 18, colour = INK, weight = "400") {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}

/** Text with one subscript, e.g. ("Φ", "max"). */
function subText(ctx: CanvasRenderingContext2D, main: string, sub: string, x: number, y: number, size: number, colour: string) {
  ctx.font = `400 ${size}px ${FONT}`;
  const w1 = ctx.measureText(main).width;
  ctx.font = `400 ${Math.round(size * 0.7)}px ${FONT}`;
  const w2 = ctx.measureText(sub).width;
  const left = x - (w1 + w2) / 2;
  text(ctx, main, left, y, "left", size, colour);
  text(ctx, sub, left + w1, y + size * 0.3, "left", Math.round(size * 0.7), colour);
}

// ---------- the 3D view ----------

// World units: the coil's sides are R from the axis and the coil is 2·HALF_L long.
const R = 1.15;
const HALF_L = 1.45;
const S3 = 52; // scene units per world unit
const O3 = { x: 330, y: 150 };

/** Oblique projection: z (towards the viewer, along the axis) runs down and to the left. */
function P3(x: number, y: number, z: number) {
  return { x: O3.x + S3 * (x - 0.55 * z), y: O3.y - S3 * (y - 0.3 * z) };
}

function poly(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, fill: string | null, stroke = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) ctx.stroke();
}

/** A box seen from the front, the top and the right. */
function block(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, look: Look) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  const shade = (s: string, w: string) => (look.screen ? s : w);
  poly(ctx, [P3(x1, y0, z1), P3(x1, y0, z0), P3(x1, y1, z0), P3(x1, y1, z1)], shade("#9fa8b3", "#fff"));
  poly(ctx, [P3(x0, y1, z1), P3(x1, y1, z1), P3(x1, y1, z0), P3(x0, y1, z0)], shade("#c5ccd4", "#fff"));
  poly(ctx, [P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], shade("#b3bcc6", "#fff"));
}

/** A ring (or a split ring's halves) round the axis between z0 and z1. */
function ring(ctx: CanvasRenderingContext2D, radius: number, z0: number, z1: number, look: Look, halves: null | { theta: number; tint: [string, string] }) {
  const N = 48;
  const pt = (phi: number, z: number) => P3(radius * Math.cos(phi), radius * Math.sin(phi), z);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  const grey = look.screen ? "#c9ced6" : "#fff";
  if (!halves) {
    // The band: back rim, then the outline of the cylinder, then the front face with its hole.
    const back = Array.from({ length: N }, (_, i) => pt((i / N) * 2 * Math.PI, z0));
    const front = Array.from({ length: N }, (_, i) => pt((i / N) * 2 * Math.PI, z1));
    poly(ctx, back, grey);
    // Side silhouette: the band between the rims, filled as one shape.
    ctx.beginPath();
    front.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = grey;
    ctx.fill();
    for (let i = 0; i < N; i++) {
      const a = back[i];
      const b = front[i];
      const c = front[(i + 1) % N];
      const d = back[(i + 1) % N];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = grey;
      ctx.fill();
    }
    poly(ctx, front, look.screen ? "#dde2e8" : "#fff");
    const hole = Array.from({ length: N }, (_, i) => pt((i / N) * 2 * Math.PI, z1)).map((p) => ({ x: (p.x - P3(0, 0, z1).x) * 0.55 + P3(0, 0, z1).x, y: (p.y - P3(0, 0, z1).y) * 0.55 + P3(0, 0, z1).y }));
    poly(ctx, hole, look.screen ? "#fff" : "#fff");
    return;
  }
  // A commutator: two halves, each centred on its own coil side's direction, with gaps between.
  const gap = 0.22;
  const centre = halves.theta + Math.PI / 2; // the direction of side P from the axis
  for (const [k, c] of [
    [0, centre],
    [1, centre + Math.PI],
  ] as const) {
    const from = c - Math.PI / 2 + gap / 2;
    const to = c + Math.PI / 2 - gap / 2;
    const arc = (z: number) => Array.from({ length: 25 }, (_, i) => pt(from + ((to - from) * i) / 24, z));
    const fill = look.screen ? halves.tint[k] : "#fff";
    const front = arc(z1);
    const back = arc(z0);
    poly(ctx, [...back, ...[...front].reverse()], fill);
    ctx.beginPath();
    front.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
}

/** The generator in three dimensions, the circuit to the meter, and the view along the axis. */
export function drawApparatus(ctx: CanvasRenderingContext2D, p: GenParams, theta: number, omega: number, output: number, scaleMax: number, look: Look) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const d = { x: -Math.sin(theta), y: Math.cos(theta) }; // from the axis towards side P, in the plane of the coil
  const emf = coilEmf(p, theta, omega);

  // The poles, then the axis.
  block(ctx, -2.85, -1.6, -1.3, 1.3, -1.8, 1.8, look);
  block(ctx, 1.6, 2.85, -1.3, 1.3, -1.8, 1.8, look);
  const nFace = P3(-2.22, 0, 1.8);
  const sFace = P3(2.22, 0, 1.8);
  text(ctx, "N", nFace.x, nFace.y, "center", 30, INK, "700");
  text(ctx, "S", sFace.x, sFace.y, "center", 30, INK, "700");
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([7, 6]);
  const a0 = P3(0, 0, -2.8);
  const a1 = P3(0, 0, 4.3);
  line(ctx, a0.x, a0.y, a1.x, a1.y);
  ctx.setLineDash([]);

  // The coil: two sides along the axis, the far end, and the near ends led to the rings.
  const A = (z: number) => P3(R * d.x, R * d.y, z);
  const B = (z: number) => P3(-R * d.x, -R * d.y, z);
  const ringZ = [2.35, 3.15];
  const lead = 0.16;
  ctx.strokeStyle = look.screen ? "#3e2723" : INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  const aLead = P3(lead * d.x, lead * d.y, HALF_L);
  const bLead = P3(-lead * d.x, -lead * d.y, HALF_L);
  ctx.moveTo(aLead.x, aLead.y);
  [A(HALF_L), A(-HALF_L), B(-HALF_L), B(HALF_L), bLead].forEach((q) => ctx.lineTo(q.x, q.y));
  ctx.stroke();
  ctx.lineWidth = 2.5;
  const aRing = P3(lead * d.x, lead * d.y, ringZ[0] + 0.1);
  const bRing = P3(-lead * d.x, -lead * d.y, p.kind === "ac" ? ringZ[1] + 0.1 : ringZ[0] + 0.1);
  line(ctx, aLead.x, aLead.y, aRing.x, aRing.y);
  line(ctx, bLead.x, bLead.y, bRing.x, bRing.y);

  // The induced current on the coil's sides.
  const peak = Math.max(1e-12, scaleMax);
  if (look.current && Math.abs(emf) > peak * 0.03) {
    ctx.fillStyle = look.screen ? COLOURS.current : INK;
    const towardsRings = emf > 0;
    for (const [side, forward] of [
      [A, towardsRings],
      [B, !towardsRings],
    ] as const) {
      const from = side(forward ? -0.15 : 0.15);
      const to = side(forward ? 0.15 : -0.15);
      arrowHead(ctx, to.x, to.y, Math.atan2(to.y - from.y, to.x - from.x), 16);
    }
  }

  // Slip rings or the commutator, with their brushes.
  const ringR = 0.42;
  if (p.kind === "ac") {
    ring(ctx, ringR, ringZ[0], ringZ[0] + 0.36, look, null);
    ring(ctx, ringR, ringZ[1], ringZ[1] + 0.36, look, null);
  } else {
    ring(ctx, ringR, ringZ[0], ringZ[0] + 0.5, look, { theta, tint: ["#c9a26b", "#e3cfa8"] });
  }

  // Brushes and the leads to the terminals, then the meter between X and Y.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  const terminalY = 440;
  const X = { x: 360, y: terminalY };
  const Y = { x: 170, y: terminalY };
  const brush = (c: { x: number; y: number }) => {
    ctx.fillStyle = look.screen ? "#455a64" : "#fff";
    ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
    ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
  };
  if (p.kind === "ac") {
    // Under each ring: ring 1 (side P) to X, ring 2 (side Q) to Y.
    const b1 = P3(0, -ringR - 0.1, ringZ[0] + 0.18);
    const b2 = P3(0, -ringR - 0.1, ringZ[1] + 0.18);
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b1.x, terminalY - 60);
    ctx.lineTo(X.x, terminalY - 60);
    ctx.lineTo(X.x, X.y);
    ctx.moveTo(b2.x, b2.y);
    ctx.lineTo(b2.x, terminalY - 30);
    ctx.lineTo(Y.x, terminalY - 30);
    ctx.lineTo(Y.x, Y.y);
    ctx.stroke();
    brush(b1);
    brush(b2);
  } else {
    // Either side of the commutator: X on the right, Y on the left.
    const zc = ringZ[0] + 0.25;
    const bx = P3(ringR + 0.12, 0, zc);
    const by = P3(-ringR - 0.12, 0, zc);
    ctx.beginPath();
    ctx.moveTo(bx.x, bx.y);
    ctx.lineTo(bx.x + 40, bx.y);
    ctx.lineTo(bx.x + 40, terminalY - 60);
    ctx.lineTo(X.x, terminalY - 60);
    ctx.lineTo(X.x, X.y);
    ctx.moveTo(by.x, by.y);
    ctx.lineTo(by.x - 30, by.y);
    ctx.lineTo(by.x - 30, terminalY - 30);
    ctx.lineTo(Y.x, terminalY - 30);
    ctx.lineTo(Y.x, Y.y);
    ctx.stroke();
    brush(bx);
    brush(by);
  }
  for (const [pt, name] of [
    [X, "X"],
    [Y, "Y"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    text(ctx, name, pt.x + (name === "X" ? 18 : -18), pt.y, "center", 20, INK, "700");
  }
  // The centre-zero meter across X and Y.
  const mc = { x: 265, y: 515 };
  ctx.beginPath();
  ctx.moveTo(X.x, X.y + 5);
  ctx.lineTo(X.x, mc.y);
  ctx.lineTo(mc.x + 26, mc.y);
  ctx.moveTo(Y.x, Y.y + 5);
  ctx.lineTo(Y.x, mc.y);
  ctx.lineTo(mc.x - 26, mc.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mc.x, mc.y, 26, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();
  // Scale and needle: up is zero, right is X positive.
  ctx.lineWidth = 1;
  for (let k = -2; k <= 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 6;
    line(ctx, mc.x + Math.cos(a) * 19, mc.y + Math.sin(a) * 19, mc.x + Math.cos(a) * 23, mc.y + Math.sin(a) * 23);
  }
  const swing = Math.max(-1, Math.min(1, output / peak)) * (Math.PI / 3);
  ctx.strokeStyle = look.screen ? COLOURS.emf : INK;
  ctx.lineWidth = 2;
  line(ctx, mc.x, mc.y + 6, mc.x + Math.sin(swing) * 21, mc.y - Math.cos(swing) * 21 + 6);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(mc.x, mc.y + 6, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Labels for the parts, clear of the drawing.
  const grey = look.screen ? "#455a64" : INK;
  // Each label sits out to the left, with a thin leader to its part.
  const leader = (label: string[], from: { x: number; y: number }, at: { x: number; y: number }) => {
    ctx.strokeStyle = grey;
    ctx.lineWidth = 1;
    line(ctx, at.x + 4, at.y, from.x, from.y);
    label.forEach((l, i) => text(ctx, l, at.x, at.y + (i - (label.length - 1) / 2) * 17, "right", 15, grey));
  };
  const ringFront = P3(-ringR * 0.7, ringR * 0.7, p.kind === "ac" ? ringZ[1] + 0.36 : ringZ[0] + 0.5);
  leader(p.kind === "ac" ? ["slip rings"] : ["split-ring", "commutator"], ringFront, { x: 70, y: ringFront.y + 64 });
  const brushPt = p.kind === "ac" ? P3(0, -ringR - 0.1, ringZ[1] + 0.18) : P3(-ringR - 0.12, 0, ringZ[0] + 0.25);
  leader(["brushes"], { x: brushPt.x - 9, y: brushPt.y + 4 }, { x: 70, y: brushPt.y + 110 });
  const coilAt = P3(2.85, 1.3, -1.8);
  text(ctx, "coil", coilAt.x + 6, coilAt.y + 4, "left", 15, grey);
  ctx.strokeStyle = grey;
  ctx.lineWidth = 1;
  const coilCorner = P3(R * d.x, R * d.y, -HALF_L);
  line(ctx, coilAt.x + 2, coilAt.y + 6, coilCorner.x, coilCorner.y);

  drawEndView(ctx, p, theta, emf, peak, look);
}

/** The coil seen along its axis from the ring end, with the crank. */
function drawEndView(ctx: CanvasRenderingContext2D, p: GenParams, theta: number, emf: number, peak: number, look: Look) {
  const { cx, cy, reach } = END_VIEW;
  const r = 66;
  ctx.lineCap = "round";
  // A frame round it, and its title.
  ctx.strokeStyle = "#cfd6dd";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 178, 36, 356, 520);
  text(ctx, "Seen along the axis,", cx, 56, "center", 15, look.screen ? "#455a64" : INK);
  text(ctx, `from the ${p.kind === "ac" ? "slip rings" : "commutator"}`, cx, 75, "center", 15, look.screen ? "#455a64" : INK);
  // The poles, with curved faces.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  const pole = (side: -1 | 1) => {
    const inner = cx + side * 118;
    const outer = cx + side * 170;
    ctx.beginPath();
    ctx.moveTo(outer, cy - 92);
    ctx.lineTo(inner + side * 22, cy - 92);
    ctx.quadraticCurveTo(inner - side * 8, cy, inner + side * 22, cy + 92);
    ctx.lineTo(outer, cy + 92);
    ctx.closePath();
    ctx.fillStyle = look.screen ? "#b3bcc6" : "#fff";
    ctx.fill();
    ctx.stroke();
    text(ctx, side < 0 ? "N" : "S", (inner + outer) / 2 + side * 6, cy, "center", 28, INK, "700");
  };
  pole(-1);
  pole(1);
  // The field: dashed arrows from N to S, and B.
  ctx.strokeStyle = look.screen ? "#90a4ae" : "#666";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.2;
  for (const dy of [-80, -40, 40, 80]) {
    ctx.setLineDash([6, 6]);
    line(ctx, cx - 108, cy + dy, cx + 100, cy + dy);
    ctx.setLineDash([]);
    arrowHead(ctx, cx + 108, cy + dy, 0, 9);
  }
  text(ctx, "magnetic field", cx, cy - 104, "center", 14, look.screen ? "#607d8b" : INK);

  // The coil: a line through the axis, its sides as circles marked with the current.
  const d = { x: -Math.sin(theta), y: Math.cos(theta) };
  const a = { x: cx + d.x * r, y: cy - d.y * r };
  const b = { x: cx - d.x * r, y: cy + d.y * r };
  ctx.strokeStyle = look.screen ? "#3e2723" : INK;
  ctx.lineWidth = 5;
  line(ctx, a.x, a.y, b.x, b.y);
  if (look.normal) {
    // The normal to the coil, and θ between it and B.
    const n = { x: Math.cos(theta), y: Math.sin(theta) };
    ctx.strokeStyle = look.screen ? "#2e7d32" : INK;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    line(ctx, cx, cy, cx + n.x * 66, cy - n.y * 66);
    ctx.setLineDash([]);
    arrowHead(ctx, cx + n.x * 70, cy - n.y * 70, Math.atan2(-n.y, n.x), 10);
    const t = ((degrees(theta) + 180) % 360) - 180; // −180..180, the short way from B
    const tr = (t * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, Math.min(0, -tr), Math.max(0, -tr));
    ctx.stroke();
    text(ctx, `θ = ${Math.round(Math.abs(t))}°`, cx + Math.cos(-tr / 2) * 48 + 4, cy + Math.sin(-tr / 2) * 48 - 2, "center", 15, ctx.fillStyle as string, "700");
  }
  const sideMark = (c: { x: number; y: number }, out: boolean | null, name: string) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    if (out === true) {
      ctx.fillStyle = look.screen ? COLOURS.current : INK;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (out === false) {
      ctx.strokeStyle = look.screen ? COLOURS.current : INK;
      line(ctx, c.x - 7, c.y - 7, c.x + 7, c.y + 7);
      line(ctx, c.x - 7, c.y + 7, c.x + 7, c.y - 7);
    }
    const lx = c.x + (c.x - cx) * 0.38;
    const ly = c.y + (c.y - cy) * 0.38;
    text(ctx, name, lx, ly, "center", 15, INK, "700");
  };
  const shown = look.current && Math.abs(emf) > peak * 0.03;
  // Positive emf drives current along side P towards the rings — out of this view.
  sideMark(a, shown ? emf > 0 : null, "P");
  sideMark(b, shown ? emf < 0 : null, "Q");

  // The crank: an arm from the axle, opposite the normal, to a knob.
  ctx.strokeStyle = look.screen ? "#546e7a" : INK;
  ctx.lineWidth = 6;
  const knob = { x: cx - Math.cos(theta) * reach, y: cy + Math.sin(theta) * reach };
  line(ctx, cx, cy, knob.x, knob.y);
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = look.screen ? "#ffb74d" : "#fff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Which way it turns, under the view.
  const arcY = cy + 178;
  ctx.strokeStyle = look.screen ? "#455a64" : INK;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, arcY, 26, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  const endA = p.clockwise ? Math.PI * 1.85 : Math.PI * 1.15;
  const ex = cx + Math.cos(endA) * 26;
  const ey = arcY + Math.sin(endA) * 26;
  arrowHead(ctx, ex, ey, p.clockwise ? endA + Math.PI / 2 : endA - Math.PI / 2, 10);
  text(ctx, p.clockwise ? "Turned clockwise" : "Turned anticlockwise", cx, arcY + 22, "center", 15, ctx.fillStyle as string);
  if (look.screen) text(ctx, "Drag the crank to turn it by hand", cx, arcY + 50, "center", 14, "#78909c");
}

// ---------- the graphs ----------

export interface GraphLook {
  screen: boolean;
  /** Numbers on the axes (the papers usually ask for shapes only). */
  values: boolean;
  /** Mark where the coil's plane was perpendicular (⊥) and parallel (∥) to the field. */
  markers: boolean;
}

interface Trace {
  samples: Sample[];
  colour: string;
  dashed: boolean;
}

/** Scales for the three graphs that fit the current sweep, the held trace and the steady peak. */
function scales(window: number, all: Sample[], peakFlux: number, peakRate: number, peakEmf: number) {
  const max = (pick: (s: Sample) => number, floor: number) => Math.max(floor, ...all.map((s) => Math.abs(pick(s)))) * 1.08;
  return {
    t: niceScale(0, window, true, 8),
    flux: niceScale(-max((s) => s.flux, peakFlux), max((s) => s.flux, peakFlux), true, 4),
    rate: niceScale(-max((s) => s.rate, peakRate), max((s) => s.rate, peakRate), true, 4),
    emf: niceScale(-max((s) => s.emf, peakEmf), max((s) => s.emf, peakEmf), true, 4),
  };
}

/**
 * The three graphs against time, stacked: Φ, ΔΦ/Δt and the emf across the
 * terminals. `held` is drawn dashed underneath, for comparison.
 */
export function drawGraphs(
  ctx: CanvasRenderingContext2D,
  window: number,
  now: number,
  samples: Sample[],
  held: Sample[] | null,
  peaks: { flux: number; rate: number; emf: number },
  look: GraphLook,
  height = GRAPH_H,
) {
  const sc = scales(window, [...samples, ...(held ?? [])], peaks.flux, peaks.rate, peaks.emf);
  const rows: Array<{ key: "flux" | "rate" | "emf"; label: [string, string]; unit: string; scale: Scale; colour: string }> = [
    { key: "flux", label: ["Φ", ""], unit: "Wb", scale: sc.flux, colour: COLOURS.flux },
    { key: "rate", label: ["ΔΦ/Δt", ""], unit: "Wb·s⁻¹", scale: sc.rate, colour: COLOURS.rate },
    { key: "emf", label: ["emf", ""], unit: "V", scale: sc.emf, colour: COLOURS.emf },
  ];
  const left = 104;
  const right = GRAPH_W - 34;
  const rowH = height / 3;
  const marks = look.markers ? crossings(samples) : [];
  rows.forEach((row, i) => {
    const top = i * rowH + 18;
    const bottom = (i + 1) * rowH - 34;
    const X = (t: number) => left + (t / sc.t.max) * (right - left);
    const Y = (v: number) => bottom - ((v - row.scale.min) / (row.scale.max - row.scale.min)) * (bottom - top);
    // Grid and numbers.
    ctx.lineWidth = 1;
    ctx.strokeStyle = look.screen ? "#e6eaee" : "#ddd";
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "#5f6b76";
    if (look.values) {
      for (const t of tickValues(sc.t)) {
        line(ctx, X(t), top, X(t), bottom);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(formatTick(t, sc.t.step), X(t), Y(0) + 5 > bottom - 14 ? bottom + 4 : bottom + 4);
      }
      for (const v of tickValues(row.scale)) {
        line(ctx, left, Y(v), right, Y(v));
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(formatTick(v, row.scale.step).replace(/^-/, "−"), left - 8, Y(v));
      }
    }
    // Where the coil was perpendicular or parallel to the field.
    for (const m of marks) {
      ctx.strokeStyle = m.kind === "perpendicular" ? "rgba(21,101,192,0.35)" : "rgba(198,40,40,0.3)";
      ctx.setLineDash([3, 4]);
      line(ctx, X(m.t), top, X(m.t), bottom);
      ctx.setLineDash([]);
      if (i === 0) text(ctx, m.kind === "perpendicular" ? "⊥" : "∥", X(m.t), top - 8, "center", 13, m.kind === "perpendicular" ? COLOURS.flux : COLOURS.emf, "700");
    }
    // Axes, with the time axis along zero.
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.8;
    line(ctx, left, top - 4, left, bottom);
    arrowHead(ctx, left, top - 8, -Math.PI / 2, 9);
    line(ctx, left, Y(0), right + 10, Y(0));
    arrowHead(ctx, right + 16, Y(0), 0, 9);
    text(ctx, "t (s)", right + 4, Y(0) + 18, "right", 14, INK);
    subText(ctx, row.label[0], row.label[1], 44, (top + bottom) / 2 - 10, 19, look.screen ? row.colour : INK);
    text(ctx, `(${row.unit})`, 44, (top + bottom) / 2 + 13, "center", 13, look.screen ? "#5f6b76" : INK);
    // The traces: held (dashed), then this sweep.
    const traces: Trace[] = [];
    if (held?.length) traces.push({ samples: held, colour: look.screen ? COLOURS.held : "#777", dashed: true });
    traces.push({ samples, colour: look.screen ? row.colour : INK, dashed: false });
    for (const tr of traces) {
      if (tr.samples.length < 2) continue;
      ctx.strokeStyle = tr.colour;
      ctx.lineWidth = tr.dashed ? 2 : 2.6;
      ctx.setLineDash(tr.dashed ? [7, 5] : []);
      ctx.beginPath();
      let started = false;
      for (const s of tr.samples) {
        if (s.t > sc.t.max) break;
        const x = X(s.t);
        const y = Y(s[row.key]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Where we are now.
    if (look.screen && now > 0 && now <= sc.t.max) {
      ctx.strokeStyle = "rgba(55,71,79,0.35)";
      ctx.lineWidth = 1;
      line(ctx, X(now), top, X(now), bottom);
    }
  });
}
