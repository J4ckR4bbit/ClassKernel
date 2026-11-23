// Drawing the collision and its graphs.
//
// The track is a frictionless horizontal surface with two trolleys, A on the
// left and B on the right, their bumpers facing: springs for a bounce, putty
// pads when they stick, and a thread holding a compressed spring between them
// for an explosion. A velocity arrow above each. The graphs are velocity and
// momentum against time for the whole run (the total momentum a flat line),
// and the force on each during the contact, its area — the impulse — shaded.

import { niceScale } from "../scale";
import { formatFixed } from "../numbers";
import { INK, arrow, line, richText, text } from "../shared/canvas";
import { drawAxes, frame, plot } from "../shared/graph";
import { CollParams, Plan, RunState, forceAt, squeeze, stateAt } from "./collisions";
import { n2 } from "./memo";

export const SKETCH_W = 1000;
export const SKETCH_H = 330;
export const GRAPH_W = 1000;
export const GRAPH_H = 640;

const COL = { A: "#1e88e5", B: "#ef6c00", total: "#263238", held: "#90a4ae" };
const FILL = { A: "#bbdefb", B: "#ffe0b2" };
const GREY = "#455a64";
const TRACK_Y = 250;
const X0 = 40;
const X1 = SKETCH_W - 40;

export interface SketchLook {
  screen: boolean;
  /** Hide the velocities after the contact (question mode). */
  question: boolean;
  /** +1 if right is positive, −1 if left. */
  sign: number;
}

function zigzag(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, coils: number, amp: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  const n = coils * 2;
  for (let i = 1; i < n; i++) ctx.lineTo(x1 + ((x2 - x1) * i) / n, y + (i % 2 ? -amp : amp));
  ctx.lineTo(x2, y);
  ctx.stroke();
}

