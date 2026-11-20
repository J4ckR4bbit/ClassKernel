// Drawing the slope, the free-body diagrams and the v–t graph.
//
// The sketch is drawn the way a paper draws it: the slope as a triangle on a
// bench with its angle marked, the block with its mass in it, the applied
// force as a labelled arrow, a pulley at the top with the hanging mass. The
// free-body diagrams follow the SAG: the object as a dot, every force an arrow
// pointing away from it, drawn to scale so their relative sizes are right,
// labelled with the data-sheet symbols (Fg, FN, Ff) or in words; the resolved
// diagram adds the weight's components as dashed arrows, as the IEB requires
// when they appear beside Fg.
//
// Everything is in scene units with y down; the caller sets the transform.

import { formatFixed } from "../numbers";
import { Scale, formatTick, niceScale, tickValues } from "../scale";
import { BLOCK_LENGTH, FLOOR, Forces, HANG_BOX, Motion, SlopeParams, hangDepth, hangStart } from "./slope";

export const SKETCH_W = 1000;
export const SKETCH_H = 560;
/** One free-body diagram's box, in scene units; the diagrams sit side by side or one above the other. */
export const FBD_PANEL_W = 500;
export const FBD_PANEL_H = 420;
export type Arrangement = "row" | "column";

/** The scene size for the block's diagrams (two, or three with a hanging mass). */
export function fbdScene(p: SlopeParams, arrangement: Arrangement): { w: number; h: number } {
  const panels = p.setup === "pulley" ? 3 : 2;
  return arrangement === "row" ? { w: FBD_PANEL_W * panels, h: FBD_PANEL_H } : { w: FBD_PANEL_W, h: FBD_PANEL_H * panels };
}
export const GRAPH_W = 1000;
export const GRAPH_H = 300;

const INK = "#000";
const FONT = "Arial, Helvetica, sans-serif";

/** Force colours on screen; on paper everything is black. */
const COLOURS = {
  weight: "#1565c0",
  normal: "#2e7d32",
  friction: "#c62828",
  applied: "#6a1b9a",
  tension: "#e65100",
  net: "#455a64",
};

export type LabelStyle = "symbols" | "words";

export interface SketchLook {
  /** On screen (colour, motion aids) or the plain picture for a paper. */
  screen: boolean;
  /** Write the angle's value (30°) or just θ. */
  angleValue: boolean;
  /** Draw the forces on the block in the picture too. */
  forces: boolean;
  /** An arrow showing the block's velocity. */
  velocity: boolean;
  labels: LabelStyle;
  /** Hide every number the class should work out. */
  question: boolean;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const n2 = (v: number) => formatFixed(v, 2);
const trim = (v: number, dp = 2) => formatFixed(v, dp).replace(/,?0+$/, "");

// ---------- text with subscripts ----------

/** "F_g", "F_{g∥}", "μ_s": a letter, then an underscore and the subscript (one character, or braced). */
function runs(text: string): Array<[string, boolean]> {
  const out: Array<[string, boolean]> = [];
  let i = 0;
  let plain = "";
  while (i < text.length) {
    if (text[i] === "_" && i + 1 < text.length) {
      if (plain) out.push([plain, false]);
      plain = "";
      if (text[i + 1] === "{") {
        const end = text.indexOf("}", i + 2);
        out.push([text.slice(i + 2, end < 0 ? undefined : end), true]);
        i = end < 0 ? text.length : end + 1;
      } else {
        out.push([text[i + 1], true]);
        i += 2;
      }
    } else plain += text[i++];
  }
  if (plain) out.push([plain, false]);
  return out;
}

function textWidth(ctx: CanvasRenderingContext2D, text: string, size: number, weight = "400"): number {
  let w = 0;
  for (const [t, sub] of runs(text)) {
    ctx.font = `${weight} ${sub ? Math.round(size * 0.7) : size}px ${FONT}`;
    w += ctx.measureText(t).width;
  }
  return w;
}

/** Draw text with subscripts, its box's left/centre/right at x and its middle at y. */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, align: "left" | "center" | "right", size = 18, colour = INK, weight = "400") {
  const w = textWidth(ctx, s, size, weight);
  let left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  ctx.fillStyle = colour;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const [t, sub] of runs(s)) {
    ctx.font = `${weight} ${sub ? Math.round(size * 0.7) : size}px ${FONT}`;
    ctx.fillText(t, left, sub ? y + size * 0.3 : y);
    left += ctx.measureText(t).width;
  }
}

