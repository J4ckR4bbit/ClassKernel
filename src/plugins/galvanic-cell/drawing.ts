// The picture of the cell: two beakers, their electrodes, the salt bridge and
// the wire with its voltmeter, with electrons, ions and bubbles on the move.
// buildScene() turns the chemistry into what is to be drawn; CellAnimator
// keeps the moving parts between frames and draws a frame on any canvas, so
// the saved PNG is the same picture as the screen.

import { formatNumber } from "../numbers";
import {
  Analysis,
  CellState,
  ELECTRODE_COLOURS,
  SOLUTION_TINTS,
  Side,
  Role,
  amountText,
  electrolyteById,
  ionColour,
  polarity,
  roleOf,
  termText,
  voltsText,
} from "./cell";

/** The picture's own coordinates; a canvas scales them to its size. */
export const SCENE_W = 1000;
export const SCENE_H = 620;

export type Drift = "in" | "out" | "none";

export interface IonSpec {
  formula: string;
  colour: string;
  /** Dots to draw: more for a stronger solution. */
  count: number;
  /** Towards the electrode (being used up there), away from it (being made), or neither. */
  drift: Drift;
  positive: boolean;
}

export interface SideScene {
  electrode: string;
  electrodeColour: string;
  /** 1 = as new; less for an anode that has dissolved, more for a plated cathode. */
  thickness: number;
  role: Role;
  tint: string | null;
  /** 0..1, how deep the solution's colour is. */
  tintStrength: number;
  ions: IonSpec[];
  electrodeLabel: string;
  solutionLabel: string;
  gas: boolean;
}

export interface Scene {
  left: SideScene;
  right: SideScene;
  /** What the voltmeter shows. */
  reading: string;
  saltBridge: boolean;
  electrolyte: string;
  cation: string;
  anion: string;
  temperatureLabel: string;
  anodeSide: Side;
  /** 0 (nothing moves) to 1 (a brisk current). */
  flow: number;
  /** Labels that give the answers away: anode / cathode, electron and ion directions. */
  showAnswers: boolean;
  large: boolean;
  /** Said under the voltmeter when the cell is flat or the circuit open. */
  note: string;
}

/** Dots for a concentration: 4 at 10⁻⁴ mol·dm⁻³ up to 22 at 2 mol·dm⁻³, on a log scale. */
export function ionCount(amount: number): number {
  const t = (Math.log10(Math.max(1e-4, Math.min(2, amount))) + 4) / (Math.log10(2) + 4);
  return Math.round(4 + 18 * t);
}

/**
 * The chemistry as a picture. `discharged` is how far the cell has run since
 * it was set up (mol·dm⁻³ of the net equation), for the electrodes' thickness.
 */
export function buildScene(
  state: CellState,
  a: Analysis,
  options: { showAnswers: boolean; discharged: number; motion: number },
): Scene {
  const el = electrolyteById(state.electrolyte);
  const side = (which: Side): SideScene => {
    const cell = which === a.cathodeSide ? a.cathode : a.anode;
    const role = roleOf(a, which);
    const amounts = state[which].amounts;
    const ions: IonSpec[] = [];
    for (const t of [...cell.ox, ...cell.red]) {
      if (t.phase !== "aq") continue;
      const reactantHere = role === "cathode" ? cell.ox.includes(t) : cell.red.includes(t);
      ions.push({
        formula: t.formula,
        colour: ionColour(t.formula),
        count: ionCount(amounts[t.formula] ?? 0),
        drift: a.running ? (reactantHere ? "in" : "out") : "none",
        positive: !t.formula.endsWith("⁻"),
      });
    }
    const tinted = ions.find((i) => SOLUTION_TINTS[i.formula]);
    const worn = Math.min(1, options.discharged);
    const thickness = cell.inert ? 1 : role === "anode" ? 1 - 0.45 * worn : 1 + 0.45 * worn;
    const variable = [...cell.ox, ...cell.red].filter((t) => t.phase !== "s");
    return {
      electrode: cell.electrode,
      electrodeColour: ELECTRODE_COLOURS[cell.electrode] ?? "#9aa3ad",
      thickness,
      role,
      tint: tinted ? SOLUTION_TINTS[tinted.formula] : null,
      tintStrength: tinted ? Math.sqrt(Math.min(1, (amounts[tinted.formula] ?? 0) / 1)) : 0,
      ions,
      electrodeLabel: `${cell.electrode}(s)`,
      solutionLabel: variable.map((t) => `${termText({ ...t, coef: 1 })} ${amountText(t, amounts)}`).join("   "),
      gas: variable.some((t) => t.phase === "g"),
    };
  };
  const note = !state.saltBridge
    ? "No salt bridge: the circuit is open"
    : a.flat
      ? "Flat: the reaction is at equilibrium"
      : a.polarityReversed && options.showAnswers
        ? "Polarity reversed by the concentrations"
        : "";
  return {
    left: side("left"),
    right: side("right"),
    reading: options.showAnswers ? voltsText(a.reading, 2).replace("+", "") : "?",
    saltBridge: state.saltBridge,
    electrolyte: el.formula,
    cation: el.cation,
    anion: el.anion,
    temperatureLabel: `T = ${formatNumber(state.temperature, 0)} K (${formatNumber(state.temperature - 273, 0)} °C)`,
    anodeSide: a.anodeSide,
    flow: options.showAnswers ? a.flow * options.motion : 0,
    showAnswers: options.showAnswers,
    large: state.largeElectrodes,
    note,
  };
}

