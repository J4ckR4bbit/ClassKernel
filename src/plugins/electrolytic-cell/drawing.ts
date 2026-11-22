// The picture of the electrolytic cell: a DC supply and an ammeter, one
// beaker with its two electrodes, and the electrons, ions, bubbles, plated
// metal and sludge on the move. buildScene() turns the chemistry into what is
// to be drawn; CellAnimator keeps the moving parts between frames and draws a
// frame on any canvas, so a saved PNG is the same picture as the screen.

import { formatFixed } from "../numbers";
import {
  Analysis,
  Material,
  METALS,
  Progress,
  Setup,
  VOLUME,
  concentrationOf,
  electrolyteById,
  mainMetal,
  oxidationText,
  productsOf,
  reductionText,
  three,
  timeText,
  ANODE_MASS,
  GONE,
} from "./electrolysis";

/** The picture's own coordinates; a canvas scales them to its size. */
export const SCENE_W = 1000;
export const SCENE_H = 660;

type Role = "anode" | "cathode";

export interface IonSpec {
  formula: string;
  colour: string;
  count: number;
  /** Cations head for the cathode, anions for the anode. */
  target: Role;
  /** Taken up at that electrode (a spectator only gathers round it). */
  discharged: boolean;
  /** Made at an electrode: new ones appear there. */
  bornAt: Role | null;
  positive: boolean;
  /** Kept on its own side of a membrane. */
  confined: Role | null;
}

export interface ElectrodeScene {
  material: Material;
  label: string;
  /** 0..1 of the part under the solution still there (an anode dissolving). */
  remaining: number;
  /** Metal deposited on it. */
  coat: { colour: string; grams: number } | null;
  /** The gas given off here, if any. */
  gas: { formula: string; colour: string } | null;
  roleLabel: string;
  halfReaction: string;
}

export interface Scene {
  anode: ElectrodeScene;
  cathode: ElectrodeScene;
  molten: boolean;
  /** The solution's own colour (Cu²⁺ blue, Ni²⁺ green), and how deep. */
  tint: string | null;
  tintStrength: number;
  /** 0..1, the brown of iodine round the anode. */
  iodine: number;
  /** 0..1, a haze of chlorine or bromine over the anode. */
  haze: { colour: string; strength: number } | null;
  ions: IonSpec[];
  /** What the ammeter shows. */
  current: string;
  /** 0 (nothing moves) to about 1,5 (a big current). */
  flow: number;
  showAnswers: boolean;
  electrolyteLabel: string;
  conditionLabel: string;
  timeLabel: string;
  membrane: boolean;
  /** Gas collected over each electrode (cm³), on one scale. */
  tubes: { anode: number; cathode: number; capacity: number } | null;
  /** Grams of sludge under the anode. */
  sludge: number;
  /** A metal made liquid in a melt: sodium floats, lead sinks. */
  liquidMetal: { grams: number; colour: string; sinks: boolean } | null;
  /** What has been made so far, for the corner of the picture. */
  made: string[];
  note: string;
}

const ION_COLOURS: Record<string, string> = {
  "Cu²⁺": "#2f86d6",
  "Cl⁻": "#3fa34d",
  "SO₄²⁻": "#d9772f",
  "Na⁺": "#7b61c9",
  "K⁺": "#a05cb8",
  "I⁻": "#8a5a1c",
  "H⁺": "#d23b3b",
  "OH⁻": "#2a9d8f",
  "Ag⁺": "#7d8a99",
  "NO₃⁻": "#c58b2c",
  "Ni²⁺": "#3ea35a",
  "Zn²⁺": "#56616d",
  "Fe²⁺": "#8fb87d",
  "Pb²⁺": "#5e6670",
  "Br⁻": "#b5651d",
  "Au³⁺": "#c9a227",
};

const TINTS: Record<string, string> = { "Cu²⁺": "#2f86d6", "Ni²⁺": "#3ea35a" };

const GAS_COLOURS: Record<string, string> = { "H₂": "#ffffff", "O₂": "#ffffff", "Cl₂": "#e2f1a6", "Br₂": "#c47a3a" };

const MELT_COLOURS: Record<string, string> = { "nacl-l": "#f4dca6", "pbbr2-l": "#efe0b0" };

/** Dots for a concentration: about 16 at 1 mol·dm⁻³, never more than 26, none once it's gone. */
export function ionCount(concentration: number): number {
  if (concentration < 1e-4) return 0;
  return Math.max(1, Math.min(26, Math.round(22 * Math.sqrt(concentration / 2))));
}

/** "2,00 A". */
export function ampsText(amperes: number): string {
  return `${formatFixed(amperes, 2)} A`;
}

/**
 * The chemistry as a picture. `running` is whether the supply is on: nothing
 * moves while it is off, and question mode hides which way things go.
 */