/** A label placed just beyond a point in a direction (dx, dy), clear of it whichever way it points. */
function labelAt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, dx: number, dy: number, size: number, colour: string) {
  const w = textWidth(ctx, s, size);
  const gap = 10;
  const cx = x + dx * (gap + w / 2);
  const cy = y + dy * (gap + size * 0.6);
  text(ctx, s, cx, cy, "center", size, colour);
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, colour: string, opts: { width?: number; dashed?: boolean; head?: number } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const head = Math.min(opts.head ?? 14, len * 0.6);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = opts.width ?? 3;
  ctx.lineCap = "round";
  ctx.setLineDash(opts.dashed ? [9, 6] : []);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - ux * head * 0.8, y2 - uy * head * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * head - uy * head * 0.45, y2 - uy * head + ux * head * 0.45);
  ctx.lineTo(x2 - ux * head + uy * head * 0.45, y2 - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
}

// ---------- the sketch ----------

/** Where things are in the sketch: metres to scene units, y up in metres and down on screen. */
export interface Layout {
  scale: number;
  ox: number;
  oy: number;
}

/** The slope's direction (up the slope) and its outward normal, in metres with y up. */
function axes(p: SlopeParams) {
  const t = rad(p.angle);
  return { u: { x: Math.cos(t), y: Math.sin(t) }, n: { x: -Math.sin(t), y: Math.cos(t) } };
}

const BLOCK_H = 0.3;
const PULLEY_R = 0.12;

/** The pulley's centre, in metres: at the top of the slope, its top level with the string. */
function pulleyCentre(p: SlopeParams) {
  const { u, n } = axes(p);
  const top = { x: p.length * u.x, y: p.length * u.y };
  return { x: top.x + u.x * 0.18 + n.x * (BLOCK_H / 2 - PULLEY_R), y: top.y + u.y * 0.18 + n.y * (BLOCK_H / 2 - PULLEY_R) };
}

/** Fit the slope (and the hanging mass's travel) into the sketch. */
export function layoutFor(p: SlopeParams): Layout {
  const { u } = axes(p);
  const xs = [-0.5, p.length * u.x + 0.5];
  const ys = [-0.15, p.length * u.y + 0.55];
  if (p.setup === "pulley") {
    const c = pulleyCentre(p);
    xs.push(c.x + PULLEY_R + HANG_BOX / 2 + 0.35);
    ys.push(-FLOOR - 0.1, c.y + PULLEY_R + 0.2);
  }
  if (p.setup === "block" && p.force > 0) ys.push(p.length * u.y + 0.9);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const margin = 40;
  const scale = Math.min((SKETCH_W - 2 * margin) / w, (SKETCH_H - 2 * margin) / h);
  const ox = (SKETCH_W - w * scale) / 2 - Math.min(...xs) * scale;
  const oy = (SKETCH_H + h * scale) / 2 + Math.min(...ys) * scale;
  return { scale, ox, oy };
}

/** Ease one layout towards another (the sketch glides as the angle changes). */
export function easeLayout(from: Layout, to: Layout, k: number): Layout {
  return { scale: from.scale + (to.scale - from.scale) * k, ox: from.ox + (to.ox - from.ox) * k, oy: from.oy + (to.oy - from.oy) * k };
}