// ---- Geometry ---------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

interface Layout {
  beaker: Record<Side, { x: number; y: number; w: number; h: number; solutionY: number }>;
  electrode: Record<Side, { cx: number; top: number; bottom: number; w: number }>;
  wireY: number;
  meter: Pt;
  meterR: number;
  bridge: Pt[];
  bridgeW: number;
}

const BEAKER_W = 300;
const BEAKER_TOP = 235;
const BEAKER_BOTTOM = 560;
const SOLUTION_Y = 300;

export function layoutFor(scene: Scene): Layout {
  const w = scene.large ? 44 : 24;
  const bottom = scene.large ? 540 : 520;
  return {
    beaker: {
      left: { x: 95, y: BEAKER_TOP, w: BEAKER_W, h: BEAKER_BOTTOM - BEAKER_TOP, solutionY: SOLUTION_Y },
      right: { x: 605, y: BEAKER_TOP, w: BEAKER_W, h: BEAKER_BOTTOM - BEAKER_TOP, solutionY: SOLUTION_Y },
    },
    electrode: {
      left: { cx: 230, top: 165, bottom, w: w * scene.left.thickness },
      right: { cx: 770, top: 165, bottom, w: w * scene.right.thickness },
    },
    wireY: 95,
    meter: { x: 500, y: 95 },
    meterR: 38,
    bridge: [
      { x: 350, y: 365 },
      { x: 350, y: 215 },
      { x: 362, y: 194 },
      { x: 385, y: 185 },
      { x: 615, y: 185 },
      { x: 638, y: 194 },
      { x: 650, y: 215 },
      { x: 650, y: 365 },
    ],
    bridgeW: 34,
  };
}

/** The wire from the anode's electrode to the cathode's, the way the electrons go. */
function wirePath(layout: Layout, anodeSide: Side): Pt[] {
  const cathodeSide: Side = anodeSide === "left" ? "right" : "left";
  const from = layout.electrode[anodeSide];
  const to = layout.electrode[cathodeSide];
  return [
    { x: from.cx, y: from.top },
    { x: from.cx, y: layout.wireY },
    { x: to.cx, y: layout.wireY },
    { x: to.cx, y: to.top },
  ];
}

function polylineLength(points: Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

/** The point `d` along the polyline, with the unit tangent there. */
function along(points: Pt[], d: number): { x: number; y: number; tx: number; ty: number } {
  let remaining = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (remaining <= len || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      return { x: points[i - 1].x + dx * t, y: points[i - 1].y + dy * t, tx: dx / (len || 1), ty: dy / (len || 1) };
    }
    remaining -= len;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, tx: 1, ty: 0 };
}

const wrap = (value: number, length: number) => ((value % length) + length) % length;

// ---- The moving parts -------------------------------------------------------

interface Particle {
  x: number;
  y: number;
  phase: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
}

const ELECTRONS = 16;
const BRIDGE_IONS = 5;
const ELECTRON_SPEED = 95;
const BRIDGE_SPEED = 38;
const ION_SPEED = 26;

/**
 * Keeps the electrons, ions and bubbles between frames. update() moves them
 * by the scene's flow; draw() paints a frame.
 */
export class CellAnimator {
  private electronOffset = 0;
  private bridgeOffset = 0;
  private ions: Record<Side, Map<string, Particle[]>> = { left: new Map(), right: new Map() };
  private bubbles: Record<Side, Bubble[]> = { left: [], right: [] };
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Forget the moving parts (after Reset, or a new half-cell). */
  reset(): void {
    this.ions = { left: new Map(), right: new Map() };
    this.bubbles = { left: [], right: [] };
  }

