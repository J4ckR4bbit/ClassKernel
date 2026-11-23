// Drawing the photoelectric effect and the emission spectra.
//
// The apparatus is a vacuum photocell the way the papers sketch one: light
// from a source falls on a curved metal surface in an evacuated tube, and the
// photoelectrons it frees cross to a collector, returning through a
// microammeter. Photons are drawn as wave packets in the light's colour (a
// grey for UV and IR, which can't be seen); electrons as small circles.
//
// The graphs are the ones the papers ask about: Eₖ(max) against frequency
// (gradient h, x-intercept f₀, y-intercept −W₀), and Eₖ(max) and the current
// against intensity. The spectra are hydrogen's energy-level diagram, the line
// spectrum its falls make, and the lines of the common discharge tubes.

import { niceScale } from "../scale";
import { formatFixed, formatNumber } from "../numbers";
import { INK, arrow, arrowHead, line, richText, text } from "../shared/canvas";
import { drawAxes, frame, plot } from "../shared/graph";
import {
  EV,
  ElementSpectrum,
  H,
  HYDROGEN_LEVELS,
  Transition,
  band,
  colourName,
  thresholdFrequency,
  wavelengthColour,
} from "./photons";
import { ev2, levelText, sig3 } from "./memo";

export const APP_W = 1000;
export const APP_H = 500;
export const GRAPH_W = 1000;
export const GRAPH_H = 560;
export const LEVELS_W = 1000;
export const LEVELS_H = 560;
export const SPEC_W = 1000;
export const SPEC_H = 250;

const GREY = "#455a64";

// ---------- the photocell ----------

export const LAMP = { x: 152, y: 112 };
export const PLATE = { cx: 862, cy: 255, r: 120 };
export const COLLECTOR = { x: 500, top: 258, bottom: 348 };

/** Where a photon starts and lands: u from −1 to 1 across the beam. */
export function photonPath(u: number) {
  const a = Math.PI - (25 * Math.PI * u) / 180;
  return {
    from: { x: LAMP.x + 4, y: LAMP.y + 13 * u },
    to: { x: PLATE.cx + PLATE.r * Math.cos(a), y: PLATE.cy + PLATE.r * Math.sin(a) },
  };
}

export interface Photon {
  u: number;
  /** 0 at the source, 1 on the metal. */
  s: number;
}
export interface Electron {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface Flash {
  x: number;
  y: number;
  /** Seconds since it happened. */
  age: number;
}

export interface CellLook {
  screen: boolean;
  /** Hide the numbers (question mode). */
  question: boolean;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A wave packet along the direction `angle`, centred on (x, y), with a wavelength of `period` scene units. */
export function wavePacket(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, period: number, colour: string, length = 38, amp = 6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const s = -length / 2 + (length * i) / 40;
    const env = Math.sin((Math.PI * i) / 40);
    const yy = amp * env * Math.sin((2 * Math.PI * s) / period);
    if (i) ctx.lineTo(s, yy);
    else ctx.moveTo(s, yy);
  }
  ctx.stroke();
  arrowHead(ctx, length / 2 + 8, 0, 0, 8);
  ctx.restore();
}

/** The wave packet's drawn wavelength for light of this wavelength: short for UV, long for IR. */
export function packetPeriod(wavelengthNm: number): number {
  return 5 + 19 * Math.min(1, Math.max(0, (wavelengthNm - 100) / 900));
}

function electronDot(ctx: CanvasRenderingContext2D, x: number, y: number, screen: boolean, r = 6) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = screen ? "#1e88e5" : "#fff";
  ctx.fill();
  ctx.strokeStyle = screen ? "#0d47a1" : INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = screen ? "#fff" : INK;
  ctx.lineWidth = 1.6;
  line(ctx, x - r * 0.5, y, x + r * 0.5, y);
}