export function buildScene(
  setup: Setup,
  progress: Progress,
  a: Analysis,
  options: { showAnswers: boolean; running: boolean; amperes: number },
): Scene {
  const el = electrolyteById(setup.electrolyte);
  const molten = el.molten;
  const products = productsOf(setup, progress);

  const discharged = new Set<string>();
  for (const t of a.cathode.couple.ox) discharged.add(t.formula);
  for (const t of a.anode.couple.red) discharged.add(t.formula);
  const bornAt = new Map<string, Role>();
  for (const t of a.cathode.couple.red) if (t.phase === "aq") bornAt.set(t.formula, "cathode");
  for (const t of a.anode.couple.ox) if (t.phase === "aq") bornAt.set(t.formula, "anode");
  if (a.anode.electrode) {
    for (const metal of Object.keys(a.anodeMaterial.composition)) bornAt.set(METALS[metal].ion, "anode");
  }

  const ions: IonSpec[] = [];
  for (const [formula, amount] of Object.entries(progress.moles)) {
    if (amount <= GONE || formula === "I₂") continue;
    const positive = formula.endsWith("⁺");
    const count = molten ? 18 : ionCount(amount / VOLUME);
    if (count === 0) continue;
    const target: Role = positive ? "cathode" : "anode";
    ions.push({
      formula,
      colour: ION_COLOURS[formula] ?? "#6b7a8c",
      count,
      target,
      discharged: discharged.has(formula),
      bornAt: bornAt.get(formula) ?? null,
      positive,
      // A membrane passes the cations; the anions stay where they are.
      confined: setup.membrane && !positive ? (formula === "OH⁻" ? "cathode" : "anode") : null,
    });
  }

  const tinted = Object.keys(TINTS).find((ion) => (progress.moles[ion] ?? 0) > GONE);
  const iodine = Math.min(0.75, concentrationOf(progress, "I₂") * 3);

  const gasOf = (role: Role) => {
    const couple = role === "cathode" ? a.cathode.couple : a.anode.couple;
    const made = role === "cathode" ? couple.red : couple.ox;
    const gas = made.find((t) => t.phase === "g" || (molten && t.formula === "Br₂"));
    return gas ? { formula: gas.formula, colour: GAS_COLOURS[gas.formula] ?? "#ffffff" } : null;
  };

  const anodeMain = mainMetal(a.anodeMaterial);
  const plated = Object.entries(progress.plated).filter(([, grams]) => grams > 1e-6);
  const platedGrams = plated.reduce((sum, [, grams]) => sum + grams, 0);
  const platedColour = plated.length ? METALS[plated.sort((x, y) => y[1] - x[1])[0][0]]?.colour ?? "#999" : null;

  const roleWords = (role: Role) =>
    options.showAnswers ? (role === "anode" ? "Anode (+) · oxidation" : "Cathode (−) · reduction") : role === "anode" ? "(+)" : "(−)";

  const anode: ElectrodeScene = {
    material: a.anodeMaterial,
    label: `${a.anodeMaterial.symbol}(s)${a.anodeMaterial.id === "cu-impure" ? ", impure" : ""}`,
    remaining: a.anodeMaterial.inert ? 1 : Math.max(0, progress.anodeLeft / ANODE_MASS),
    coat: null,
    gas: gasOf("anode"),
    roleLabel: roleWords("anode"),
    halfReaction: options.showAnswers ? oxidationText(a.anode.couple, molten) : "",
  };
  const cathode: ElectrodeScene = {
    material: a.cathodeMaterial,
    label: `${a.cathodeMaterial.symbol}(s)${a.cathodeMaterial.shape === "spoon" ? " spoon" : ""}`,
    remaining: 1,
    coat: !molten && platedColour ? { colour: platedColour, grams: platedGrams } : null,
    gas: gasOf("cathode"),
    roleLabel: roleWords("cathode"),
    halfReaction: options.showAnswers ? reductionText(a.cathode.couple, molten) : "",
  };

  const gasVolume = (role: Role) =>
    products.filter((p) => p.role === role && p.volume !== null).reduce((sum, p) => sum + (p.volume ?? 0) * 1000, 0);
  let tubes: Scene["tubes"] = null;
  if (setup.collectGas && !molten) {
    const anodeVolume = gasVolume("anode");
    const cathodeVolume = gasVolume("cathode");
    tubes = { anode: anodeVolume, cathode: cathodeVolume, capacity: niceCeiling(Math.max(20, 1.25 * Math.max(anodeVolume, cathodeVolume))) };
  }

  let haze: Scene["haze"] = null;
  const hazeGas = products.find((p) => p.role === "anode" && (p.formula === "Cl₂" || p.formula === "Br₂"));
  if (hazeGas && !setup.collectGas) haze = { colour: GAS_COLOURS[hazeGas.formula], strength: Math.min(1, hazeGas.moles * 40) };

  let liquidMetal: Scene["liquidMetal"] = null;
  if (molten && platedColour) liquidMetal = { grams: platedGrams, colour: platedColour, sinks: !plated.some(([m]) => m === "Na" || m === "K") };

  const made: string[] = [];
  if (options.showAnswers && progress.charge > 0) {
    made.push(`Q = ${three(progress.charge)} C`);
    for (const p of products) {
      if (p.dissolved) made.push(`${p.formula} anode: −${three(p.grams)} g`);
      else if (p.volume !== null) made.push(`${p.formula}: ${three(p.volume)} dm³`);
      else if (p.grams > 0) made.push(`${p.formula}: ${three(p.grams)} g`);
      else made.push(`${p.formula}: ${three(p.moles)} mol`);
    }
    const sludge = Object.values(progress.sludge).reduce((x, y) => x + y, 0);
    if (sludge > 0) made.push(`Sludge: ${three(sludge)} g`);
  }

  const note =
    progress.stopped === "anode-gone"
      ? "The anode has dissolved: the circuit is broken"
      : anodeMain && !a.anode.electrode && !a.anodeMaterial.inert && options.showAnswers
        ? `The ${a.anodeMaterial.symbol} anode is not oxidised here`
        : "";

  return {
    anode,
    cathode,
    molten,
    tint: molten ? MELT_COLOURS[el.id] ?? "#f2dca8" : tinted ? TINTS[tinted] : null,
    tintStrength: molten ? 1 : tinted ? Math.sqrt(Math.min(1, concentrationOf(progress, tinted))) : 0,
    iodine,
    haze,
    ions,
    current: ampsText(options.amperes),
    flow: options.running && !progress.stopped ? Math.min(1.6, Math.max(0.35, options.amperes / 2)) : 0,
    showAnswers: options.showAnswers,
    electrolyteLabel: molten
      ? `Electrolyte: ${el.formula}(l), molten`
      : `Electrolyte: ${el.formula}(aq), ${formatFixed(setup.concentration, 2)} mol·dm⁻³`,
    conditionLabel: molten ? `Heated to ${el.temperature}` : "250 cm³ of solution",
    timeLabel: `t = ${timeText(progress.time)}`,
    membrane: setup.membrane && !molten,
    tubes,
    sludge: Object.values(progress.sludge).reduce((x, y) => x + y, 0),
    liquidMetal,
    made,
    note,
  };
}

