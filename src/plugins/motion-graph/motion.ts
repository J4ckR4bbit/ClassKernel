// Motion graph engine: a journey in stages, three graphs out.
//
// A stage says how long it lasts and how fast the object is going at the end of
// it. Everything else follows: the acceleration is what it takes to get there,
// and the position is the area under the velocity. Because all three graphs are
// derived from one description they cannot contradict each other — which is the
// whole point, since a hand-drawn x–t / v–t / a–t set that disagrees with itself
// is the classic way a kinematics question goes wrong.
//
// Free of React and of the canvas element so the physics can be tested without
// a browser.

import { MAX_CANVAS_PX, mm } from "../png";
import { formatFixed, formatSigFigs } from "../numbers";
import { Scale, formatTick, niceScale, tickValues } from "../scale";

/** One stage of the journey, as a teacher describes it. */
export interface Stage {
  seconds: number;
  /** Velocity at the end of the stage; the start is wherever the last one left off. */
  endVelocity: number;
}

export interface Journey {
  startVelocity: number;
  startPosition: number;
  stages: Stage[];
}

export const DEFAULT_JOURNEY: Journey = {
  startVelocity: 0,
  startPosition: 0,
  stages: [
    { seconds: 4, endVelocity: 8 },
    { seconds: 3, endVelocity: 8 },
    { seconds: 2, endVelocity: 0 },
  ],
};

/** Which of the three graphs to draw, and whether the curve is filled in. */
export type GraphMode = "off" | "blank" | "drawn";

export interface MotionSettings {
  title: string;
  position: GraphMode;
  velocity: GraphMode;
  acceleration: GraphMode;
  /** Dashed verticals at every stage boundary, tying the three graphs together. */
  showStageLines: boolean;
  showGrid: boolean;
  widthMm: number;
  /** Height of each graph panel, in millimetres. */
  panelMm: number;
  curveColor: string;
}

export const DEFAULT_MOTION: MotionSettings = {
  title: "",
  position: "drawn",
  velocity: "drawn",
  acceleration: "drawn",
  showStageLines: true,
  showGrid: true,
  widthMm: 150,
  panelMm: 45,
  curveColor: "#1b53a8",
};

/** A stage with everything the graphs need worked out. */
export interface StageState {
  index: number;
  /** Clock times at the start and end of the stage. */
  start: number;
  end: number;
  /** Velocity in and out. */
  u: number;
  v: number;
  a: number;
  /** Position in and out. */
  x0: number;
  x1: number;
  /**
   * When the object turns round inside this stage (velocity passes through
   * zero), the clock time it happens — position is at a maximum or minimum
   * there, which the graph and the axis range both have to know about.
   */
  turningTime: number | null;
}

/** Work the journey out stage by stage. Position is continuous by construction. */
export function analyse(journey: Journey): StageState[] {
  const out: StageState[] = [];
  let t = 0;
  let u = journey.startVelocity;
  let x = journey.startPosition;

  journey.stages.forEach((stage, index) => {
    const seconds = Math.max(0, stage.seconds);
    if (seconds === 0) return;
    const v = stage.endVelocity;
    const a = (v - u) / seconds;
    const x1 = x + u * seconds + 0.5 * a * seconds * seconds;
    // u + a·t = 0 somewhere inside the stage means it changes direction there.
    const tTurn = a === 0 ? null : -u / a;
    const turning = tTurn !== null && tTurn > 0 && tTurn < seconds ? t + tTurn : null;

    out.push({ index, start: t, end: t + seconds, u, v, a, x0: x, x1, turningTime: turning });
    t += seconds;
    u = v;
    x = x1;
  });

  return out;
}

export function totalTime(states: StageState[]): number {
  return states.length ? states[states.length - 1].end : 0;
}

function stageAt(states: StageState[], t: number): StageState | null {
  if (states.length === 0) return null;
  for (const s of states) if (t >= s.start && t <= s.end) return s;
  return t < states[0].start ? states[0] : states[states.length - 1];
}

export function velocityAt(states: StageState[], t: number): number {
  const s = stageAt(states, t);
  return s ? s.u + s.a * (t - s.start) : 0;
}

export function positionAt(states: StageState[], t: number): number {
  const s = stageAt(states, t);
  if (!s) return 0;
  const dt = t - s.start;
  return s.x0 + s.u * dt + 0.5 * s.a * dt * dt;
}