export function drawSketch(ctx: CanvasRenderingContext2D, p: SlopeParams, m: Motion, f: Forces, L: Layout, look: SketchLook) {
  const S = (x: number, y: number) => ({ x: L.ox + x * L.scale, y: L.oy - y * L.scale });
  const { u, n } = axes(p);
  const theta = rad(p.angle);
  const ink = INK;
  const screen = look.screen;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // The bench, and under a pulley the floor the hanging mass falls to.
  const top = { x: p.length * u.x, y: p.length * u.y };
  const benchL = S(-0.5, 0);
  const benchR = S(p.setup === "pulley" ? top.x : top.x + 0.5, 0);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(benchL.x, benchL.y);
  ctx.lineTo(benchR.x, benchR.y);
  ctx.stroke();
  // Hatching under the bench.
  ctx.lineWidth = 1.2;
  for (let x = benchL.x + 8; x < benchR.x; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, benchL.y);
    ctx.lineTo(x - 8, benchL.y + 8);
    ctx.stroke();
  }
  if (p.setup === "pulley") {
    const edgeTop = S(top.x, 0);
    const edgeBottom = S(top.x, -FLOOR);
    const floorR = S(top.x + 1.2, -FLOOR);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(edgeTop.x, edgeTop.y);
    ctx.lineTo(edgeBottom.x, edgeBottom.y);
    ctx.lineTo(floorR.x, floorR.y);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let x = edgeBottom.x + 8; x < floorR.x; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, edgeBottom.y);
      ctx.lineTo(x - 8, edgeBottom.y + 8);
      ctx.stroke();
    }
  }

  // The slope.
  const b0 = S(0, 0);
  const b1 = S(top.x, 0);
  const b2 = S(top.x, top.y);
  ctx.beginPath();
  ctx.moveTo(b0.x, b0.y);
  ctx.lineTo(b1.x, b1.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.closePath();
  ctx.fillStyle = screen ? "#eef1f5" : "#fff";
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (!look.question || look.angleValue) {
    // The angle, at the bottom.
    const r = Math.min(70, p.length * L.scale * 0.22);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(b0.x, b0.y, r, -theta, 0);
    ctx.stroke();
  }
  {
    const r = Math.min(70, p.length * L.scale * 0.22);
    const mid = theta / 2;
    const label = look.angleValue ? `${trim(p.angle, 1)}°` : "θ";
    text(ctx, label, b0.x + Math.cos(mid) * (r + 16) + 8, b0.y - Math.sin(mid) * (r + 16), "left", 18, ink);
  }

  // The block: a rectangle standing on the slope at m.x.
  const foot = { x: m.x * u.x, y: m.x * u.y };
  const centre = { x: foot.x + n.x * (BLOCK_H / 2), y: foot.y + n.y * (BLOCK_H / 2) };
  const corner = (along: number, out: number) => S(foot.x + u.x * along + n.x * out, foot.y + u.y * along + n.y * out);
  const hb = BLOCK_LENGTH / 2;
  const blockPts = [corner(-hb, 0), corner(hb, 0), corner(hb, BLOCK_H), corner(-hb, BLOCK_H)];

  // The string and the hanging mass.
  if (p.setup === "pulley") {
    const c = pulleyCentre(p);
    const pc = S(c.x, c.y);
    const rPx = PULLEY_R * L.scale;
    // The bracket holding the pulley to the top of the slope.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b2.x, b2.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.stroke();
    const hangTop = S(c.x + PULLEY_R, c.y - hangDepth(p, m));
    if (!m.cut) {
      // Block to the top of the pulley, round it, and down to the hanging mass.
      const anchor = S(centre.x + u.x * hb, centre.y + u.y * hb);
      const tangent = S(c.x + n.x * PULLEY_R, c.y + n.y * PULLEY_R);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(tangent.x, tangent.y);
      ctx.arc(pc.x, pc.y, rPx, -(Math.PI / 2 + theta), 0);
      ctx.lineTo(hangTop.x, hangTop.y);
      ctx.stroke();
    } else {
      // Cut: a loose end on the block.
      const anchor = S(centre.x + u.x * hb, centre.y + u.y * hb);
      const end = S(centre.x + u.x * (hb + 0.15), centre.y + u.y * (hb + 0.15) - 0.05);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = screen ? "#fff" : "#fff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pc.x, pc.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    const box = HANG_BOX * L.scale;
    const hx = hangTop.x - box / 2;
    ctx.fillStyle = screen ? "#fde2c8" : "#fff";
    ctx.fillRect(hx, hangTop.y, box, box);
    ctx.lineWidth = 2;
    ctx.strokeRect(hx, hangTop.y, box, box);
    text(ctx, `${trim(p.hangingMass)} kg`, hangTop.x + box / 2 + 8, hangTop.y + box / 2, "left", 17, ink);
  }

  ctx.beginPath();
  blockPts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.fillStyle = screen ? "#d7e3f4" : "#fff";
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  const bc = S(centre.x, centre.y);
  text(ctx, `${trim(p.mass)} kg`, bc.x, bc.y, "center", 16, ink, "700");

  // The applied force: drawn as a pull from the leading face, or — tilted into
  // the slope — as a push onto the trailing face.
  if (p.setup === "block" && p.force > 0) {
    const sign = p.forceDir === "up" ? 1 : -1;
    const a = rad(p.forceAngle);
    const d = { x: sign * u.x * Math.cos(a) + n.x * Math.sin(a), y: sign * u.y * Math.cos(a) + n.y * Math.sin(a) };
    const len = 0.75;
    const pulling = p.forceAngle >= 0;
    const face = { x: centre.x + u.x * hb * sign * (pulling ? 1 : -1), y: centre.y + u.y * hb * sign * (pulling ? 1 : -1) };
    const from = pulling ? face : { x: face.x - d.x * len, y: face.y - d.y * len };
    const to = pulling ? { x: face.x + d.x * len, y: face.y + d.y * len } : face;
    const A = S(from.x, from.y);
    const B = S(to.x, to.y);
    const colour = screen ? COLOURS.applied : ink;
    arrow(ctx, A.x, A.y, B.x, B.y, colour, { width: 3 });
    const label = look.question ? "F" : `F = ${trim(p.force)} N`;
    const ux = (B.x - A.x) / Math.hypot(B.x - A.x, B.y - A.y);
    const uy = (B.y - A.y) / Math.hypot(B.x - A.x, B.y - A.y);
    if (pulling) labelAt(ctx, label, B.x, B.y, ux, uy, 18, colour);
    else labelAt(ctx, label, A.x, A.y, -ux, -uy, 18, colour);
    if (Math.abs(p.forceAngle) > 0.05) {
      // The angle to the slope, at the face: a dashed line along the slope and an arc.
      const O = S(face.x, face.y);
      const out = pulling ? 1 : -1;
      const along = S(face.x + u.x * sign * len * out, face.y + u.y * sign * len * out);
      const ray = pulling ? B : A;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(O.x, O.y);
      ctx.lineTo(along.x, along.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const r = 0.42 * L.scale;
      let base = Math.atan2(along.y - O.y, along.x - O.x);
      let tip = Math.atan2(ray.y - O.y, ray.x - O.x);
      if (Math.abs(tip - base) > Math.PI) {
        if (tip < base) tip += 2 * Math.PI;
        else base += 2 * Math.PI;
      }
      ctx.beginPath();
      ctx.arc(O.x, O.y, r, Math.min(base, tip), Math.max(base, tip));
      ctx.stroke();
      const mid = (base + tip) / 2;
      text(ctx, `${trim(Math.abs(p.forceAngle), 1)}°`, O.x + Math.cos(mid) * (r + 20), O.y + Math.sin(mid) * (r + 14), "center", 15, ink);
    }
  }

  // The forces on the block, from its centre (on screen, when asked).
  if (look.forces && screen) {
    const arrows = fbdArrows(p, f, false);
    const longest = Math.max(1e-9, ...arrows.map((a) => a.size));
    for (const a of arrows) {
      const len = Math.max(0.12, (a.size / longest) * 0.9) * L.scale;
      arrow(ctx, bc.x, bc.y, bc.x + a.dir.x * len, bc.y - a.dir.y * len, a.colour, { width: 2.5, dashed: a.dashed, head: 11 });
    }
    ctx.beginPath();
    ctx.arc(bc.x, bc.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }

  // The velocity, above the block.
  if (look.velocity && screen && Math.abs(m.v) > 1e-6) {
    const lift = BLOCK_H + 0.22;
    const start = S(foot.x + n.x * lift - u.x * 0.25 * Math.sign(m.v), foot.y + n.y * lift - u.y * 0.25 * Math.sign(m.v));
    const end = S(foot.x + n.x * lift + u.x * 0.25 * Math.sign(m.v), foot.y + n.y * lift + u.y * 0.25 * Math.sign(m.v));
    arrow(ctx, start.x, start.y, end.x, end.y, COLOURS.net, { width: 2.5, head: 11 });
    if (!look.question) text(ctx, `v = ${n2(Math.abs(m.v))} m·s⁻¹`, (start.x + end.x) / 2 + n.x * 0 - 0, Math.min(start.y, end.y) - 18, "center", 15, COLOURS.net);
  }
}

// ---------- free-body diagrams ----------

export interface FbdArrow {
  key: string;
  /** Unit direction, y up. */
  dir: { x: number; y: number };
  size: number;
  label: string;
  colour: string;
  dashed: boolean;
}

/**
 * The arrows of the block's free-body diagram, in the order they are drawn.
 * `resolved` adds the weight's components (dashed) and, for a force at an
 * angle, the applied force's.
 */
export function fbdArrows(p: SlopeParams, f: Forces, resolved: boolean, labels: LabelStyle = "symbols", sizes = false): FbdArrow[] {
  const { u, n } = axes(p);
  const words = labels === "words";
  const named = (sym: string, word: string, size: number) => (words ? word : sym) + (sizes ? ` = ${n2(size)} N` : "");
  const out: FbdArrow[] = [];
  const push = (key: string, dir: { x: number; y: number }, size: number, label: string, colour: string, dashed = false) => {
    if (size > 1e-9) out.push({ key, dir, size, label, colour, dashed });
  };
  push("weight", { x: 0, y: -1 }, f.weight, named("F_g", "weight", f.weight), COLOURS.weight);
  if (f.state !== "lifted") push("normal", n, f.normal, named("F_N", "normal force", f.normal), COLOURS.normal);
  if (Math.abs(f.friction) > 1e-9) {
    const s = Math.sign(f.friction);
    push("friction", { x: u.x * s, y: u.y * s }, Math.abs(f.friction), named("F_f", f.isStatic ? "static friction" : "kinetic friction", Math.abs(f.friction)), COLOURS.friction);
  }
  if (p.setup === "block" && p.force > 0) {
    const sign = p.forceDir === "up" ? 1 : -1;
    const a = rad(p.forceAngle);
    push("applied", { x: sign * u.x * Math.cos(a) + n.x * Math.sin(a), y: sign * u.y * Math.cos(a) + n.y * Math.sin(a) }, p.force, named("F", "applied force", p.force), COLOURS.applied);
  }
  if (f.tension > 1e-9) push("tension", u, f.tension, named("T", "tension", f.tension), COLOURS.tension);
  if (resolved) {
    push("weightPar", { x: -u.x, y: -u.y }, f.weightPar, `F_g sin θ${sizes ? ` = ${n2(f.weightPar)} N` : ""}`, COLOURS.weight, true);
    push("weightPerp", { x: -n.x, y: -n.y }, f.weightPerp, `F_g cos θ${sizes ? ` = ${n2(f.weightPerp)} N` : ""}`, COLOURS.weight, true);
    if (p.setup === "block" && p.force > 0 && Math.abs(p.forceAngle) > 0.05) {
      const sign = Math.sign(f.forcePar) || 1;
      push("appliedPar", { x: u.x * sign, y: u.y * sign }, Math.abs(f.forcePar), `F cos ${trim(Math.abs(p.forceAngle), 1)}°${sizes ? ` = ${n2(Math.abs(f.forcePar))} N` : ""}`, COLOURS.applied, true);
      const s2 = Math.sign(f.forcePerp) || 1;
      push("appliedPerp", { x: n.x * s2, y: n.y * s2 }, Math.abs(f.forcePerp), `F sin ${trim(Math.abs(p.forceAngle), 1)}°${sizes ? ` = ${n2(Math.abs(f.forcePerp))} N` : ""}`, COLOURS.applied, true);
    }
  }
  return out;
}

export interface FbdLook {
  screen: boolean;
  labels: LabelStyle;
  sizes: boolean;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Put a label just beyond an arrow's tip, inside the diagram's box and clear
 * of the labels already placed: if its first place is taken it slides
 * sideways, a step at a time either way, until it is clear.
 */
function placeLabel(
  ctx: CanvasRenderingContext2D,
  s: string,
  tip: { x: number; y: number },
  dir: { x: number; y: number },
  box: Rect,
  placed: Rect[],
  size: number,
  colour: string,
) {
  const w = textWidth(ctx, s, size);
  const h = size * 1.25;
  let best: Rect | null = null;
  for (let k = 0; k < 13; k++) {
    const side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h;
    let cx = tip.x + dir.x * (10 + w / 2) - dir.y * side;
    let cy = tip.y + dir.y * (8 + h / 2) + dir.x * side;
    cx = Math.min(box.x1 - w / 2 - 4, Math.max(box.x0 + w / 2 + 4, cx));
    cy = Math.min(box.y1 - h / 2 - 2, Math.max(box.y0 + h / 2 + 2, cy));
    const r = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
    best ??= r;
    if (!placed.some((q) => overlaps(q, r))) {
      best = r;
      break;
    }
  }
  placed.push(best!);
  text(ctx, s, (best!.x0 + best!.x1) / 2, (best!.y0 + best!.y1) / 2, "center", size, colour);
}

const FBD_LABEL = 19;

/** One free-body diagram in a box: a dot, the arrows to a common scale, a title and the slope's axes when resolved. */
function drawFbd(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  title: string,
  arrows: FbdArrow[],
  perPx: number,
  look: FbdLook,
  slopeAxes: { u: { x: number; y: number }; n: { x: number; y: number } } | null,
) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2 + 12;
  text(ctx, title, box.x + 14, box.y + 20, "left", 18, look.screen ? "#37474f" : INK, "700");
  if (slopeAxes) {
    // Dashed axes along and across the slope.
    ctx.strokeStyle = "#9aa4ae";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    for (const d of [slopeAxes.u, slopeAxes.n]) {
      ctx.beginPath();
      ctx.moveTo(cx - d.x * 150, cy + d.y * 150);
      ctx.lineTo(cx + d.x * 150, cy - d.y * 150);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const tips = arrows.map((a) => {
    const len = Math.max(16, a.size / perPx);
    return { a, x: cx + a.dir.x * (len + 7), y: cy - a.dir.y * (len + 7) };
  });
  for (const { a, x, y } of tips) {
    arrow(ctx, cx + a.dir.x * 7, cy - a.dir.y * 7, x, y, look.screen ? a.colour : INK, { width: a.dashed ? 2.4 : 3.2, dashed: a.dashed, head: 13 });
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  // Labels last, solid ones first so the forces keep the best places.
  const area = { x0: box.x, y0: box.y + 34, x1: box.x + box.w, y1: box.y + box.h };
  // Keep labels off the dot and off every arrow's shaft (sampled as small squares along it).
  const placed: Rect[] = [{ x0: cx - 9, y0: cy - 9, x1: cx + 9, y1: cy + 9 }];
  for (const { a, x, y } of tips) {
    const len = Math.hypot(x - cx, y - cy);
    for (let d = 14; d < len; d += 10) {
      const px = cx + a.dir.x * d;
      const py = cy - a.dir.y * d;
      placed.push({ x0: px - 3, y0: py - 3, x1: px + 3, y1: py + 3 });
    }
  }
  for (const { a, x, y } of [...tips].sort((p, q) => Number(p.a.dashed) - Number(q.a.dashed))) {
    placeLabel(ctx, a.label, { x, y }, { x: a.dir.x, y: -a.dir.y }, area, placed, FBD_LABEL, look.screen ? a.colour : INK);
  }
}

/**
 * The free-body diagrams side by side (or one above the other): the block,
 * the block with the weight resolved along the slope, and (with a pulley) the
 * hanging mass — all to one scale, so the relative sizes of the forces are right.
 */
export function drawFbds(ctx: CanvasRenderingContext2D, p: SlopeParams, f: Forces, m: Motion, look: FbdLook, arrangement: Arrangement = "row") {
  const plain = fbdArrows(p, f, false, look.labels, look.sizes);
  const resolved = fbdArrows(p, f, true, look.labels, look.sizes);
  const hanging: FbdArrow[] = [];
  const words = look.labels === "words";
  if (p.setup === "pulley") {
    const w2 = f.hangingWeight;
    hanging.push({ key: "w2", dir: { x: 0, y: -1 }, size: w2, label: (words ? "weight" : "F_g") + (look.sizes ? ` = ${n2(w2)} N` : ""), colour: COLOURS.weight, dashed: false });
    if (f.tension > 1e-9) hanging.push({ key: "t2", dir: { x: 0, y: 1 }, size: f.tension, label: (words ? "tension" : "T") + (look.sizes ? ` = ${n2(f.tension)} N` : ""), colour: COLOURS.tension, dashed: false });
  }
  const longest = Math.max(1e-9, ...[...resolved, ...hanging].map((a) => a.size));
  const perPx = longest / 120;
  const boxes = [0, 1, 2].map((i) =>
    arrangement === "row"
      ? { x: i * FBD_PANEL_W, y: 0, w: FBD_PANEL_W, h: FBD_PANEL_H }
      : { x: 0, y: i * FBD_PANEL_H, w: FBD_PANEL_W, h: FBD_PANEL_H },
  );
  drawFbd(ctx, boxes[0], "The block", plain, perPx, look, null);
  drawFbd(ctx, boxes[1], "Resolved along the slope", resolved, perPx, look, axes(p));
  if (p.setup === "pulley") drawFbd(ctx, boxes[2], m.cut ? "The hanging mass (falling)" : "The hanging mass", hanging, perPx, look, null);
  // Dividers.
  const panels = p.setup === "pulley" ? 3 : 2;
  ctx.strokeStyle = "#d5dbe1";
  ctx.lineWidth = 1;
  for (let i = 1; i < panels; i++) {
    ctx.beginPath();
    if (arrangement === "row") {
      ctx.moveTo(i * FBD_PANEL_W, 12);
      ctx.lineTo(i * FBD_PANEL_W, FBD_PANEL_H - 12);
    } else {
      ctx.moveTo(12, i * FBD_PANEL_H);
      ctx.lineTo(FBD_PANEL_W - 12, i * FBD_PANEL_H);
    }
    ctx.stroke();
  }
}

// ---------- the v–t graph ----------

export interface Sample {
  t: number;
  v: number;
}

/** Velocity against time so far, up the slope positive. */
export function drawGraph(ctx: CanvasRenderingContext2D, samples: Sample[], screen: boolean, hideValues: boolean) {
  const left = 78;
  const right = GRAPH_W - 24;
  const topY = 26;
  const bottom = GRAPH_H - 46;
  const tMax = Math.max(2, ...samples.map((s) => s.t));
  const vs = samples.map((s) => s.v);
  const tScale: Scale = niceScale(0, tMax, true, 8);
  const vScale: Scale = niceScale(Math.min(-0.5, ...vs), Math.max(0.5, ...vs), true, 5);
  const X = (t: number) => left + ((t - tScale.min) / (tScale.max - tScale.min)) * (right - left);
  const Y = (v: number) => bottom - ((v - vScale.min) / (vScale.max - vScale.min)) * (bottom - topY);
  ctx.strokeStyle = "#e3e7eb";
  ctx.lineWidth = 1;
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "#5f6b76";
  for (const t of tickValues(tScale)) {
    ctx.beginPath();
    ctx.moveTo(X(t), topY);
    ctx.lineTo(X(t), bottom);
    ctx.stroke();
    if (!hideValues) {
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatTick(t, tScale.step), X(t), bottom + 6);
    }
  }
  for (const v of tickValues(vScale)) {
    ctx.beginPath();
    ctx.moveTo(left, Y(v));
    ctx.lineTo(right, Y(v));
    ctx.stroke();
    if (!hideValues) {
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTick(v, vScale.step), left - 8, Y(v));
    }
  }
  // Axes: the time axis along v = 0.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(left, topY - 8);
  ctx.lineTo(left, bottom);
  ctx.moveTo(left, Y(0));
  ctx.lineTo(right + 8, Y(0));
  ctx.stroke();
  text(ctx, "t (s)", right, bottom + 30, "right", 14, INK);
  ctx.save();
  ctx.translate(18, (topY + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "v (m·s⁻¹), up the slope +", 0, 0, "center", 14, INK);
  ctx.restore();
  if (samples.length > 1) {
    ctx.strokeStyle = screen ? "#1565c0" : INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    samples.forEach((s, i) => (i ? ctx.lineTo(X(s.t), Y(s.v)) : ctx.moveTo(X(s.t), Y(s.v))));
    ctx.stroke();
  }
}

/** The hanging mass's starting depth, re-exported for the view's reset. */
export { hangStart };