/** 20, 50, 100, 200, 500 … */
function niceCeiling(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

// ---- Geometry ---------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

const BEAKER = { x: 190, y: 240, w: 620, h: 350, solutionY: 290 };
const ELECTRODE_X: Record<Role, number> = { anode: 340, cathode: 660 };
const ELECTRODE_TOP = 190;
const ELECTRODE_BOTTOM = 520;
const ELECTRODE_W = 26;
const SUPPLY = { x: 440, y: 40, w: 120, h: 56 };
const WIRE_Y = 68;
const METER = { x: 660, y: 128, r: 28 };
const TUBE = { halfWidth: 30, top: 205, bottom: 470 };

/** The anode's wire runs up to the + terminal; the cathode's from the − terminal down. Electrons go along each. */
function wirePath(role: Role): Pt[] {
  return role === "anode"
    ? [
        { x: ELECTRODE_X.anode, y: ELECTRODE_TOP },
        { x: ELECTRODE_X.anode, y: WIRE_Y },
        { x: SUPPLY.x, y: WIRE_Y },
      ]
    : [
        { x: SUPPLY.x + SUPPLY.w, y: WIRE_Y },
        { x: ELECTRODE_X.cathode, y: WIRE_Y },
        { x: ELECTRODE_X.cathode, y: ELECTRODE_TOP },
      ];
}

function polylineLength(points: Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

function along(points: Pt[], d: number): Pt {
  let remaining = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (remaining <= len || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, remaining / len);
      return { x: points[i - 1].x + dx * t, y: points[i - 1].y + dy * t };
    }
    remaining -= len;
  }
  return points[points.length - 1];
}

const wrap = (value: number, length: number) => ((value % length) + length) % length;

/** How far the solution reaches up a gas tube: gas fills it from the top. */
function tubeGasLevel(scene: Scene, role: Role): number | null {
  if (!scene.tubes) return null;
  const volume = role === "anode" ? scene.tubes.anode : scene.tubes.cathode;
  const fraction = Math.min(1, volume / scene.tubes.capacity);
  return TUBE.top + fraction * (TUBE.bottom - TUBE.top);
}