/**
 * The photocell, with the photons, electrons and flashes as they are now.
 * `current` is the photocurrent as a fraction of full scale (10 µA).
 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  state: { wavelength: number; intensity: number; metalName: string; workFunction: number; emitted: boolean; current: number; currentText: string },
  photons: Photon[],
  electrons: Electron[],
  flashes: Flash[],
  look: CellLook,
) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const light = look.screen ? wavelengthColour(state.wavelength) : INK;

  // The beam: a soft band from the source to the metal.
  const top = photonPath(-1);
  const bottom = photonPath(1);
  ctx.beginPath();
  ctx.moveTo(top.from.x, top.from.y);
  ctx.lineTo(top.to.x, top.to.y);
  ctx.lineTo(bottom.to.x, bottom.to.y);
  ctx.lineTo(bottom.from.x, bottom.from.y);
  ctx.closePath();
  if (look.screen) {
    ctx.globalAlpha = 0.08 + 0.17 * (state.intensity / 100);
    ctx.fillStyle = light;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = "#999";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    line(ctx, top.from.x, top.from.y, top.to.x, top.to.y);
    line(ctx, bottom.from.x, bottom.from.y, bottom.to.x, bottom.to.y);
    ctx.setLineDash([]);
  }

  // The source.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, 46, LAMP.y - 34, 100, 68, 10);
  ctx.fillStyle = look.screen ? "#cfd8dc" : "#fff";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(LAMP.x - 2, LAMP.y, 9, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.screen ? light : "#fff";
  ctx.fill();
  ctx.stroke();
  text(ctx, "light source", 96, LAMP.y + 52, "center", 15, look.screen ? GREY : INK);

  // The evacuated tube.
  roundRect(ctx, 384, 118, 556, 270, 95);
  ctx.fillStyle = look.screen ? "rgba(225, 240, 250, 0.45)" : "#fff";
  ctx.fill();
  ctx.strokeStyle = look.screen ? "#78909c" : INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  text(ctx, "vacuum", 650, 146, "center", 15, look.screen ? "#78909c" : INK);

  // The metal surface: a thick curved plate, its hollow towards the light.
  ctx.strokeStyle = look.screen ? "#8d6e63" : INK;
  ctx.lineWidth = 11;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.arc(PLATE.cx, PLATE.cy, PLATE.r + 6, (145 * Math.PI) / 180, (215 * Math.PI) / 180);
  ctx.stroke();
  ctx.lineCap = "round";
  // The collector.
  ctx.strokeStyle = look.screen ? "#607d8b" : INK;
  ctx.lineWidth = 7;
  line(ctx, COLLECTOR.x, COLLECTOR.top, COLLECTOR.x, COLLECTOR.bottom);

  // The circuit: collector → microammeter → metal.
  const plateFoot = { x: PLATE.cx + (PLATE.r + 6) * Math.cos((145 * Math.PI) / 180), y: PLATE.cy + (PLATE.r + 6) * Math.sin((145 * Math.PI) / 180) };
  const meter = { x: 660, y: 452, r: 28 };
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(COLLECTOR.x, COLLECTOR.bottom);
  ctx.lineTo(COLLECTOR.x, meter.y);
  ctx.lineTo(meter.x - meter.r, meter.y);
  ctx.moveTo(meter.x + meter.r, meter.y);
  ctx.lineTo(plateFoot.x + 4, meter.y);
  ctx.lineTo(plateFoot.x + 4, plateFoot.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(meter.x, meter.y, meter.r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();
  text(ctx, "µA", meter.x, meter.y + 12, "center", 13, INK, "700");
  ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const a = Math.PI + (k * Math.PI) / 4;
    line(ctx, meter.x + Math.cos(a) * 20, meter.y - 2 + Math.sin(a) * 20, meter.x + Math.cos(a) * 24, meter.y - 2 + Math.sin(a) * 24);
  }
  const needle = Math.PI + Math.min(1, Math.max(0, state.current)) * Math.PI;
  ctx.strokeStyle = look.screen ? "#c62828" : INK;
  ctx.lineWidth = 2;
  line(ctx, meter.x, meter.y - 2, meter.x + Math.cos(needle) * 21, meter.y - 2 + Math.sin(needle) * 21);
  if (!look.question) text(ctx, state.currentText, meter.x + 36, meter.y - 20, "left", 16, INK, "700");

  // Labels.
  const label = look.screen ? GREY : INK;
  text(ctx, "collector", COLLECTOR.x - 14, COLLECTOR.top - 16, "center", 15, label);
  const name = look.question ? `${state.metalName} surface` : `${state.metalName} surface (W₀ = ${formatNumber(state.workFunction, 2)} eV)`;
  text(ctx, name, plateFoot.x + 16, 410, "left", 14, label);
  if (!look.question) {
    const wl = `${sig3(state.wavelength)} nm (${colourName(state.wavelength)})`;
    text(ctx, wl, 300, 70, "center", 15, look.screen ? GREY : INK, "700");
  }

  // Flashes where photons were absorbed without freeing an electron.
  for (const fl of flashes) {
    const k = Math.max(0, 1 - fl.age / 0.35);
    if (k <= 0) continue;
    ctx.globalAlpha = k;
    ctx.strokeStyle = look.screen ? "#ff8f00" : INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(fl.x, fl.y, 4 + 10 * (1 - k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Photons on the way.
  const period = packetPeriod(state.wavelength);
  for (const p of photons) {
    const path = photonPath(p.u);
    const x = path.from.x + (path.to.x - path.from.x) * p.s;
    const y = path.from.y + (path.to.y - path.from.y) * p.s;
    wavePacket(ctx, x, y, Math.atan2(path.to.y - path.from.y, path.to.x - path.from.x), period, light);
  }
  for (const e of electrons) electronDot(ctx, e.x, e.y, look.screen);
  if (state.emitted && electrons.length) text(ctx, "photoelectrons", 640, 352, "center", 15, look.screen ? "#1565c0" : INK);
  if (!state.emitted && look.screen && !look.question) text(ctx, "no electrons emitted", 640, 352, "center", 16, "#c62828", "700");
}

// ---------- the graphs ----------

export type GraphKind = "ek-f" | "ek-i" | "i-i";
export type EnergyUnit = "J" | "eV";

export interface GraphLook {
  screen: boolean;
  values: boolean;
  /** Extend the line back to the energy axis (dashed), to show −W₀. */
  extend: boolean;
  /** Draw a gradient triangle and say what it gives. */
  gradient: boolean;
  question: boolean;
}