/** One trolley: body, wheels, bumper on the facing side, its letter and mass. */
function trolley(
  ctx: CanvasRenderingContext2D,
  which: "A" | "B",
  left: number,
  right: number,
  bumperLen: number,
  bumperDrawn: number,
  kind: CollParams["kind"],
  mass: number,
  look: SketchLook,
) {
  const bodyL = which === "A" ? left : left + bumperLen;
  const bodyR = which === "A" ? right - bumperLen : right;
  const top = TRACK_Y - 92;
  const bottom = TRACK_Y - 22;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillStyle = look.screen ? FILL[which] : "#fff";
  ctx.beginPath();
  ctx.rect(bodyL, top, bodyR - bodyL, bottom - top);
  ctx.fill();
  ctx.stroke();
  for (const wx of [bodyL + (bodyR - bodyL) * 0.25, bodyL + (bodyR - bodyL) * 0.75]) {
    ctx.beginPath();
    ctx.arc(wx, TRACK_Y - 11, 11, 0, Math.PI * 2);
    ctx.fillStyle = look.screen ? "#546e7a" : "#fff";
    ctx.fill();
    ctx.stroke();
  }
  text(ctx, which, (bodyL + bodyR) / 2, top + 22, "center", 24, INK, "700");
  text(ctx, `${formatFixed(mass, mass < 10 ? 1 : 0).replace(/,0$/, "")} kg`, (bodyL + bodyR) / 2, top + 50, "center", 15, INK);
  // The bumper, from the body's face towards the other trolley.
  const face = which === "A" ? bodyR : bodyL;
  const dir = which === "A" ? 1 : -1;
  const tip = face + dir * bumperDrawn;
  const y = (top + bottom) / 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  if (kind === "stick") {
    // Putty: a soft pad that squashes.
    ctx.beginPath();
    ctx.ellipse((face + tip) / 2, y, Math.abs(tip - face) / 2 + 1, 18 + (bumperLen - bumperDrawn) * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = look.screen ? "#a1887f" : "#fff";
    ctx.fill();
    ctx.stroke();
  } else {
    zigzag(ctx, face, tip - dir * 4, y, 5, 9);
    ctx.lineWidth = 3;
    line(ctx, tip - dir * 4, y - 14, tip - dir * 4, y + 14);
  }
}

/** The track, the two trolleys at their positions now, their velocity arrows and what is happening. */
export function drawSketch(
  ctx: CanvasRenderingContext2D,
  p: CollParams,
  pl: Plan,
  s: RunState,
  look: SketchLook,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const scale = (X1 - X0) / pl.track;
  const X = (m: number) => X0 + m * scale;
  // The track.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  line(ctx, X0 - 10, TRACK_Y, X1 + 10, TRACK_Y);
  ctx.lineWidth = 1;
  for (let x = X0; x <= X1 + 10; x += 18) line(ctx, x, TRACK_Y, x - 10, TRACK_Y + 12);
  text(ctx, "frictionless horizontal surface", SKETCH_W / 2, TRACK_Y + 30, "center", 14, look.screen ? GREY : INK);

  const bumper = pl.width * 0.22 * scale;
  const sq = squeeze(pl, s) * scale;
  // Each bumper takes half the squeeze, never shrinking past a sliver.
  const drawn = Math.max(bumper * 0.15, bumper - sq / 2);
  const shift = Math.max(0, sq / 2 - (bumper - drawn));
  trolley(ctx, "A", X(s.xA - pl.width / 2) - shift, X(s.xA + pl.width / 2) - shift, bumper, drawn, p.kind, p.massA, look);
  trolley(ctx, "B", X(s.xB - pl.width / 2) + shift, X(s.xB + pl.width / 2) + shift, bumper, drawn, p.kind, p.massB, look);

  if (p.kind === "explosion" && s.t < pl.tc) {
    // The thread holding the spring compressed.
    ctx.strokeStyle = look.screen ? "#6d4c41" : INK;
    ctx.lineWidth = 1.5;
    const y = TRACK_Y - 100;
    line(ctx, X(s.xA), y, X(s.xB), y);
    text(ctx, "thread", (X(s.xA) + X(s.xB)) / 2, y - 12, "center", 13, look.screen ? "#6d4c41" : INK);
  }

  // A burst at the contact while they push on each other.
  if (s.phase === "contact") {
    const peak = Math.abs(forceAt(pl.out.dpB, pl.dt, pl.dt / 2)) || 1;
    const k = Math.abs(s.fB) / peak;
    const cx = (X(s.xA + pl.width / 2) + X(s.xB - pl.width / 2)) / 2;
    const cy = TRACK_Y - 57;
    ctx.strokeStyle = look.screen ? "#fbc02d" : INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      line(ctx, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * (18 + 26 * k), cy + Math.sin(a) * (18 + 26 * k));
    }
  }

  // Velocity arrows.
  const vmax = Math.max(0.01, Math.abs(pl.uA), Math.abs(pl.uB), Math.abs(pl.out.vA), Math.abs(pl.out.vB));
  const hideAfter = look.question && s.phase !== "before";
  const vel = (x: number, v: number, colour: string, row: number) => {
    const y = TRACK_Y - 122 - row * 34;
    const len = (Math.abs(v) / vmax) * 130;
    ctx.strokeStyle = look.screen ? colour : INK;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    if (len > 3 && !hideAfter) arrow(ctx, x, y, x + Math.sign(v) * len, y, 13);
    const label = hideAfter ? "v = ?" : Math.abs(v) < 0.005 ? "at rest" : `${n2(Math.abs(v))} m·s⁻¹`;
    const plain = hideAfter || len <= 3;
    text(ctx, label, plain ? x : x + Math.sign(v) * (len + 8), y, plain ? "center" : v > 0 ? "left" : "right", 15, look.screen ? colour : INK, "700");
  };
  const together = Math.abs(s.vA - s.vB) < 1e-6 && Math.abs(s.xB - s.xA - pl.width) < pl.width * 0.5;
  if (together && s.phase !== "before") vel((X(s.xA) + X(s.xB)) / 2, s.vA, COL.total, 0);
  else {
    vel(X(s.xA), s.vA, COL.A, 0);
    vel(X(s.xB), s.vB, COL.B, 1);
  }

  // What's happening, and the sign convention.
  const phase = s.phase === "before" ? (pl.out.collides ? "Before" : "No collision") : s.phase === "contact" ? `In contact (Δt = ${formatFixed(pl.dt, 2)} s)` : "After";
  text(ctx, phase, 24, 26, "left", 17, look.screen ? GREY : INK, "700");
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  const sx = SKETCH_W - 150;
  if (look.sign > 0) arrow(ctx, sx, 26, sx + 60, 26, 10);
  else arrow(ctx, sx + 60, 26, sx, 26, 10);
  text(ctx, "+", look.sign > 0 ? sx + 74 : sx - 14, 26, "center", 20, INK, "700");
  text(ctx, `t = ${formatFixed(s.t, 2)} s`, SKETCH_W / 2, 26, "center", 15, look.screen ? GREY : INK);
}