/** The x range an ion may wander in. */
function ionBounds(spec: IonSpec, scene: Scene): { minX: number; maxX: number; minY: number; maxY: number } {
  const margin = 14;
  let minX = BEAKER.x + margin;
  let maxX = BEAKER.x + BEAKER.w - margin;
  if (scene.membrane && spec.confined === "anode") maxX = SCENE_W / 2 - 8;
  if (scene.membrane && spec.confined === "cathode") minX = SCENE_W / 2 + 8;
  return { minX, maxX, minY: BEAKER.solutionY + margin, maxY: BEAKER.y + BEAKER.h - margin };
}

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

const ELECTRONS_PER_WIRE = 8;
const ELECTRON_SPEED = 90;
const ION_SPEED = 30;

/**
 * Keeps the electrons, ions and bubbles between frames. update() moves them
 * on by the scene's flow; draw() paints a frame.
 */
export class CellAnimator {
  private electronOffset = 0;
  private ions = new Map<string, Particle[]>();
  private bubbles: Record<Role, Bubble[]> = { anode: [], cathode: [] };
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Forget the moving parts (a new set-up, or Reset). */
  reset(): void {
    this.ions = new Map();
    this.bubbles = { anode: [], cathode: [] };
  }

  update(seconds: number, scene: Scene): void {
    const dt = Math.min(0.1, Math.max(0, seconds));
    this.electronOffset += ELECTRON_SPEED * (scene.showAnswers ? scene.flow : 0) * dt;
    this.updateIons(scene, dt);
    for (const role of ["anode", "cathode"] as Role[]) this.updateBubbles(role, scene, dt);
  }

  private spawn(bounds: { minX: number; maxX: number; minY: number; maxY: number }, near: Role | null): Particle {
    const y = bounds.minY + this.random() * (bounds.maxY - bounds.minY);
    if (near) {
      const side = this.random() < 0.5 ? -1 : 1;
      const x = ELECTRODE_X[near] + side * (ELECTRODE_W / 2 + 10 + this.random() * 16);
      return { x: Math.min(bounds.maxX, Math.max(bounds.minX, x)), y: Math.min(y, ELECTRODE_BOTTOM), phase: this.random() * 6.28 };
    }
    return { x: bounds.minX + this.random() * (bounds.maxX - bounds.minX), y, phase: this.random() * 6.28 };
  }

  private updateIons(scene: Scene, dt: number): void {
    const seen = new Set<string>();
    // Ions drift only while the current flows, and only when the answers are showing.
    const drift = scene.showAnswers ? scene.flow : 0;
    for (const spec of scene.ions) {
      seen.add(spec.formula);
      const bounds = ionBounds(spec, scene);
      let list = this.ions.get(spec.formula);
      if (!list) {
        list = [];
        this.ions.set(spec.formula, list);
        while (list.length < spec.count) list.push(this.spawn(bounds, null));
      }
      while (list.length < spec.count) list.push(this.spawn(bounds, scene.flow > 0 ? spec.bornAt : null));
      if (list.length > spec.count) list.length = spec.count;
      const electrodeX = ELECTRODE_X[spec.target];
      const reach = ELECTRODE_W / 2 + 8;
      for (const p of list) {
        p.phase += dt * 1.7;
        p.x += Math.sin(p.phase * 1.3 + p.y * 0.05) * 6 * dt;
        p.y += Math.cos(p.phase + p.x * 0.03) * 6 * dt;
        const dx = electrodeX - p.x;
        const direction = Math.sign(dx) || 1;
        const speed = ION_SPEED * drift * (spec.discharged ? 1 : 0.45) * (1 + 0.3 * Math.sin(p.phase));
        p.x += direction * speed * dt;
        if (drift > 0 && Math.abs(dx) < reach && p.y < ELECTRODE_BOTTOM + 6) {
          // Taken up (or, for a spectator, it joins the crowd and another comes in from the far side).
          p.x = this.random() < 0.5 ? bounds.minX + this.random() * 40 : bounds.maxX - this.random() * 40;
          p.y = bounds.minY + this.random() * (bounds.maxY - bounds.minY);
        }
        p.x = Math.min(bounds.maxX, Math.max(bounds.minX, p.x));
        p.y = Math.min(bounds.maxY, Math.max(bounds.minY, p.y));
      }
    }
    for (const key of [...this.ions.keys()]) if (!seen.has(key)) this.ions.delete(key);
  }