const BLUE = "#1565c0";
const RED = "#c62828";

/** Eₖ(max) in the chosen unit: ×10⁻¹⁹ J or eV. */
function inUnit(j: number, unit: EnergyUnit) {
  return unit === "J" ? j / 1e-19 : j / EV;
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  kind: GraphKind,
  s: { frequency: number; workFunction: number; intensity: number; metalName: string; compare: { name: string; workFunction: number } | null },
  unit: EnergyUnit,
  look: GraphLook,
) {
  const eUnit = unit === "J" ? "×10⁻¹⁹ J" : "eV";
  const ek = (f: number, w: number) => Math.max(0, H * f - w * EV);
  const emitted = H * s.frequency >= s.workFunction * EV * (1 - 1e-9);
  const values = look.values && !look.question;

  if (kind !== "ek-f") {
    // Against intensity, 0–100 %.
    const isCurrent = kind === "i-i";
    const yNow = isCurrent ? (emitted ? (10 * s.intensity) / 100 : 0) : inUnit(ek(s.frequency, s.workFunction), unit);
    const yMax = isCurrent ? 10 : Math.max(inUnit(ek(s.frequency, s.workFunction), unit) * 1.5, unit === "J" ? 2 : 1);
    const f = frame(96, GRAPH_W - 56, 60, GRAPH_H - 70, niceScale(0, 100, true, 5), niceScale(0, yMax, true, 5));
    drawAxes(ctx, f, { xLabel: "intensity (%)", yLabel: isCurrent ? "current (µA)" : `E_{K(max)} (${eUnit})`, values, screen: look.screen });
    const colour = look.screen ? (isCurrent ? BLUE : RED) : INK;
    const pts: Array<[number, number]> = isCurrent ? [[0, 0], [100, emitted ? 10 : 0]] : [[0, yNow], [100, yNow]];
    plot(ctx, f, pts, colour, 3);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(f.X(s.intensity), f.Y(yNow), 7, 0, Math.PI * 2);
    ctx.fill();
    const note = !emitted
      ? "f < f₀: no electrons at any intensity"
      : isCurrent
        ? "more photons a second → more electrons a second"
        : "E_{K(max)} doesn't depend on the intensity";
    richText(ctx, note, (f.left + f.right) / 2, f.top + 16, "center", 16, look.screen ? GREY : INK, "700");
    return;
  }

  // Eₖ(max) against frequency (×10¹⁴ Hz).
  const metals = [{ name: s.metalName, w: s.workFunction, colour: look.screen ? RED : INK, dash: [] as number[] }];
  if (s.compare) metals.push({ name: s.compare.name, w: s.compare.workFunction, colour: look.screen ? "#7b8b96" : "#555", dash: [10, 6] });
  const fNow = s.frequency / 1e14;
  const f0s = metals.map((m) => thresholdFrequency(m.w) / 1e14);
  const xMax = Math.max(15, fNow * 1.15, ...f0s.map((v) => v * 1.6));
  const xs = niceScale(0, xMax, true, 8);
  const yTop = Math.max(...metals.map((m) => inUnit(ek(xs.max * 1e14, m.w), unit)), unit === "J" ? 2 : 1);
  const yBottom = look.extend ? -Math.max(...metals.map((m) => inUnit(m.w * EV, unit))) * 1.12 : 0;
  const ys = niceScale(yBottom, yTop, true, 7);
  const f = frame(110, GRAPH_W - 60, 50, GRAPH_H - 56, xs, ys);
  drawAxes(ctx, f, { xLabel: "f (×10¹⁴ Hz)", yLabel: `E_{K(max)} (${eUnit})`, values, screen: look.screen });

  metals.forEach((m, i) => {
    const f0 = f0s[i];
    const v = (x: number) => inUnit(H * x * 1e14 - m.w * EV, unit);
    plot(ctx, f, [[f0, 0], [xs.max, v(xs.max)]], m.colour, i === 0 ? 3 : 2.4, m.dash);
    if (look.extend) plot(ctx, f, [[0, v(0)], [f0, 0]], m.colour, 1.6, [5, 6]);
    // The intercepts.
    ctx.fillStyle = m.colour;
    ctx.beginPath();
    ctx.arc(f.X(f0), f.Y(0), 4.5, 0, Math.PI * 2);
    ctx.fill();
    richText(ctx, values ? `f_0 = ${formatFixed(f0, 2)}` : "f_0", f.X(f0), f.Y(0) - 16 - i * 18, "center", 14, m.colour, "700");
    if (look.extend) {
      ctx.beginPath();
      ctx.arc(f.X(0), f.Y(v(0)), 4.5, 0, Math.PI * 2);
      ctx.fill();
      richText(ctx, values ? `−W_0 = ${formatFixed(v(0), 2).replace(/^-/, "−")}` : "−W_0", f.X(0) + 12, f.Y(v(0)), "left", 14, m.colour, "700");
    }
    const endY = Math.max(f.top + 10, f.Y(v(xs.max)));
    text(ctx, m.name, f.right - 6, endY + (i ? 18 : -14), "right", 15, m.colour, "700");
  });

  if (look.gradient) {
    const m = metals[0];
    const f0 = f0s[0];
    const a = f0 + (xs.max - f0) * 0.4;
    const b = f0 + (xs.max - f0) * 0.8;
    const v = (x: number) => inUnit(H * x * 1e14 - m.w * EV, unit);
    ctx.strokeStyle = look.screen ? "#2e7d32" : INK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    line(ctx, f.X(a), f.Y(v(a)), f.X(b), f.Y(v(a)));
    line(ctx, f.X(b), f.Y(v(a)), f.X(b), f.Y(v(b)));
    ctx.setLineDash([]);
    const colour = look.screen ? "#2e7d32" : INK;
    text(ctx, "Δf", (f.X(a) + f.X(b)) / 2, f.Y(v(a)) + 16, "center", 14, colour, "700");
    richText(ctx, "ΔE_{K(max)}", f.X(b) + 8, (f.Y(v(a)) + f.Y(v(b))) / 2, "left", 14, colour, "700");
    const h = unit === "J" ? "gradient = h = 6,6 × 10⁻³⁴ J·s" : "gradient = h/e = 4,13 × 10⁻¹⁵ eV·s";
    text(ctx, h, f.X(b) + 8, (f.Y(v(a)) + f.Y(v(b))) / 2 + 22, "left", 14, colour, "700");
  }

  // The light now.
  const colour = look.screen ? BLUE : INK;
  const yNow = emitted ? inUnit(ek(s.frequency, s.workFunction), unit) : 0;
  ctx.strokeStyle = look.screen ? "rgba(21,101,192,0.4)" : "#888";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  line(ctx, f.X(fNow), f.Y(0), f.X(fNow), f.Y(yNow));
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(f.X(fNow), f.Y(yNow), 7, 0, Math.PI * 2);
  if (emitted) {
    ctx.fillStyle = colour;
    ctx.fill();
  } else {
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (!look.question) {
    const label = emitted ? `${formatFixed(yNow, 2)} ${eUnit}` : "no emission";
    text(ctx, label, f.X(fNow) + 12, f.Y(yNow) - 14, "left", 14, colour, "700");
  }
}

// ---------- the energy levels ----------

/** Where each level is drawn, top to bottom fraction (0 = n = ∞, 1 = n = 1). */
const NOT_TO_SCALE = [1, 0.58, 0.4, 0.285, 0.205, 0.145];
const LEV_TOP = 70;
const LEV_BOTTOM = 500;
export const LEV_X0 = 120;
export const LEV_X1 = 560;

export function levelY(n: number, toScale: boolean): number {
  const frac = toScale ? -HYDROGEN_LEVELS[n - 1] / 13.6 : NOT_TO_SCALE[n - 1];
  return LEV_TOP + frac * (LEV_BOTTOM - LEV_TOP);
}

/** The level a tap at scene (x, y) is on, or null. */
export function levelAt(x: number, y: number, toScale: boolean): number | null {
  if (x < LEV_X0 - 70 || x > LEV_X1 + 90) return null;
  let best: number | null = null;
  let dist = 16;
  for (let n = 1; n <= HYDROGEN_LEVELS.length; n++) {
    const d = Math.abs(levelY(n, toScale) - y);
    if (d < dist) {
      dist = d;
      best = n;
    }
  }
  return best;
}

export interface LevelsLook {
  screen: boolean;
  toScale: boolean;
  energies: boolean;
  question: boolean;
}

/** x of a fall's arrow: grouped by where it ends, like the series in a textbook diagram. */
function fallX(t: { from: number; to: number }) {
  return 238 + (t.to - 1) * 92 + (t.from - t.to - 1) * 15;
}

export function drawLevels(
  ctx: CanvasRenderingContext2D,
  electron: number,
  falls: Transition[],
  last: Transition | null,
  excite: { from: number; to: number } | null,
  photonAge: number,
  look: LevelsLook,
) {
  ctx.lineCap = "round";
  const label = look.screen ? GREY : INK;
  text(ctx, look.toScale ? "Hydrogen's energy levels (to scale)" : "Hydrogen's energy levels (not to scale)", (LEV_X0 + LEV_X1) / 2, 30, "center", 16, label, "700");
  // n = ∞ (0 eV), dashed.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([8, 6]);
  line(ctx, LEV_X0, LEV_TOP, LEV_X1, LEV_TOP);
  ctx.setLineDash([]);
  text(ctx, "n = ∞", LEV_X0 - 12, LEV_TOP, "right", 15, INK);
  if (look.energies) text(ctx, "0 eV", LEV_X1 + 12, LEV_TOP, "left", 15, INK);
  for (let n = 1; n <= HYDROGEN_LEVELS.length; n++) {
    const y = levelY(n, look.toScale);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    line(ctx, LEV_X0, y, LEV_X1, y);
    text(ctx, `n = ${n}`, LEV_X0 - 12, y, "right", 15, INK, n === electron ? "700" : "400");
    if (look.energies) text(ctx, `${levelText(HYDROGEN_LEVELS[n - 1])} eV`, LEV_X1 + 12, y, "left", 15, INK);
  }
  text(ctx, "ground state", LEV_X0 + 4, levelY(1, look.toScale) + 18, "left", 13, label);

  // The falls so far, faint, each in its photon's colour; the last one bold.
  for (const t of falls) {
    if (last && t.from === last.from && t.to === last.to) continue;
    const x = fallX(t);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = look.screen ? wavelengthColour(t.wavelength) : "#777";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    arrow(ctx, x, levelY(t.from, look.toScale) + 3, x, levelY(t.to, look.toScale) - 3, 10);
    ctx.globalAlpha = 1;
  }
  if (excite) {
    const x = fallX({ from: excite.to, to: excite.from }) - 8;
    ctx.strokeStyle = look.screen ? "#6d4c41" : INK;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    arrow(ctx, x, levelY(excite.from, look.toScale) - 3, x, levelY(excite.to, look.toScale) + 3, 11);
    ctx.setLineDash([]);
    text(ctx, "energy absorbed", x + 10, (levelY(excite.from, look.toScale) + levelY(excite.to, look.toScale)) / 2, "left", 13, ctx.fillStyle as string);
  }
  if (last) {
    const x = fallX(last);
    const y1 = levelY(last.from, look.toScale);
    const y2 = levelY(last.to, look.toScale);
    const colour = look.screen ? wavelengthColour(last.wavelength) : INK;
    ctx.strokeStyle = look.screen ? "#263238" : INK;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    arrow(ctx, x, y1 + 3, x, y2 - 3, 13);
    // The photon leaves to the right, then stays as a label.
    const mid = (y1 + y2) / 2;
    const go = Math.min(1, photonAge / 0.9);
    const px = x + 40 + go * (720 - x - 40);
    ctx.strokeStyle = look.screen ? "rgba(0,0,0,0.25)" : "#bbb";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    line(ctx, x + 6, mid, px - 24, mid);
    ctx.setLineDash([]);
    wavePacket(ctx, px, mid, 0, packetPeriod(last.wavelength), colour, 46, 8);
    if (go >= 1 && !look.question) {
      text(ctx, `${ev2(last.energyEv)} eV photon`, px + 68, mid - 14, "left", 16, INK, "700");
      text(ctx, `${sig3(last.wavelength)} nm · ${colourName(last.wavelength)}`, px + 68, mid + 10, "left", 15, look.screen ? GREY : INK);
    }
  }

  // The electron on its level.
  const ey = levelY(electron, look.toScale);
  ctx.beginPath();
  ctx.arc(180, ey - 11, 9, 0, Math.PI * 2);
  ctx.fillStyle = look.screen ? "#1e88e5" : INK;
  ctx.fill();
  text(ctx, "e⁻", 180, ey - 30, "center", 13, look.screen ? "#1565c0" : INK, "700");
  if (look.screen) text(ctx, "Tap a level: above the electron to excite it, below to make it fall", (LEV_X0 + LEV_X1) / 2 + 40, LEVELS_H - 24, "center", 14, "#78909c");
}

// ---------- the spectra ----------

const VIS_MIN = 380;
const VIS_MAX = 750;

/** A strip of the visible spectrum with lines at these wavelengths (and brightnesses 0–1). */
function strip(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, h: number, lines: Array<[number, number]>, look: { screen: boolean }, ticks: boolean) {
  const X = (l: number) => x0 + ((l - VIS_MIN) / (VIS_MAX - VIS_MIN)) * (x1 - x0);
  ctx.fillStyle = look.screen ? "#111" : "#fff";
  ctx.fillRect(x0, y0, x1 - x0, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, y0, x1 - x0, h);
  for (const [l, s] of lines) {
    if (l < VIS_MIN || l > VIS_MAX) continue;
    ctx.globalAlpha = look.screen ? Math.min(1, 0.35 + 0.65 * s) : 1;
    ctx.strokeStyle = look.screen ? wavelengthColour(l) : INK;
    ctx.lineWidth = look.screen ? 3 + 2 * s : 2;
    line(ctx, X(l), y0 + 1, X(l), y0 + h - 1);
    ctx.globalAlpha = 1;
  }
  if (ticks) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    for (let l = 400; l <= 750; l += 50) {
      line(ctx, X(l), y0 + h, X(l), y0 + h + 6);
      text(ctx, `${l}`, X(l), y0 + h + 17, "center", 12, "#5f6b76");
    }
    text(ctx, "λ (nm)", x1, y0 + h + 34, "right", 13, INK);
  }
}