  update(seconds: number, scene: Scene): void {
    const dt = Math.min(0.1, Math.max(0, seconds));
    const layout = layoutFor(scene);
    this.electronOffset += ELECTRON_SPEED * scene.flow * dt;
    this.bridgeOffset += BRIDGE_SPEED * scene.flow * dt;
    for (const side of ["left", "right"] as Side[]) {
      this.updateIons(side, scene, layout, dt);
      this.updateBubbles(side, scene, layout, dt);
    }
  }

  private updateIons(side: Side, scene: Scene, layout: Layout, dt: number): void {
    const beaker = layout.beaker[side];
    const electrode = layout.electrode[side];
    const margin = 14;
    const minX = beaker.x + margin;
    const maxX = beaker.x + beaker.w - margin;
    const minY = beaker.solutionY + margin;
    const maxY = beaker.y + beaker.h - margin;
    const map = this.ions[side];
    const seen = new Set<string>();
    for (const spec of scene[side].ions) {
      seen.add(spec.formula);
      let list = map.get(spec.formula);
      if (!list) {
        list = [];
        map.set(spec.formula, list);
      }
      while (list.length < spec.count) list.push(this.spawn(minX, maxX, minY, maxY));
      if (list.length > spec.count) list.length = spec.count;
      const towards = spec.drift === "in" ? 1 : spec.drift === "out" ? -1 : 0;
      for (const p of list) {
        p.phase += dt * 1.7;
        // A gentle wander, and a drift to or from the electrode when the cell runs.
        p.x += Math.sin(p.phase * 1.3 + p.y * 0.05) * 6 * dt;
        p.y += Math.cos(p.phase + p.x * 0.03) * 6 * dt;
        const dx = electrode.cx - p.x;
        const direction = Math.sign(dx) || 1;
        p.x += direction * towards * ION_SPEED * scene.flow * dt * (1 + 0.3 * Math.sin(p.phase));
        const reach = electrode.w / 2 + 7;
        if (towards === 1 && Math.abs(dx) < reach && p.y < electrode.bottom + 6) {
          // Taken up at the electrode; another comes in from the far side.
          const fresh = this.spawn(minX, maxX, minY, maxY);
          p.x = this.random() < 0.5 ? minX + this.random() * 40 : maxX - this.random() * 40;
          p.y = fresh.y;
        } else if (towards === -1 && (p.x <= minX || p.x >= maxX)) {
          // Reached the wall; the next one leaves the electrode.
          const sideOf = this.random() < 0.5 ? -1 : 1;
          p.x = electrode.cx + sideOf * (reach + 2);
          p.y = minY + this.random() * (Math.min(maxY, electrode.bottom) - minY);
        }
        p.x = Math.min(maxX, Math.max(minX, p.x));
        p.y = Math.min(maxY, Math.max(minY, p.y));
      }
    }
    for (const key of [...map.keys()]) if (!seen.has(key)) map.delete(key);
  }

  private spawn(minX: number, maxX: number, minY: number, maxY: number): Particle {
    return { x: minX + this.random() * (maxX - minX), y: minY + this.random() * (maxY - minY), phase: this.random() * 6.28 };
  }

  private updateBubbles(side: Side, scene: Scene, layout: Layout, dt: number): void {
    const list = this.bubbles[side];
    if (!scene[side].gas) {
      list.length = 0;
      return;
    }
    const electrode = layout.electrode[side];
    const beaker = layout.beaker[side];
    const fresh = (): Bubble => ({
      x: electrode.cx + (this.random() < 0.5 ? -1 : 1) * (electrode.w / 2 + 3 + this.random() * 4),
      y: beaker.solutionY + 20 + this.random() * (electrode.bottom - beaker.solutionY - 20),
      r: 2 + this.random() * 3,
      speed: 25 + this.random() * 30,
    });
    while (list.length < 14) list.push(fresh());
    // Hydrogen is bubbled over the electrode all the time, current or not.
    const motion = scene.flow > 0 || scene.showAnswers ? 1 : 0;
    for (const b of list) {
      b.y -= b.speed * dt * motion * (scene.flow > 0 ? 1 : 0.6);
      b.x += Math.sin(b.y * 0.08) * 4 * dt;
      if (b.y < beaker.solutionY + 4) {
        const again = fresh();
        b.x = again.x;
        b.y = electrode.bottom - 4;
        b.r = again.r;
      }
    }
  }