// ---------- the graphs ----------

export interface GraphLook {
  screen: boolean;
  values: boolean;
  sign: number;
  /** Draw the average force over the contact, dashed, beside the curve. */
  average: boolean;
}

/** Times to sample a run at: coarse outside the contact, fine through it. */
function times(pl: Plan, until: number): number[] {
  const out: number[] = [];
  const push = (a: number, b: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      if (t <= until + 1e-12) out.push(t);
    }
  };
  if (pl.out.collides && pl.out.possible) {
    push(0, pl.tc, 40);
    push(pl.tc, pl.tc + pl.dt, 80);
    push(pl.tc + pl.dt, pl.tEnd, 40);
  } else push(0, pl.tEnd, 80);
  if (out.length && out[out.length - 1] < until && until <= pl.tEnd) out.push(until);
  return out;
}

const sym = (v: number) => {
  const m = Math.max(Math.abs(v), 1e-9) * 1.15;
  return niceScale(-m, m, true, 6);
};

/**
 * Three graphs: velocity and momentum against time for the run so far, and
 * the force on each object during the contact. `held` is an earlier contact's
 * force on B (its Δp and Δt), drawn dashed to compare.
 */
export function drawGraphs(
  ctx: CanvasRenderingContext2D,
  p: CollParams,
  pl: Plan,
  now: number,
  held: { dp: number; dt: number; label: string } | null,
  look: GraphLook,
) {
  const sg = look.sign;
  const ts = times(pl, now);
  const states = ts.map((t) => stateAt(pl, t));
  const colour = (k: keyof typeof COL) => (look.screen ? COL[k] : INK);
  const xs = niceScale(0, pl.tEnd, true, 6);

  // Velocity–time.
  const vAll = [pl.uA, pl.uB, pl.out.vA, pl.out.vB];
  const vf = frame(84, 470, 46, 270, xs, sym(Math.max(...vAll.map(Math.abs))));
  drawAxes(ctx, vf, { xLabel: "t (s)", yLabel: "v (m·s⁻¹)", values: look.values, screen: look.screen });
  plot(ctx, vf, ts.map((t, i) => [t, sg * states[i].vA]), colour("A"), 2.6);
  plot(ctx, vf, ts.map((t, i) => [t, sg * states[i].vB]), colour("B"), 2.6, look.screen ? [] : [8, 5]);

  // Momentum–time, with the total.
  const pAll = [p.massA * pl.uA, p.massB * pl.uB, p.massA * pl.out.vA, p.massB * pl.out.vB, pl.out.pBefore];
  const pf = frame(590, GRAPH_W - 40, 46, 270, xs, sym(Math.max(...pAll.map(Math.abs))));
  drawAxes(ctx, pf, { xLabel: "t (s)", yLabel: "p (kg·m·s⁻¹)", values: look.values, screen: look.screen });
  plot(ctx, pf, ts.map((t, i) => [t, sg * p.massA * states[i].vA]), colour("A"), 2.6);
  plot(ctx, pf, ts.map((t, i) => [t, sg * p.massB * states[i].vB]), colour("B"), 2.6, look.screen ? [] : [8, 5]);
  plot(ctx, pf, ts.map((t, i) => [t, sg * (p.massA * states[i].vA + p.massB * states[i].vB)]), colour("total"), 2.2, [3, 5]);
  // Keys.
  const key = (x: number, y: number, k: keyof typeof COL, label: string, dash: number[]) => {
    ctx.strokeStyle = colour(k);
    ctx.lineWidth = 2.6;
    ctx.setLineDash(dash);
    line(ctx, x, y, x + 26, y);
    ctx.setLineDash([]);
    text(ctx, label, x + 32, y, "left", 13, INK);
  };
  key(vf.left + 40, 306, "A", "A", []);
  key(vf.left + 110, 306, "B", "B", look.screen ? [] : [8, 5]);
  key(pf.left + 40, 306, "A", "A", []);
  key(pf.left + 110, 306, "B", "B", look.screen ? [] : [8, 5]);
  key(pf.left + 180, 306, "total", "total: constant", [3, 5]);

  // Force–time during the contact.
  if (!(pl.out.collides && pl.out.possible)) {
    text(ctx, "No contact, so no force: nothing to draw here.", GRAPH_W / 2, 470, "center", 16, look.screen ? GREY : INK);
    return;
  }
  const spanDt = Math.max(pl.dt, held?.dt ?? 0);
  // Room on the right for the labels.
  const fx = niceScale(-0.15 * spanDt, 1.75 * spanDt, true, 7);
  const fPeak = Math.max(Math.abs(forceAt(pl.out.dpB, pl.dt, pl.dt / 2)), held ? Math.abs(forceAt(held.dp, held.dt, held.dt / 2)) : 0);
  const ff = frame(110, GRAPH_W - 60, 360, GRAPH_H - 40, fx, sym(fPeak));
  drawAxes(ctx, ff, { xLabel: "time from first contact (s)", yLabel: "F (N)", values: look.values, screen: look.screen });
  const curve = (dp: number, dt: number, upTo: number) => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 120; i++) {
      const tau = fx.min + ((fx.max - fx.min) * i) / 120;
      if (tau > upTo) break;
      pts.push([tau, sg * forceAt(dp, dt, tau)]);
    }
    return pts;
  };
  const upTo = now - pl.tc;
  if (held) plot(ctx, ff, curve(held.dp, held.dt, Infinity), look.screen ? COL.held : "#777", 2, [7, 5]);
  const fB = curve(pl.out.dpB, pl.dt, upTo);
  // The impulse on B: the area under its curve, shaded.
  if (fB.length > 1) {
    ctx.beginPath();
    ctx.moveTo(ff.X(fB[0][0]), ff.Y(0));
    fB.forEach(([x, y]) => ctx.lineTo(ff.X(x), ff.Y(y)));
    ctx.lineTo(ff.X(fB[fB.length - 1][0]), ff.Y(0));
    ctx.closePath();
    ctx.fillStyle = look.screen ? "rgba(239,108,0,0.18)" : "rgba(0,0,0,0.08)";
    ctx.fill();
  }
  plot(ctx, ff, curve(pl.out.dpA, pl.dt, upTo), colour("A"), 2.6);
  plot(ctx, ff, fB, colour("B"), 2.6, look.screen ? [] : [8, 5]);
  const done = upTo >= pl.dt;
  if (look.average && done) {
    ctx.strokeStyle = look.screen ? "#bf360c" : INK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    const avg = sg * pl.out.forceB;
    line(ctx, ff.X(0), ff.Y(avg), ff.X(pl.dt), ff.Y(avg));
    line(ctx, ff.X(0), ff.Y(0), ff.X(0), ff.Y(avg));
    line(ctx, ff.X(pl.dt), ff.Y(0), ff.X(pl.dt), ff.Y(avg));
    ctx.setLineDash([]);
    richText(ctx, `average F = Δp/Δt = ${n2(avg)} N`, ff.X(pl.dt) + 10, ff.Y(avg), "left", 14, look.screen ? "#bf360c" : INK, "700");
  }
  if (done && look.values) {
    const yB = ff.Y((sg * forceAt(pl.out.dpB, pl.dt, pl.dt / 2)) * 0.3);
    richText(ctx, `area = impulse on B = Δp_B = ${n2(sg * pl.out.dpB)} N·s`, ff.X(pl.dt * 0.5), yB, "center", 14, look.screen ? "#bf360c" : INK, "700");
    text(ctx, "on A: equal and opposite", ff.X(pl.dt * 0.5), ff.Y((sg * forceAt(pl.out.dpA, pl.dt, pl.dt / 2)) / 2), "center", 14, colour("A"), "700");
  }
  if (held) text(ctx, `dashed: ${held.label}`, ff.right - 4, ff.top + 6, "right", 13, look.screen ? COL.held : "#555", "700");
}