/** Acceleration is a step function: it jumps between stages. */
export function accelerationAt(states: StageState[], t: number): number {
  const s = stageAt(states, t);
  return s ? s.a : 0;
}

/** "Speeds up from 0 to 8 m·s⁻¹ in 4 s (a = 2 m·s⁻²)" — for the stage list. */
export function describeStage(s: StageState): string {
  const secs = `${formatSigFigs(s.end - s.start)} s`;
  if (s.u === 0 && s.v === 0) return `At rest for ${secs}`;
  if (s.a === 0) return `Constant ${formatSigFigs(s.u)} m·s⁻¹ for ${secs}`;
  const verb = Math.abs(s.v) > Math.abs(s.u) ? "Speeds up" : "Slows down";
  return `${verb} from ${formatSigFigs(s.u)} to ${formatSigFigs(s.v)} m·s⁻¹ in ${secs} (a = ${formatSigFigs(s.a)} m·s⁻²)`;
}

/** Total distance travelled — path length, so a reversal adds rather than cancels. */
export function distanceTravelled(states: StageState[]): number {
  let total = 0;
  for (const s of states) {
    if (s.turningTime === null) {
      total += Math.abs(s.x1 - s.x0);
    } else {
      const xTurn = positionAt(states, s.turningTime);
      total += Math.abs(xTurn - s.x0) + Math.abs(s.x1 - xTurn);
    }
  }
  return total;
}

// ---------- the three series ----------

export type Quantity = "position" | "velocity" | "acceleration";

export interface Point {
  t: number;
  y: number;
}

/** Straight lines, and enough points along a parabola to look like one. */
const CURVE_SAMPLES = 24;

/**
 * The drawn shape of one quantity: a list of strokes, because acceleration
 * jumps between stages and must not be joined up across the gap.
 */
export function series(states: StageState[], quantity: Quantity): Point[][] {
  if (states.length === 0) return [];

  if (quantity === "acceleration") {
    return states.map((s) => [
      { t: s.start, y: s.a },
      { t: s.end, y: s.a },
    ]);
  }

  if (quantity === "velocity") {
    // Continuous: one stroke through the whole journey.
    const stroke: Point[] = [{ t: states[0].start, y: states[0].u }];
    for (const s of states) stroke.push({ t: s.end, y: s.v });
    return [stroke];
  }

  const stroke: Point[] = [{ t: states[0].start, y: states[0].x0 }];
  for (const s of states) {
    if (s.a === 0) {
      stroke.push({ t: s.end, y: s.x1 });
      continue;
    }
    // Constant acceleration: a parabola, sampled.
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      const t = s.start + ((s.end - s.start) * i) / CURVE_SAMPLES;
      stroke.push({ t, y: positionAt(states, t) });
    }
  }
  return [stroke];
}

export const AXIS_CAPTIONS: Record<Quantity, string> = {
  position: "x (m)",
  velocity: "v (m·s⁻¹)",
  acceleration: "a (m·s⁻²)",
};

/** The value range a quantity covers, turning points included. */
export function rangeOf(states: StageState[], quantity: Quantity): [number, number] {
  const values: number[] = [0]; // every one of these graphs shows zero
  if (quantity === "acceleration") {
    for (const s of states) values.push(s.a);
  } else if (quantity === "velocity") {
    for (const s of states) values.push(s.u, s.v);
  } else {
    for (const s of states) {
      values.push(s.x0, s.x1);
      // A turn-round inside a stage is where the position peaks.
      if (s.turningTime !== null) values.push(positionAt(states, s.turningTime));
    }
  }
  return [Math.min(...values), Math.max(...values)];
}

// ---------- layout ----------

const TITLE_MM = 4.6;
const LABEL_MM = 3.4;
const TICK_MM = 2.9;
const GAP_MM = 7;

export interface PanelLayout {
  quantity: Quantity;
  /** Whether the curve itself is drawn, or the axes are left blank to draw on. */
  drawn: boolean;
  top: number;
  height: number;
  scale: Scale;
  ticks: number[];
}

export interface MotionLayout {
  width: number;
  height: number;
  left: number;
  plotW: number;
  panels: PanelLayout[];
  timeScale: Scale;
  timeTicks: number[];
  /** Clock time at every stage boundary, for the dashed guides. */
  stageTimes: number[];
  tooLarge: boolean;
  empty: boolean;
}