/** The hydrogen spectrum the falls so far have made: the visible strip, and the whole range from UV to IR. */
export function drawHydrogenSpectrum(ctx: CanvasRenderingContext2D, counts: Array<{ t: Transition; n: number }>, look: { screen: boolean }) {
  const label = look.screen ? GREY : INK;
  text(ctx, "What a spectroscope shows: the visible lines", 40, 22, "left", 15, label, "700");
  const max = Math.max(1, ...counts.map((c) => c.n));
  strip(ctx, 40, SPEC_W - 40, 38, 58, counts.map((c) => [c.t.wavelength, c.n / max]), look, true);

  // The whole range on a log scale: where the invisible lines are.
  const y0 = 170;
  const x0 = 40;
  const x1 = SPEC_W - 40;
  const lo = Math.log10(80);
  const hi = Math.log10(2000);
  const X = (l: number) => x0 + ((Math.log10(l) - lo) / (hi - lo)) * (x1 - x0);
  text(ctx, "All the lines, ultraviolet to infrared (log scale)", 40, y0 - 18, "left", 15, label, "700");
  const regions: Array<[number, number, string, string]> = [
    [80, 400, "ultraviolet", "#ede7f6"],
    [400, 700, "visible", "#fffde7"],
    [700, 2000, "infrared", "#efebe9"],
  ];
  for (const [a, b, name, fill] of regions) {
    ctx.fillStyle = look.screen ? fill : "#fff";
    ctx.fillRect(X(a), y0, X(b) - X(a), 34);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(X(a), y0, X(b) - X(a), 34);
    text(ctx, name, (X(a) + X(b)) / 2, y0 + 50, "center", 12, label);
  }
  for (const c of counts) {
    const l = c.t.wavelength;
    ctx.strokeStyle = look.screen ? (band(l) === "visible" ? wavelengthColour(l) : "#546e7a") : INK;
    ctx.lineWidth = 2.5;
    line(ctx, X(l), y0 + 2, X(l), y0 + 32);
  }
  ctx.strokeStyle = INK;
  for (const l of [100, 200, 500, 1000, 2000]) {
    line(ctx, X(l), y0 + 34, X(l), y0 + 39);
    text(ctx, formatNumber(l, 0), X(l), y0 + 66, "center", 11, "#5f6b76");
  }
}

