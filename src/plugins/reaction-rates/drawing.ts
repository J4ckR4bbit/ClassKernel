// Drawing the reaction: the beaker of acid with the metal at the bottom, the
// particles (each with its reactive end, glowing when it has at least Eₐ),
// the collisions as they happen, and the bubbles of gas; then the two graphs —
// the Maxwell–Boltzmann distribution with Eₐ and the shaded area beyond it,
// and the gas formed against time.

import { niceScale } from "../scale";
import { INK, line, richText, text } from "../shared/canvas";
import { drawAxes, frame, plot } from "../shared/graph";
import { ATOM_R, BOX, EA, EA_CATALYSED, PARTICLE_R, Sim, Surface, activationEnergy, kT, limiting, mbDensity } from "./rates";

export const SCENE_W = 1000;
export const SCENE_H = 480;
export const GRAPHS_W = 1000;
export const GRAPHS_H = 440;

const OX = 40;
const OY = 50;
const GREY = "#455a64";
const COL = { particle: "#1e88e5", end: "#d32f2f", glow: "rgba(255, 213, 79, 0.75)", atom: "#9e9e9e", hit: "#fbc02d", energy: "#78909c", orient: "#8e24aa", bubble: "#0288d1" };

export interface SceneLook {
  screen: boolean;
}

function particle(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, hot: boolean, look: SceneLook) {
  if (hot) {
    ctx.beginPath();
    ctx.arc(x, y, PARTICLE_R + 5, 0, Math.PI * 2);
    ctx.fillStyle = look.screen ? COL.glow : "#ddd";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, PARTICLE_R, 0, Math.PI * 2);
  ctx.fillStyle = look.screen ? COL.particle : "#fff";
  ctx.fill();
  // The reactive end: the half that faces `angle`.
  ctx.beginPath();
  ctx.arc(x, y, PARTICLE_R, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = look.screen ? COL.end : "#555";
  ctx.fill();
  ctx.strokeStyle = look.screen ? "#0d47a1" : INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, PARTICLE_R, 0, Math.PI * 2);
  ctx.stroke();
}

function atom(ctx: CanvasRenderingContext2D, x: number, y: number, look: SceneLook) {
  ctx.beginPath();
  ctx.arc(x, y, ATOM_R, 0, Math.PI * 2);
  ctx.fillStyle = look.screen ? COL.atom : "#fff";
  ctx.fill();
  ctx.strokeStyle = look.screen ? "#616161" : INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function burst(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(ctx, x + Math.cos(a) * 5, y + Math.sin(a) * 5, x + Math.cos(a) * (8 + 12 * k), y + Math.sin(a) * (8 + 12 * k));
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, 5 + 8 * k, 0, Math.PI * 2);
  ctx.stroke();
}