export function computeMotionLayout(states: StageState[], v: MotionSettings): MotionLayout {
  const wanted: Quantity[] = (["position", "velocity", "acceleration"] as Quantity[]).filter(
    (q) => v[q] !== "off",
  );
  const width = Math.round(mm(v.widthMm));
  const titleH = v.title ? mm(TITLE_MM + 4) : mm(2);
  const panelH = mm(v.panelMm);
  const timeAxisH = mm(TICK_MM + LABEL_MM + 6);
  const height = Math.round(titleH + wanted.length * (panelH + mm(GAP_MM)) + timeAxisH);

  const time = totalTime(states);
  const timeScale = niceScale(0, time > 0 ? time : 1, true);
  const timeTicks = tickValues(timeScale);

  const panels: PanelLayout[] = wanted.map((quantity, i) => {
    const [lo, hi] = states.length ? rangeOf(states, quantity) : [0, 1];
    const scale = niceScale(lo, hi, true);
    return {
      quantity,
      drawn: v[quantity] === "drawn" && states.length > 0,
      top: titleH + i * (panelH + mm(GAP_MM)),
      height: panelH,
      scale,
      ticks: tickValues(scale),
    };
  });

  // One left margin for all the panels, so their axes line up down the page.
  const widest = Math.max(
    ...panels.flatMap((p) => p.ticks.map((t) => formatTick(t, p.scale.step).length)),
    1,
  );
  const left = mm(LABEL_MM + 4 + widest * TICK_MM * 0.62);

  return {
    width,
    height,
    left,
    plotW: Math.max(10, width - left - mm(6)),
    panels,
    timeScale,
    timeTicks,
    stageTimes: states.map((s) => s.end).filter((t) => t > 0),
    tooLarge: width > MAX_CANVAS_PX || height > MAX_CANVAS_PX,
    empty: states.length === 0 || panels.length === 0,
  };
}

/** Where a (time, value) pair lands inside one panel. */
export function project(layout: MotionLayout, panel: PanelLayout, point: Point): { x: number; y: number } {
  const ts = layout.timeScale;
  const ys = panel.scale;
  return {
    x: layout.left + ((point.t - ts.min) / (ts.max - ts.min)) * layout.plotW,
    y: panel.top + panel.height - ((point.y - ys.min) / (ys.max - ys.min)) * panel.height,
  };
}

// ---------- painting ----------

/** The slice of a 2D context the painter uses (so tests can stand in for one). */
export interface MotionContext {
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
  setLineDash(segments: number[]): void;
}

const font = (sizeMm: number, weight = "") => `${weight} ${Math.round(mm(sizeMm))}px "Segoe UI", Arial, sans-serif`.trim();