export function fingerprintsHeight(rows: number): number {
  return 46 + rows * 66 + 24;
}

/** The discharge tubes' line spectra, one strip each; a hidden one is named "?". */
export function drawFingerprints(ctx: CanvasRenderingContext2D, rows: Array<{ el: ElementSpectrum; hidden: boolean }>, look: { screen: boolean }) {
  const label = look.screen ? GREY : INK;
  text(ctx, "Each element's own lines: its emission spectrum", 40, 22, "left", 15, label, "700");
  rows.forEach(({ el, hidden }, i) => {
    const y = 46 + i * 66;
    // The tube, glowing.
    ctx.beginPath();
    ctx.moveTo(52, y + 8);
    ctx.arcTo(160, y + 8, 160, y + 40, 12);
    ctx.arcTo(160, y + 40, 40, y + 40, 12);
    ctx.arcTo(40, y + 40, 40, y + 8, 12);
    ctx.arcTo(40, y + 8, 160, y + 8, 12);
    ctx.closePath();
    ctx.fillStyle = look.screen ? (hidden ? "#9e9e9e" : el.glow) : "#fff";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, hidden ? "?" : el.name, 100, y + 24, "center", 14, look.screen ? "#212121" : INK, "700");
    strip(ctx, 190, SPEC_W - 40, y + 4, 40, el.lines, look, i === rows.length - 1);
  });
}