/** The beaker as it is now, with a key on the right. */
export function drawScene(ctx: CanvasRenderingContext2D, sim: Sim, look: SceneLook) {
  ctx.lineCap = "round";
  // The solution and the beaker.
  ctx.fillStyle = look.screen ? "#e3f2fd" : "#fff";
  ctx.fillRect(OX, OY, BOX.w, BOX.h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(OX - 2, OY - 26);
  ctx.lineTo(OX - 2, OY + BOX.h + 2);
  ctx.lineTo(OX + BOX.w + 2, OY + BOX.h + 2);
  ctx.lineTo(OX + BOX.w + 2, OY - 26);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = look.screen ? "#90caf9" : "#999";
  line(ctx, OX, OY, OX + BOX.w, OY);
  text(ctx, "acid solution", OX + 10, OY + 16, "left", 14, look.screen ? "#1565c0" : INK, "700");

  const ea = activationEnergy(sim.params);
  for (const a of sim.atoms) if (a.alive) atom(ctx, OX + a.x, OY + a.y, look);
  for (const ion of sim.ions) {
    const k = 1 - (sim.t - ion.t) / 1.6;
    ctx.globalAlpha = Math.max(0, k);
    ctx.beginPath();
    ctx.arc(OX + ion.x, OY + ion.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = look.screen ? "#757575" : "#999";
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const p of sim.particles) particle(ctx, OX + p.x, OY + p.y, p.angle, p.ke >= ea, look);
  for (const h of sim.hits) {
    const k = Math.max(0, 1 - (sim.t - h.t) / 0.5);
    ctx.globalAlpha = k;
    if (h.kind === "effective") burst(ctx, OX + h.x, OY + h.y, 1 - k, look.screen ? COL.hit : INK);
    else ring(ctx, OX + h.x, OY + h.y, 1 - k, look.screen ? (h.kind === "energy" ? COL.energy : COL.orient) : "#777");
    ctx.globalAlpha = 1;
  }
  for (const b of sim.bubbles) {
    if (b.y < -OY + 10) continue;
    ctx.beginPath();
    ctx.arc(OX + b.x, OY + Math.max(0, b.y), 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = look.screen ? COL.bubble : INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  text(ctx, "metal", OX + BOX.w - 10, OY + BOX.h - 170, "right", 14, look.screen ? "#616161" : INK, "700");

  // The key.
  const kx = OX + BOX.w + 34;
  let ky = OY + 10;
  const label = (s: string, dy = 0) => richText(ctx, s, kx + 30, ky + dy, "left", 14, look.screen ? GREY : INK);
  text(ctx, "Key", kx, ky - 4, "left", 15, INK, "700");
  ky += 28;
  particle(ctx, kx + 10, ky, 0, false, look);
  label("acid particle; its red");
  label("half is the reactive end", 17);
  ky += 44;
  particle(ctx, kx + 10, ky, 0, true, look);
  label("E_k ≥ E_a: enough energy");
  ky += 34;
  atom(ctx, kx + 10, ky, look);
  label("metal atom");
  ky += 34;
  burst(ctx, kx + 10, ky, 0.7, look.screen ? COL.hit : INK);
  label("effective collision:");
  label("the metal reacts, gas forms", 17);
  ky += 44;
  ring(ctx, kx + 10, ky, 0.5, look.screen ? COL.energy : "#777");
  label("bounces off: not");
  label("enough energy", 17);
  ky += 44;
  ring(ctx, kx + 10, ky, 0.5, look.screen ? COL.orient : "#777");
  label("bounces off: enough");
  label("energy, wrong way round", 17);
  ky += 44;
  ctx.beginPath();
  ctx.arc(kx + 10, ky, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = look.screen ? COL.bubble : INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  label("bubble of gas");
  text(ctx, `t = ${sim.t.toFixed(1).replace(".", ",")} s`, OX + BOX.w, OY - 16, "right", 15, look.screen ? GREY : INK);
}

// ---------- the graphs ----------

export interface Held {
  label: string;
  gas: Array<[number, number]>;
  temperature: number;
  concentration: number;
  surface: Surface;
  particles: number;
  catalyst: boolean;
}

export interface GraphLook {
  screen: boolean;
  values: boolean;
  histogram: boolean;
  /** Hide the final amount (question mode). */
  question: boolean;
}

/** The Maxwell–Boltzmann curve (left) and the gas formed against time (right). */
export function drawGraphs(ctx: CanvasRenderingContext2D, sim: Sim, held: Held | null, look: GraphLook) {
  // The curve is for the experiment's conditions — the acid it started with — so two runs compare fairly;
  // the bars are the particles in the beaker now, fewer as the acid is used up.
  const n = sim.startAcid;
  const t = kT(sim.params.temperature);
  const ea = activationEnergy(sim.params);
  const eMax = 8;
  const curve = (count: number, temp: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 160; i++) {
      const E = (eMax * i) / 160;
      pts.push([E, count * mbDensity(E, temp)]);
    }
    return pts;
  };
  const now = curve(n, t);
  const old = held ? curve(held.particles, kT(held.temperature)) : null;
  // The histogram of the box's particles, per unit energy, to sit on the curve.
  const bin = 0.5;
  const bins = new Array(Math.ceil(eMax / bin)).fill(0);
  for (const p of sim.particles) if (p.ke < eMax) bins[Math.floor(p.ke / bin)]++;
  const yTop = Math.max(...now.map((p) => p[1]), ...(old ?? []).map((p) => p[1]), ...(look.histogram ? bins.map((b) => b / bin) : []), 1) * 1.15;
  const f = frame(60, 470, 50, GRAPHS_H - 70, { min: 0, max: eMax, step: 1 }, { min: 0, max: yTop, step: yTop / 4 });
  drawAxes(ctx, f, { xLabel: "kinetic energy, E_k", yLabel: "number of particles", values: false, screen: look.screen });
  text(ctx, "Maxwell–Boltzmann distribution", (f.left + f.right) / 2, 18, "center", 15, look.screen ? GREY : INK, "700");
  if (look.histogram) {
    ctx.fillStyle = look.screen ? "rgba(30, 136, 229, 0.16)" : "rgba(0,0,0,0.08)";
    bins.forEach((b, i) => {
      if (!b) return;
      const x0 = f.X(i * bin);
      const x1 = f.X((i + 1) * bin);
      ctx.fillRect(x0 + 1, f.Y(b / bin), x1 - x0 - 2, f.Y(0) - f.Y(b / bin));
    });
  }
  // Shade the particles with at least Eₐ.
  const tail = now.filter(([E]) => E >= ea);
  if (tail.length) {
    ctx.beginPath();
    ctx.moveTo(f.X(ea), f.Y(0));
    ctx.lineTo(f.X(ea), f.Y(n * mbDensity(ea, t)));
    tail.forEach(([E, y]) => ctx.lineTo(f.X(E), f.Y(y)));
    ctx.lineTo(f.X(eMax), f.Y(0));
    ctx.closePath();
    ctx.fillStyle = look.screen ? "rgba(255, 179, 0, 0.45)" : "rgba(0,0,0,0.18)";
    ctx.fill();
  }
  if (old) plot(ctx, f, old, look.screen ? "#90a4ae" : "#777", 2.2, [7, 5]);
  plot(ctx, f, now, look.screen ? "#c62828" : INK, 2.8);
  // Eₐ — and with a catalyst, the lower Eₐ of its pathway.
  const eaLine = (E: number, label: string, dashed: boolean) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dashed ? [5, 5] : []);
    line(ctx, f.X(E), f.Y(0), f.X(E), f.top + 8);
    ctx.setLineDash([]);
    richText(ctx, label, f.X(E) + 4, f.top + 6, "left", 14, INK, "700");
  };
  if (sim.params.catalyst) {
    eaLine(EA, "E_a", true);
    eaLine(EA_CATALYSED, "E_a (catalysed)", false);
  } else eaLine(EA, "E_a", false);
  // Notes down the right, clear of the Eₐ line.
  const notes: Array<[string, string]> = [["shaded: E_k ≥ E_a", look.screen ? "#e65100" : INK]];
  if (look.histogram) notes.push(["bars: the beaker now", look.screen ? "#1e88e5" : INK]);
  if (held) notes.push(["dashed: the kept run", look.screen ? "#78909c" : "#555"]);
  notes.forEach(([note, colour], i) => richText(ctx, note, f.X(eMax) - 4, f.top + 70 + i * 20, "right", 13, colour, "700"));

  // Gas formed against time.
  const finalGas = limiting(sim.params).finalGas;
  const tMax = Math.max(30, sim.t, held ? held.gas[held.gas.length - 1][0] : 0);
  const gMax = Math.max(finalGas, held ? held.gas[held.gas.length - 1][1] : 0, 10) * 1.12;
  const g = frame(590, GRAPHS_W - 50, 50, GRAPHS_H - 70, niceScale(0, tMax, true, 6), niceScale(0, gMax, true, 5));
  drawAxes(ctx, g, { xLabel: "t (s)", yLabel: "gas formed (bubbles)", values: look.values, screen: look.screen });
  text(ctx, "Gas formed against time", (g.left + g.right) / 2, 18, "center", 15, look.screen ? GREY : INK, "700");
  if (!look.question) {
    ctx.strokeStyle = look.screen ? "#9e9e9e" : "#999";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    line(ctx, g.left, g.Y(finalGas), g.right, g.Y(finalGas));
    ctx.setLineDash([]);
    text(ctx, `when the ${limiting(sim.params).reagent} runs out`, g.right - 4, g.Y(finalGas) - 10, "right", 12, look.screen ? "#757575" : INK);
  }
  if (held) plot(ctx, g, held.gas, look.screen ? "#90a4ae" : "#777", 2.2, [7, 5]);
  plot(ctx, g, sim.gas, look.screen ? "#2e7d32" : INK, 2.8);
}