  private updateBubbles(role: Role, scene: Scene, dt: number): void {
    const list = this.bubbles[role];
    const electrode = scene[role];
    if (!electrode.gas) {
      list.length = 0;
      return;
    }
    const x = ELECTRODE_X[role];
    const top = tubeGasLevel(scene, role) ?? BEAKER.solutionY;
    const fresh = (): Bubble => ({
      x: x + (this.random() < 0.5 ? -1 : 1) * (ELECTRODE_W / 2 + 3 + this.random() * 5),
      y: Math.max(top + 20, BEAKER.solutionY + 20) + this.random() * (ELECTRODE_BOTTOM - Math.max(top + 20, BEAKER.solutionY + 20)),
      r: 2 + this.random() * 3,
      speed: 25 + this.random() * 35,
    });
    if (scene.flow <= 0) {
      // Supply off: the last bubbles float away and no more form.
      for (const b of list) b.y -= b.speed * dt;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].y < top + 4) list.splice(i, 1);
      return;
    }
    while (list.length < 14) list.push(fresh());
    for (const b of list) {
      b.y -= b.speed * dt * Math.min(1.4, scene.flow + 0.3);
      b.x += Math.sin(b.y * 0.08) * 4 * dt;
      if (b.y < top + 4) {
        const again = fresh();
        b.x = again.x;
        b.y = ELECTRODE_BOTTOM - 4;
        b.r = again.r;
      }
    }
  }

  /** Paint the whole picture into a context already scaled so SCENE_W × SCENE_H fills it. */
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.drawBeaker(ctx, scene);
    this.drawWires(ctx, scene);
    this.drawSupply(ctx);
    this.drawMeter(ctx, scene);
    this.drawLabels(ctx, scene);
    ctx.restore();
  }

  private glass(ctx: CanvasRenderingContext2D): void {
    const b = BEAKER;
    const radius = 18;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + b.h - radius);
    ctx.quadraticCurveTo(b.x, b.y + b.h, b.x + radius, b.y + b.h);
    ctx.lineTo(b.x + b.w - radius, b.y + b.h);
    ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w, b.y + b.h - radius);
    ctx.lineTo(b.x + b.w, b.y);
  }

  private drawBeaker(ctx: CanvasRenderingContext2D, scene: Scene): void {
    const b = BEAKER;
    // The electrolyte, clipped to the glass.
    ctx.save();
    this.glass(ctx);
    ctx.clip();
    ctx.fillStyle = scene.molten && scene.tint ? scene.tint : scene.tint ? withAlpha(scene.tint, 0.1 + 0.5 * scene.tintStrength) : "#e9f0f6";
    ctx.fillRect(b.x, b.solutionY, b.w, b.y + b.h - b.solutionY);
    if (scene.molten) {
      // The glow of a melt, hotter at the bottom.
      const glow = ctx.createLinearGradient(0, b.solutionY, 0, b.y + b.h);
      glow.addColorStop(0, "rgba(255, 170, 60, 0)");
      glow.addColorStop(1, "rgba(255, 140, 40, 0.35)");
      ctx.fillStyle = glow;
      ctx.fillRect(b.x, b.solutionY, b.w, b.y + b.h - b.solutionY);
    }
    if (scene.iodine > 0.01) {
      const cx = ELECTRODE_X.anode;
      const cloud = ctx.createRadialGradient(cx, 420, 10, cx, 420, 90 + 160 * scene.iodine);
      cloud.addColorStop(0, withAlpha("#8a4b12", Math.min(0.85, 0.25 + scene.iodine)));
      cloud.addColorStop(1, withAlpha("#8a4b12", 0.25 * scene.iodine));
      ctx.fillStyle = cloud;
      ctx.fillRect(b.x, b.solutionY, b.w, b.y + b.h - b.solutionY);
    }
    // Ions.
    for (const spec of scene.ions) {
      for (const p of this.ions.get(spec.formula) ?? []) {
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
    // Sludge under the anode, and a liquid metal in a melt.
    if (scene.sludge > 0) {
      const w = 16 + 70 * Math.sqrt(Math.min(1, scene.sludge / 0.25));
      const h = 4 + 16 * Math.sqrt(Math.min(1, scene.sludge / 0.25));
      const base = b.y + b.h - 2;
      ctx.beginPath();
      ctx.moveTo(ELECTRODE_X.anode - w / 2, base);
      ctx.quadraticCurveTo(ELECTRODE_X.anode, base - 2 * h, ELECTRODE_X.anode + w / 2, base);
      ctx.closePath();
      ctx.fillStyle = "#4a3f35";
      ctx.fill();
    }
    if (scene.liquidMetal && scene.liquidMetal.grams > 0) {
      const size = Math.sqrt(Math.min(1, scene.liquidMetal.grams / 20));
      const rx = 14 + 60 * size;
      const ry = 4 + 6 * size;
      const y = scene.liquidMetal.sinks ? b.y + b.h - ry - 1 : b.solutionY + ry + 1;
      ctx.beginPath();
      ctx.ellipse(ELECTRODE_X.cathode, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = scene.liquidMetal.colour;
      ctx.fill();
      ctx.strokeStyle = "#3b4651";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    if (scene.membrane) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#5b6470";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(SCENE_W / 2, b.solutionY - 18);
      ctx.lineTo(SCENE_W / 2, b.y + b.h - 4);
      ctx.stroke();
      ctx.restore();
    }

    for (const role of ["anode", "cathode"] as Role[]) {
      if (scene.tubes) this.drawTube(ctx, scene, role);
      this.drawElectrode(ctx, scene, role);
      this.drawBubbles(ctx, scene, role);
    }

    // A haze of chlorine or bromine over the anode.
    if (scene.haze && scene.haze.strength > 0.02) {
      const cx = ELECTRODE_X.anode;
      const haze = ctx.createRadialGradient(cx, b.solutionY - 10, 4, cx, b.solutionY - 10, 70);
      haze.addColorStop(0, withAlpha(scene.haze.colour, 0.75 * scene.haze.strength));
      haze.addColorStop(1, withAlpha(scene.haze.colour, 0));
      ctx.fillStyle = haze;
      ctx.fillRect(cx - 80, b.y - 30, 160, b.solutionY - b.y + 30);
    }

    // The glass and the surface.
    this.glass(ctx);
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.solutionY);
    ctx.lineTo(b.x + b.w, b.solutionY);
    ctx.strokeStyle = "rgba(59, 70, 81, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawTube(ctx: CanvasRenderingContext2D, scene: Scene, role: Role): void {
    const x = ELECTRODE_X[role];
    const left = x - TUBE.halfWidth;
    const right = x + TUBE.halfWidth;
    const level = tubeGasLevel(scene, role)!;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(left, TUBE.bottom);
      ctx.lineTo(left, TUBE.top + TUBE.halfWidth);
      ctx.arc(x, TUBE.top + TUBE.halfWidth, TUBE.halfWidth, Math.PI, 0);
      ctx.lineTo(right, TUBE.bottom);
    };
    // Solution inside, held up above the beaker's surface; the gas pushes it down from the top.
    ctx.save();
    outline();
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, TUBE.top, 2 * TUBE.halfWidth, TUBE.bottom - TUBE.top);
    ctx.fillStyle = scene.tint ? withAlpha(scene.tint, 0.15 + 0.5 * scene.tintStrength) : "#cfe0ee";
    ctx.fillRect(left, level, 2 * TUBE.halfWidth, TUBE.bottom - level);
    ctx.restore();
    if (level > TUBE.top + 1) {
      // The surface of the liquid in the tube, so the two levels can be compared.
      ctx.beginPath();
      ctx.moveTo(left, level);
      ctx.lineTo(right, level);
      ctx.strokeStyle = "#2f5f8a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    outline();
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Graduations: ten to the tube.
    ctx.strokeStyle = "rgba(59, 70, 81, 0.6)";
    ctx.lineWidth = 1;
    const span = TUBE.bottom - (TUBE.top + 6);
    for (let i = 1; i < 10; i++) {
      const y = TUBE.top + 6 + (span * i) / 10;
      const outer = role === "anode" ? left : right;
      const inner = role === "anode" ? left + (i % 5 === 0 ? 12 : 7) : right - (i % 5 === 0 ? 12 : 7);
      ctx.beginPath();
      ctx.moveTo(outer, y);
      ctx.lineTo(inner, y);
      ctx.stroke();
    }
  }

  private drawElectrode(ctx: CanvasRenderingContext2D, scene: Scene, role: Role): void {
    const e = scene[role];
    const x = ELECTRODE_X[role];
    const solutionY = BEAKER.solutionY;
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 1.2;
    if (e.material.shape === "spoon") {
      const handleW = 14;
      const bowl = { y: 470, rx: 24, ry: 50 };
      const coatWidth = e.coat ? Math.min(7, 1.5 + e.coat.grams * 1.6) : 0;
      if (e.coat) {
        ctx.fillStyle = e.coat.colour;
        ctx.fillRect(x - handleW / 2 - coatWidth, solutionY, handleW + 2 * coatWidth, bowl.y - solutionY);
        ctx.beginPath();
        ctx.ellipse(x, bowl.y, bowl.rx + coatWidth, bowl.ry + coatWidth, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = e.material.colour;
      const wear = e.remaining;
      ctx.fillRect(x - handleW / 2, ELECTRODE_TOP, handleW, solutionY - ELECTRODE_TOP);
      ctx.strokeRect(x - handleW / 2, ELECTRODE_TOP, handleW, solutionY - ELECTRODE_TOP);
      ctx.fillRect(x - (handleW / 2) * wear, solutionY, handleW * wear, bowl.y - solutionY - bowl.ry * 0.7);
      ctx.beginPath();
      ctx.ellipse(x, bowl.y, bowl.rx * wear, bowl.ry * wear, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (e.coat) {
        // The plated metal's sheen over the iron.
        ctx.fillStyle = withAlpha(e.coat.colour, Math.min(0.9, 0.3 + e.coat.grams * 0.35));
        ctx.beginPath();
        ctx.ellipse(x, bowl.y, bowl.rx * wear, bowl.ry * wear, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - (handleW / 2) * wear, solutionY, handleW * wear, bowl.y - solutionY - bowl.ry * 0.7);
      }
      return;
    }
    // A plate: the part above the solution stays as it was; the part under it dissolves or is plated.
    const w = ELECTRODE_W;
    ctx.fillStyle = e.material.colour;
    ctx.fillRect(x - w / 2, ELECTRODE_TOP, w, solutionY - ELECTRODE_TOP);
    ctx.strokeRect(x - w / 2, ELECTRODE_TOP, w, solutionY - ELECTRODE_TOP);
    if (e.coat) {
      const extra = Math.min(24, 2 + e.coat.grams * 4);
      ctx.fillStyle = e.coat.colour;
      ctx.fillRect(x - w / 2 - extra / 2, solutionY, w + extra, ELECTRODE_BOTTOM - solutionY + extra / 2);
      ctx.strokeRect(x - w / 2 - extra / 2, solutionY, w + extra, ELECTRODE_BOTTOM - solutionY + extra / 2);
    }
    const under = Math.max(0, w * e.remaining);
    if (under > 0.5) {
      ctx.fillStyle = e.material.colour;
      ctx.fillRect(x - under / 2, solutionY, under, ELECTRODE_BOTTOM - solutionY);
      ctx.strokeRect(x - under / 2, solutionY, under, ELECTRODE_BOTTOM - solutionY);
    }
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, scene: Scene, role: Role): void {
    const list = this.bubbles[role];
    const gas = scene[role].gas;
    if (!gas || list.length === 0) return;
    ctx.save();
    // In the beaker; with gas tubes, up inside them too.
    if (!scene.tubes) {
      this.glass(ctx);
      ctx.clip();
    }
    ctx.strokeStyle = "rgba(60, 90, 120, 0.7)";
    ctx.fillStyle = withAlpha(gas.colour, 0.85);
    ctx.lineWidth = 1;
    for (const b of list) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWires(ctx: CanvasRenderingContext2D, scene: Scene): void {
    for (const role of ["anode", "cathode"] as Role[]) {
      const path = wirePath(role);
      ctx.beginPath();
      path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.strokeStyle = "#3b4651";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (!scene.showAnswers || scene.flow <= 0) continue;
      const length = polylineLength(path);
      const spacing = length / ELECTRONS_PER_WIRE;
      for (let i = 0; i < ELECTRONS_PER_WIRE; i++) {
        const at = along(path, wrap(i * spacing + this.electronOffset, length));
        ctx.beginPath();
        ctx.arc(at.x, at.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#1f4fd1";
        ctx.fill();
      }
    }
  }

  private drawSupply(ctx: CanvasRenderingContext2D): void {
    const s = SUPPLY;
    ctx.fillStyle = "#f3f5f8";
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1d2733";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText("DC supply", s.x + s.w / 2, s.y + s.h / 2);
    // Terminals: + on the anode's side, − on the cathode's.
    for (const [x, sign, colour] of [
      [s.x, "+", "#c0392b"],
      [s.x + s.w, "−", "#1d2733"],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, WIRE_Y, 8, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.fillStyle = "#1d2733";
      ctx.font = "bold 18px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(sign, x + (sign === "+" ? 16 : -16), s.y + 12);
    }
  }

  private drawMeter(ctx: CanvasRenderingContext2D, scene: Scene): void {
    ctx.beginPath();
    ctx.arc(METER.x, METER.y, METER.r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#3b4651";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#1d2733";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText("A", METER.x, METER.y - 11);
    ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText(scene.flow > 0 ? scene.current : "0,00 A", METER.x, METER.y + 8);
  }

  private drawLabels(ctx: CanvasRenderingContext2D, scene: Scene): void {
    ctx.textBaseline = "middle";
    // The electrodes' names, beside their tops.
    for (const role of ["anode", "cathode"] as Role[]) {
      const e = scene[role];
      const x = ELECTRODE_X[role];
      ctx.font = "bold 16px Roboto, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#1d2733";
      ctx.textAlign = role === "anode" ? "right" : "left";
      const offset = (scene.tubes ? TUBE.halfWidth : ELECTRODE_W / 2) + 10;
      ctx.fillText(e.label, role === "anode" ? x - offset : x + offset, ELECTRODE_TOP + 16);
      // Under the beaker: the role and the half-reaction.
      ctx.textAlign = "center";
      ctx.font = "bold 15px Roboto, 'Segoe UI', sans-serif";
      ctx.fillStyle = scene.showAnswers ? (role === "cathode" ? "#1f6b3f" : "#9c2f1f") : "#1d2733";
      ctx.fillText(e.roleLabel, x, BEAKER.y + BEAKER.h + 22);
      if (e.halfReaction) {
        ctx.font = "14px Roboto, 'Segoe UI', sans-serif";
        ctx.fillStyle = "#1d2733";
        ctx.fillText(e.halfReaction, x, BEAKER.y + BEAKER.h + 46);
      }
      if (scene.tubes) {
        const volume = role === "anode" ? scene.tubes.anode : scene.tubes.cathode;
        const gas = e.gas?.formula ?? "gas";
        ctx.font = "13px Roboto, 'Segoe UI', sans-serif";
        ctx.fillStyle = "#1d2733";
        ctx.textAlign = role === "anode" ? "right" : "left";
        const text = scene.showAnswers ? `${gas}: ${three(volume)} cm³` : `${three(volume)} cm³`;
        // In the space inside the beaker above the solution, beside the tube.
        ctx.fillText(text, role === "anode" ? x - TUBE.halfWidth - 8 : x + TUBE.halfWidth + 8, (BEAKER.y + BEAKER.solutionY) / 2 + 2);
      }
    }
    if (scene.membrane) {
      ctx.textAlign = "center";
      ctx.font = "13px Roboto, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#414942";
      ctx.fillText(scene.showAnswers ? "Membrane (lets Na⁺ through)" : "Membrane", SCENE_W / 2, BEAKER.solutionY - 30);
    }

    // Top left: what is in the cell; top right: the time and anything wrong.
    ctx.textAlign = "left";
    ctx.fillStyle = "#1d2733";
    ctx.font = "14px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText(scene.electrolyteLabel, 24, 24);
    ctx.fillStyle = "#414942";
    ctx.fillText(scene.conditionLabel, 24, 46);
    ctx.textAlign = "right";
    ctx.fillStyle = "#1d2733";
    ctx.font = "bold 15px Roboto, 'Segoe UI', sans-serif";
    ctx.fillText(scene.timeLabel, SCENE_W - 24, 24);
    if (scene.note) {
      ctx.fillStyle = "#8a2f22";
      ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(scene.note, SCENE_W - 24, 46);
    }

    // The key to the dots, left of the beaker; with the answers, where each is heading.
    let keyY = BEAKER.solutionY + 14;
    for (const spec of scene.ions) {
      ctx.beginPath();
      ctx.arc(30, keyY, 7, 0, Math.PI * 2);
      ctx.fillStyle = spec.colour;
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px Roboto, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(spec.positive ? "+" : "−", 30, keyY + 0.5);
      ctx.textAlign = "left";
      ctx.fillStyle = "#1d2733";
      ctx.font = "13px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText(scene.molten ? spec.formula : `${spec.formula}(aq)`, 44, keyY);
      if (scene.showAnswers) {
        ctx.fillStyle = "#5c6670";
        ctx.font = "12px Roboto, 'Segoe UI', sans-serif";
        ctx.fillText(`→ ${spec.target}`, 118, keyY);
      }
      keyY += 22;
    }

    // Right of the beaker: what has been made so far.
    if (scene.made.length) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#1d2733";
      ctx.font = "bold 13px Roboto, 'Segoe UI', sans-serif";
      ctx.fillText("So far", 826, BEAKER.solutionY + 14);
      ctx.font = "13px Roboto, 'Segoe UI', sans-serif";
      scene.made.forEach((line, i) => ctx.fillText(line, 826, BEAKER.solutionY + 36 + i * 20));
    }

    if (scene.showAnswers && scene.flow > 0) {
      // Which way the electrons go, over each wire.
      ctx.strokeStyle = "#1f4fd1";
      ctx.fillStyle = "#1f4fd1";
      ctx.lineWidth = 2.5;
      for (const [from, to] of [
        [ELECTRODE_X.anode + 22, SUPPLY.x - 22],
        [SUPPLY.x + SUPPLY.w + 22, ELECTRODE_X.cathode - 34],
      ]) {
        const y = WIRE_Y - 16;
        ctx.beginPath();
        ctx.moveTo(from, y);
        ctx.lineTo(to, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to, y);
        ctx.lineTo(to - 10, y - 6);
        ctx.lineTo(to - 10, y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = "center";
        ctx.font = "bold 14px Roboto, 'Segoe UI', sans-serif";
        ctx.fillText("e⁻", (from + to) / 2, y - 14);
      }
    }
  }
}

/** "#2f86d6" with an alpha. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