  /** Paint the whole picture into a context already scaled so SCENE_W × SCENE_H fills it. */
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const layout = layoutFor(scene);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const side of ["left", "right"] as Side[]) this.drawBeaker(ctx, scene, layout, side);
    this.drawBridge(ctx, scene, layout);
    this.drawWire(ctx, scene, layout);
    this.drawMeter(ctx, scene, layout);
    this.drawLabels(ctx, scene, layout);
    ctx.restore();
  }

  private drawBeaker(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout, side: Side): void {
    const b = layout.beaker[side];
    const e = layout.electrode[side];
    const s = scene[side];
    const radius = 18;
    const glass = () => {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + b.h - radius);
      ctx.quadraticCurveTo(b.x, b.y + b.h, b.x + radius, b.y + b.h);
      ctx.lineTo(b.x + b.w - radius, b.y + b.h);
      ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w, b.y + b.h - radius);
      ctx.lineTo(b.x + b.w, b.y);
    };
    // The solution, clipped to the glass.
    ctx.save();
    glass();
    ctx.clip();
    ctx.fillStyle = s.tint ? withAlpha(s.tint, 0.1 + 0.5 * s.tintStrength) : "#e9f0f6";
    ctx.fillRect(b.x, b.solutionY, b.w, b.y + b.h - b.solutionY);
    // Ions.
    const ions = this.ions[side];
    for (const spec of s.ions) {
      for (const p of ions.get(spec.formula) ?? []) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = spec.colour;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px Roboto, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(spec.positive ? "+" : "−", p.x, p.y + 0.5);
      }
    }
    ctx.restore();
    // The electrode, over the solution.
    ctx.fillStyle = s.electrodeColour;
    ctx.fillRect(e.cx - e.w / 2, e.top, e.w, e.bottom - e.top);
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(e.cx - e.w / 2, e.top, e.w, e.bottom - e.top);
    // Bubbles on a gas electrode.
    if (s.gas) {
      ctx.save();
      glass();
      ctx.clip();
      ctx.strokeStyle = "rgba(60, 90, 120, 0.7)";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1;
      for (const bubble of this.bubbles[side]) {
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    // The glass and the surface of the solution.
    glass();
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.solutionY);
    ctx.lineTo(b.x + b.w, b.solutionY);
    ctx.strokeStyle = "rgba(59, 70, 81, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // A key to the dots, inside the beaker.
    let keyY = b.solutionY + 18;
    const keyX = side === "left" ? b.x + 14 : b.x + b.w - 14;
    for (const spec of s.ions) {
      ctx.beginPath();
      ctx.arc(side === "left" ? keyX + 7 : keyX - 7, keyY, 6, 0, Math.PI * 2);
      ctx.fillStyle = spec.colour;
      ctx.fill();
      ctx.fillStyle = "#1d2733";
      ctx.font = "13px Roboto, 'Segoe UI', sans-serif";
      ctx.textAlign = side === "left" ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${spec.formula}(aq)`, side === "left" ? keyX + 18 : keyX - 18, keyY);
      keyY += 18;
    }
  }

  private drawBridge(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout): void {
    if (!scene.saltBridge) {
      // Where it would go, so its absence is the point of the picture.
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "#b0b8c1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      layout.bridge.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      return;
    }
    const path = layout.bridge;
    const trace = () => {
      ctx.beginPath();
      path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    };
    trace();
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = layout.bridgeW + 3;
    ctx.stroke();
    trace();
    ctx.strokeStyle = "#f3f6fa";
    ctx.lineWidth = layout.bridgeW;
    ctx.stroke();
    // Porous plugs at each end.
    ctx.fillStyle = "#c9d2db";
    for (const end of [path[0], path[path.length - 1]]) ctx.fillRect(end.x - layout.bridgeW / 2, end.y - 28, layout.bridgeW, 26);
    // The electrolyte's ions on the move: cations to the cathode, anions to the anode.
    const length = polylineLength(path);
    const toRight = scene.anodeSide === "left" ? 1 : -1; // cations head this way
    const spacing = length / BRIDGE_IONS;
    for (let i = 0; i < BRIDGE_IONS; i++) {
      for (const positive of [true, false]) {
        const direction = positive ? toRight : -toRight;
        const d = wrap(i * spacing + spacing / 2 + direction * this.bridgeOffset + (positive ? 0 : spacing / 2), length);
        const at = along(path, d);
        const lane = positive ? -9 : 9;
        const x = at.x + -at.ty * lane;
        const y = at.y + at.tx * lane;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = positive ? "#5b6ee1" : "#d9772f";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px Roboto, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(positive ? "+" : "−", x, y + 0.5);
      }
    }
  }

  private drawWire(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout): void {
    const path = wirePath(layout, scene.anodeSide);
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (!scene.showAnswers) return;
    const length = polylineLength(path);
    const spacing = length / ELECTRONS;
    for (let i = 0; i < ELECTRONS; i++) {
      const at = along(path, wrap(i * spacing + this.electronOffset, length));
      ctx.beginPath();
      ctx.arc(at.x, at.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#1f4fd1";
      ctx.fill();
    }
  }

  private drawMeter(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout): void {
    const { meter, meterR } = layout;
    ctx.beginPath();
    ctx.arc(meter.x, meter.y, meterR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#1d2733";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText("V", meter.x, meter.y - 14);
    ctx.font = "bold 17px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText(scene.reading, meter.x, meter.y + 8);
  }

  private drawLabels(ctx: CanvasRenderingContext2D, scene: Scene, layout: Layout): void {
    ctx.fillStyle = "#1d2733";
    ctx.textBaseline = "middle";
    for (const side of ["left", "right"] as Side[]) {
      const e = layout.electrode[side];
      const b = layout.beaker[side];
      const s = scene[side];
      ctx.textAlign = "center";
      ctx.font = "bold 16px Roboto, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#1d2733";
      // Beside the electrode's top, clear of the wire.
      ctx.textAlign = side === "left" ? "right" : "left";
      ctx.fillText(s.electrodeLabel, side === "left" ? e.cx - e.w / 2 - 10 : e.cx + e.w / 2 + 10, e.top + 14);
      ctx.textAlign = "center";
      ctx.font = "14px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(s.solutionLabel, b.x + b.w / 2, b.y + b.h + 20);
      if (scene.showAnswers) {
        ctx.font = "bold 15px Roboto, 'Segoe UI', sans-serif";
        ctx.fillStyle = s.role === "cathode" ? "#1f6b3f" : "#9c2f1f";
        const what = s.role === "cathode" ? "reduction" : "oxidation";
        ctx.fillText(`${s.role === "cathode" ? "Cathode" : "Anode"} (${polarity(s.role)}) · ${what}`, b.x + b.w / 2, b.y + b.h + 44);
      }
    }
    // Temperature, top left.
    ctx.textAlign = "left";
    ctx.fillStyle = "#414942";
    ctx.font = "14px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText(scene.temperatureLabel, 24, 28);
    // What's wrong with the cell, if anything: top right, clear of the picture.
    if (scene.note) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#8a2f22";
      ctx.font = "bold 14px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(scene.note, SCENE_W - 24, 28);
    }
    // The salt bridge's name and, with the answers, which ion goes which way.
    if (scene.saltBridge) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#1d2733";
      ctx.font = "14px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(`Salt bridge (${scene.electrolyte})`, SCENE_W / 2, 160);
      if (scene.showAnswers) {
        const toRight = scene.anodeSide === "left";
        ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
        ctx.fillStyle = "#5b6ee1";
        ctx.fillText(toRight ? `${scene.cation} →` : `← ${scene.cation}`, SCENE_W / 2, 214);
        ctx.fillStyle = "#d9772f";
        ctx.fillText(toRight ? `← ${scene.anion}` : `${scene.anion} →`, SCENE_W / 2, 236);
      }
    }
    if (scene.showAnswers) {
      // The electrons' direction, on the top run of the wire near the anode.
      const path = wirePath(layout, scene.anodeSide);
      const at = along(path, polylineLength(path) * 0.3);
      const dir = Math.sign(at.tx) || 1;
      ctx.strokeStyle = "#1f4fd1";
      ctx.fillStyle = "#1f4fd1";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(at.x - dir * 30, at.y - 16);
      ctx.lineTo(at.x + dir * 30, at.y - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(at.x + dir * 30, at.y - 16);
      ctx.lineTo(at.x + dir * 20, at.y - 22);
      ctx.lineTo(at.x + dir * 20, at.y - 10);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = "center";
      ctx.font = "bold 14px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText("e⁻", at.x, at.y - 32);
    }
  }
}

/** "#2f86d6" with an alpha. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