export function paintMotion(
  ctx: MotionContext,
  states: StageState[],
  v: MotionSettings,
  layout: MotionLayout,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.setLineDash([]);

  const right = layout.left + layout.plotW;
  const lastPanel = layout.panels[layout.panels.length - 1];

  if (v.title) {
    ctx.fillStyle = "#1b2733";
    ctx.font = font(TITLE_MM, "600");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(v.title, layout.left + layout.plotW / 2, mm(2));
  }

  for (const panel of layout.panels) {
    const bottom = panel.top + panel.height;
    // Where value zero sits: the horizontal axis is drawn there, because these
    // quantities go negative and the axis is the line they cross.
    const zero = project(layout, panel, { t: layout.timeScale.min, y: 0 }).y;
    const axisY = Math.min(Math.max(zero, panel.top), bottom);

    if (v.showGrid) {
      ctx.strokeStyle = "#dfe5ec";
      ctx.lineWidth = Math.max(1, mm(0.16));
      ctx.beginPath();
      for (const t of layout.timeTicks) {
        const { x } = project(layout, panel, { t, y: 0 });
        ctx.moveTo(Math.round(x) + 0.5, panel.top);
        ctx.lineTo(Math.round(x) + 0.5, bottom);
      }
      for (const y of panel.ticks) {
        const p = project(layout, panel, { t: layout.timeScale.min, y });
        ctx.moveTo(layout.left, Math.round(p.y) + 0.5);
        ctx.lineTo(right, Math.round(p.y) + 0.5);
      }
      ctx.stroke();
    }

    // Dashed guides at the stage boundaries, tying the graphs to each other.
    if (v.showStageLines && layout.stageTimes.length > 0) {
      ctx.strokeStyle = "#9fb0c0";
      ctx.lineWidth = Math.max(1, mm(0.2));
      ctx.setLineDash([mm(1.2), mm(1.2)]);
      ctx.beginPath();
      for (const t of layout.stageTimes) {
        const { x } = project(layout, panel, { t, y: 0 });
        ctx.moveTo(Math.round(x) + 0.5, panel.top);
        ctx.lineTo(Math.round(x) + 0.5, bottom);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes: time along the value-zero line, the value axis up the left.
    ctx.strokeStyle = "#1b2733";
    ctx.lineWidth = Math.max(1, mm(0.4));
    ctx.beginPath();
    ctx.moveTo(layout.left, panel.top);
    ctx.lineTo(layout.left, bottom);
    ctx.moveTo(layout.left, axisY);
    ctx.lineTo(right, axisY);
    ctx.stroke();

    // Value ticks and their numbers.
    ctx.fillStyle = "#1b2733";
    ctx.font = font(TICK_MM);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const tickLen = mm(1.2);
    ctx.lineWidth = Math.max(1, mm(0.3));
    ctx.beginPath();
    for (const y of panel.ticks) {
      const p = project(layout, panel, { t: layout.timeScale.min, y });
      ctx.moveTo(layout.left - tickLen, Math.round(p.y) + 0.5);
      ctx.lineTo(layout.left, Math.round(p.y) + 0.5);
    }
    ctx.stroke();
    for (const y of panel.ticks) {
      const p = project(layout, panel, { t: layout.timeScale.min, y });
      ctx.fillText(formatTick(y, panel.scale.step), layout.left - tickLen - mm(0.8), p.y);
    }

    // The quantity, up the side.
    ctx.save();
    ctx.translate(mm(LABEL_MM), panel.top + panel.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = font(LABEL_MM, "600");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(AXIS_CAPTIONS[panel.quantity], 0, 0);
    ctx.restore();

    // The curve itself — left out on a blank panel, which is the version a
    // learner is asked to fill in.
    if (panel.drawn) {
      ctx.strokeStyle = v.curveColor;
      ctx.lineWidth = Math.max(1, mm(0.55));
      for (const stroke of series(states, panel.quantity)) {
        ctx.beginPath();
        stroke.forEach((point, i) => {
          const p = project(layout, panel, point);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    }
  }

  // One shared time axis under the bottom panel.
  if (lastPanel) {
    const bottom = lastPanel.top + lastPanel.height;
    ctx.strokeStyle = "#1b2733";
    ctx.fillStyle = "#1b2733";
    ctx.lineWidth = Math.max(1, mm(0.3));
    ctx.font = font(TICK_MM);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const tickLen = mm(1.2);
    ctx.beginPath();
    for (const t of layout.timeTicks) {
      const { x } = project(layout, lastPanel, { t, y: 0 });
      ctx.moveTo(Math.round(x) + 0.5, bottom);
      ctx.lineTo(Math.round(x) + 0.5, bottom + tickLen);
    }
    ctx.stroke();
    for (const t of layout.timeTicks) {
      const { x } = project(layout, lastPanel, { t, y: 0 });
      ctx.fillText(formatTick(t, layout.timeScale.step), x, bottom + tickLen + mm(0.8));
    }
    ctx.font = font(LABEL_MM, "600");
    ctx.fillText("t (s)", layout.left + layout.plotW / 2, bottom + tickLen + mm(TICK_MM + 2));
  }
}

/** Size the canvas from the settings and draw. Returns the layout used. */
export function drawMotion(
  canvas: HTMLCanvasElement,
  states: StageState[],
  v: MotionSettings,
): MotionLayout {
  const layout = computeMotionLayout(states, v);
  if (layout.tooLarge) return layout;
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (ctx) paintMotion(ctx, states, v, layout);
  return layout;
}

/** A one-line summary of the whole journey, for the panel under the buttons. */
export function summarise(states: StageState[]): string {
  if (states.length === 0) return "";
  const time = totalTime(states);
  const net = states[states.length - 1].x1 - states[0].x0;
  const distance = distanceTravelled(states);
  const parts = [
    `${formatSigFigs(time)} s`,
    `displacement ${formatSigFigs(net)} m`,
    `distance ${formatSigFigs(distance)} m`,
  ];
  if (time > 0) parts.push(`average speed ${formatFixed(distance / time, 2)} m·s⁻¹`);
  return parts.join("   ·   ");
}

/** File name for a saved figure, from its title. */
export function fileNameFor(v: MotionSettings): string {
  const stem = v.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${stem || "motion_graphs"}.png`;
}
