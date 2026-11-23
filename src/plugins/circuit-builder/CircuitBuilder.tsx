import { Fragment, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatNumber } from "../numbers";
import { prefersReducedMotion } from "../../lib/motion";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import {
  COLS,
  Circuit,
  EMPTY,
  PART_INFO,
  PART_TYPES,
  Part,
  PartType,
  Pt,
  ROWS,
  Rot,
  addPart,
  addWire,
  connectionPoints,
  fromFile,
  labelRuns,
  looseEnds,
  movePart,
  partAt,
  ptKey,
  removePart,
  removeWires,
  rotatePart,
  shift,
  stepsBetween,
  toFile,
  updatePart,
  wireAt,
  wireRun,
} from "./circuit";
import { Look, Precision, G, SCENE_H, SCENE_W, advanceFlow, drawCircuit, drawPaletteIcon, measure, readingText } from "./drawing";
import { PRESETS, brightestLamp, presetById } from "./presets";
import { PartReading, SHORT_CURRENT, cellFigures, meterValue, solve } from "./solve";
import { Mode, Tool, useCircuit } from "./circuitStore";
import "./circuit-builder.css";

/** Millimetres per grid step in the saved picture: a lamp comes out about 9 mm across, as on a printed paper. */
const PRINT_GRID_MM = 9;
/** Margin round the saved picture, in scene units. */
const PRINT_MARGIN = 10;

const PRECISIONS: Array<{ value: Precision; label: string }> = [
  { value: "dp2", label: "2 decimals" },
  { value: "sf3", label: "3 sig. figs" },
];

/** "R1" → R<sub>1</sub>, the way the diagram writes it. */
function Label({ text }: { text: string }) {
  return (
    <>
      {labelRuns(text).map(([t, sub], i) => (sub ? <sub key={i}>{t}</sub> : <Fragment key={i}>{t}</Fragment>))}
    </>
  );
}

/** What the memo and the property panel call a part: its label, or its kind (numbered if there are several unlabelled). */
function partName(c: Circuit, p: Part): ReactNode {
  const kind = PART_INFO[p.type].name.replace(" / battery", "");
  if (p.label) {
    return (
      <>
        {p.type === "ammeter" || p.type === "voltmeter" ? "" : `${kind} `}
        <Label text={p.label} />
      </>
    );
  }
  const same = c.parts.filter((q) => q.type === p.type && !q.label);
  return same.length > 1 ? `${kind} ${same.indexOf(p) + 1}` : kind;
}

/** A number typed the South African way (2,5) or the other (2.5), with spaces between thousands; null if it isn't one. */
function parseInput(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, "").replace(",", ".");
  if (!cleaned || !/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null ? null : parseInput(draft);
  const bad = draft !== null && (n === null || n < min || n > max);
  return (
    <label className="cb-field">
      <span className="cb-field-label">{label}</span>
      <span className="cb-number">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} in ${unit}`}
          aria-invalid={bad}
          className={bad ? "cb-bad" : ""}
          value={draft ?? formatNumber(value, 4)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = parseInput(e.target.value);
            if (v !== null && v >= min && v <= max) onChange(v);
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="muted">{unit}</span>
      </span>
    </label>
  );
}

/** A palette button's picture: the symbol as the diagram draws it. */
function PaletteIcon({ type }: { type: PartType | "wire" }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = 64 * dpr;
    canvas.height = 32 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPaletteIcon(ctx, type, 64, 32);
  }, [type]);
  return <canvas ref={ref} className="cb-palette-icon" aria-hidden />;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_VIEW: View = { x: 0, y: 0, w: SCENE_W, h: SCENE_H };

/**
 * The view that fills the canvas with the circuit: its drawing (labels
 * included) plus room for the readouts, rounded out to whole grid steps so a
 * changed value doesn't make it twitch, at the canvas's shape and never
 * closer than half the scene.
 */
function fitView(ctx: CanvasRenderingContext2D, c: Circuit): View {
  const b = measure(ctx, c, null, { screen: false, grid: false, junctionDots: false, readings: "none", glow: false, precision: "dp2" });
  if (!b) return FULL_VIEW;
  const pad = 50;
  const x0 = Math.floor((b.x0 - pad) / G) * G;
  const y0 = Math.floor((b.y0 - pad) / G) * G;
  const x1 = Math.ceil((b.x1 + pad) / G) * G;
  const y1 = Math.ceil((b.y1 + pad) / G) * G;
  let w = Math.max(x1 - x0, SCENE_W / 2);
  let h = Math.max(y1 - y0, SCENE_H / 2);
  if (w / h > SCENE_W / SCENE_H) h = (w * SCENE_H) / SCENE_W;
  else w = (h * SCENE_W) / SCENE_H;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

type Drag =
  | { kind: "place"; type: PartType; at: Pt }
  | { kind: "move"; id: string; grab: { dx: number; dy: number }; at: Pt; moved: boolean }
  | { kind: "wire"; path: Pt[] }
  | { kind: "erase"; working: Circuit }
  | { kind: "tap"; id: string };

const nearest = (g: { x: number; y: number }): Pt => ({
  x: Math.min(COLS - 1, Math.max(1, Math.round(g.x))),
  y: Math.min(ROWS - 1, Math.max(1, Math.round(g.y))),
});

/** Erase whatever is under a point: a part, or else one step of wire. */
function eraseAt(c: Circuit, g: { x: number; y: number }): Circuit {
  const part = partAt(c, g.x, g.y);
  if (part) return removePart(c, part.id);
  const wire = wireAt(c, g.x, g.y, 0.3);
  return wire ? removeWires(c, [wire]) : c;
}

/**
 * Circuit builder: draw an exam-style circuit on a grid, then run it — the
 * meters read, the lamps glow with their power and the current moves round.
 */
export default function CircuitBuilder() {
  const { showToast } = useAppPick("showToast");
  const s = useCircuit();
  const { circuit, mode, tool, placeRot, selection, options } = s;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [classView, setClassView] = useState(false);
  const [presetId, setPresetId] = useState("");
  const [withReadings, setWithReadings] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  // The circuit on screen: while erasing, the working copy.
  const shown = drag?.kind === "erase" ? drag.working : circuit;
  const solution = useMemo(() => solve(shown), [shown]);
  const loose = useMemo(() => looseEnds(shown), [shown]);
  const running = mode === "run";

  // A fuse that blows while the circuit runs stays blown — part of the change that blew it.
  useEffect(() => {
    if (!running || !solution.blown.length || drag) return;
    let next = circuit;
    for (const id of solution.blown) next = updatePart(next, id, { blown: true });
    s.amend(next);
  }, [running, solution, circuit, drag, s]);

  const selectedPart = selection?.kind === "part" ? circuit.parts.find((p) => p.id === selection.id) ?? null : null;

  // ---------- drawing ----------

  const phase = useRef(new Map<string, number>());
  const live = useRef({ shown, solution, mode, options, selection, drag, hover, tool, placeRot, loose });
  live.current = { shown, solution, mode, options, selection, drag, hover, tool, placeRot, loose };
  const dirty = useRef(true);
  dirty.current = true;

  const lookNow = useCallback((): Look => {
    const L = live.current;
    const run = L.mode === "run";
    const d = L.drag;
    let ghost: Look["ghost"] = null;
    if (d?.kind === "place" || (!d && L.hover && L.mode === "build" && L.tool in PART_INFO)) {
      const type = d?.kind === "place" ? d.type : (L.tool as PartType);
      const at = d?.kind === "place" ? d.at : L.hover!;
      const part = { ...EMPTY_PART, type, x: at.x, y: at.y, rot: L.placeRot };
      ghost = { part, ok: !!addPart(L.shown, type, at.x, at.y, L.placeRot) };
    } else if (d?.kind === "move" && d.moved) {
      const p = L.shown.parts.find((q) => q.id === d.id);
      if (p) ghost = { part: { ...p, x: d.at.x, y: d.at.y }, ok: !!movePart(L.shown, d.id, d.at.x, d.at.y) };
    }
    return {
      screen: true,
      grid: L.options.grid && !run,
      junctionDots: L.options.junctionDots,
      readings: run ? (L.options.hideReadings ? "hide" : "show") : "none",
      glow: run,
      precision: L.options.precision,
      selectedPart: L.selection?.kind === "part" ? L.selection.id : null,
      selectedWires: L.selection?.kind === "wire" ? new Set(L.selection.edges) : undefined,
      ghost,
      moving: d?.kind === "move" && d.moved ? d.id : null,
      wirePath: d?.kind === "wire" ? d.path : null,
      looseEnds: run ? [] : L.loose,
      flow: run && L.options.flow ? { phase: phase.current, electrons: L.options.electrons } : null,
    };
  }, []);

  // Size the canvas to its box, at the screen's pixel density.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const box = stage.getBoundingClientRect();
    const style = getComputedStyle(stage);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const width = Math.max(200, Math.min(box.width - padX, ((box.height - padY) * SCENE_W) / SCENE_H || Infinity));
    const height = (width * SCENE_H) / SCENE_W;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    dirty.current = true;
  }, []);

  useEffect(() => {
    fit();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fit, classView]);

  // What part of the scene the canvas shows: all of it while building; while
  // running, the circuit itself, zoomed to fill the space (it glides there).
  const view = useRef<View>({ ...FULL_VIEW });
  const target = useRef<{ circuit: Circuit | null; mode: Mode | null; view: View }>({ circuit: null, mode: null, view: FULL_VIEW });
  const scratch = useRef<CanvasRenderingContext2D | null>(null);

  // The loop: move the current on, and draw when anything changed. The
  // current moves even when the computer asks for fewer animations (Windows'
  // "Animation effects" off, common on school machines): here the movement is
  // the lesson. Only the glide to the zoomed view is skipped then.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = live.current;
      const still = prefersReducedMotion();
      const animate = L.mode === "run" && L.options.flow;
      if (animate) advanceFlow(phase.current, L.shown, L.solution, dt, L.options.electrons);
      if (target.current.circuit !== L.shown || target.current.mode !== L.mode) {
        scratch.current ??= document.createElement("canvas").getContext("2d");
        const goal = L.mode === "run" && scratch.current ? fitView(scratch.current, L.shown) : FULL_VIEW;
        target.current = { circuit: L.shown, mode: L.mode, view: goal };
      }
      const goal = target.current.view;
      const v = view.current;
      const gap = Math.abs(goal.x - v.x) + Math.abs(goal.y - v.y) + Math.abs(goal.w - v.w);
      if (gap > 0.5) {
        const k = still ? 1 : 1 - Math.exp(-dt * 9);
        v.x += (goal.x - v.x) * k;
        v.y += (goal.y - v.y) * k;
        v.w += (goal.w - v.w) * k;
        v.h += (goal.h - v.h) * k;
        dirty.current = true;
      } else if (gap > 0) {
        Object.assign(v, goal);
        dirty.current = true;
      }
      if (!animate && !dirty.current) return;
      dirty.current = false;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sx = canvas.width / v.w;
      const sy = canvas.height / v.h;
      ctx.setTransform(sx, 0, 0, sy, -v.x * sx, -v.y * sy);
      drawCircuit(ctx, L.shown, L.solution, lookNow());
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lookNow]);

  // ---------- pointer ----------

  const toGrid = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const v = view.current;
    return {
      x: (v.x + ((e.clientX - rect.left) / rect.width) * v.w) / G,
      y: (v.y + ((e.clientY - rect.top) / rect.height) * v.h) / G,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const g = toGrid(e);
    const pt = nearest(g);
    if (running) {
      const part = partAt(circuit, g.x, g.y);
      if (part) setDrag({ kind: "tap", id: part.id });
      else s.select(null);
      return;
    }
    if (tool in PART_INFO) {
      setDrag({ kind: "place", type: tool as PartType, at: pt });
      return;
    }
    if (tool === "wire") {
      setDrag({ kind: "wire", path: [pt] });
      return;
    }
    if (tool === "erase") {
      setDrag({ kind: "erase", working: eraseAt(circuit, g) });
      return;
    }
    // Select: on a connection point, draw a wire from it; on a part, pick it up; on wire, select the run.
    const onPoint = Math.hypot(g.x - pt.x, g.y - pt.y) < 0.3 && connectionPoints(circuit).has(ptKey(pt.x, pt.y));
    const part = partAt(circuit, g.x, g.y);
    if (part && !onPoint) {
      s.select({ kind: "part", id: part.id });
      setDrag({ kind: "move", id: part.id, grab: { dx: part.x - g.x, dy: part.y - g.y }, at: { x: part.x, y: part.y }, moved: false });
    } else if (onPoint) {
      setDrag({ kind: "wire", path: [pt] });
    } else {
      const wire = wireAt(circuit, g.x, g.y, 0.3);
      s.select(wire ? { kind: "wire", edges: wireRun(circuit, wire) } : null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = toGrid(e);
    const pt = nearest(g);
    const d = dragRef.current;
    if (!d) {
      const next = !running && tool in PART_INFO && e.pointerType === "mouse" ? pt : null;
      if (next?.x !== hover?.x || next?.y !== hover?.y) setHover(next);
      e.currentTarget.style.cursor = cursorFor(g);
      return;
    }
    if (d.kind === "place" && (d.at.x !== pt.x || d.at.y !== pt.y)) setDrag({ ...d, at: pt });
    else if (d.kind === "move") {
      const at = nearest({ x: g.x + d.grab.dx, y: g.y + d.grab.dy });
      if (at.x !== d.at.x || at.y !== d.at.y) setDrag({ ...d, at, moved: true });
    } else if (d.kind === "wire") {
      const lastPt = d.path[d.path.length - 1];
      if (lastPt.x === pt.x && lastPt.y === pt.y) return;
      const path = [...d.path];
      for (const step of stepsBetween(lastPt, pt)) {
        const back = path[path.length - 2];
        if (back && back.x === step.x && back.y === step.y) path.pop();
        else path.push(step);
      }
      setDrag({ kind: "wire", path });
    } else if (d.kind === "erase") {
      const working = eraseAt(d.working, g);
      if (working !== d.working) setDrag({ kind: "erase", working });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    if (d.kind === "place") {
      const placed = addPart(circuit, d.type, d.at.x, d.at.y, placeRot);
      if (!placed) {
        showToast("There's no room for it there — parts can meet end to end but not overlap");
        return;
      }
      s.commit(placed.circuit);
      s.setTool("select");
      s.select({ kind: "part", id: placed.id });
    } else if (d.kind === "move" && d.moved) {
      const next = movePart(circuit, d.id, d.at.x, d.at.y);
      if (next) s.commit(next);
      else showToast("There's no room for it there");
    } else if (d.kind === "wire" && d.path.length > 1) {
      s.commit(addWire(circuit, d.path));
    } else if (d.kind === "erase") {
      s.commit(d.working);
    } else if (d.kind === "tap") {
      const p = circuit.parts.find((q) => q.id === d.id);
      if (!p) return;
      if (p.type === "switch") s.commit(updatePart(circuit, p.id, { closed: !p.closed }));
      else if (p.type === "fuse" && p.blown) s.commit(updatePart(circuit, p.id, { blown: false }));
      s.select({ kind: "part", id: p.id });
    }
  };

  const cursorFor = (g: { x: number; y: number }) => {
    if (running) {
      const p = partAt(circuit, g.x, g.y);
      return p && (p.type === "switch" || (p.type === "fuse" && p.blown)) ? "pointer" : p ? "default" : "default";
    }
    if (tool === "wire" || tool in PART_INFO) return "crosshair";
    if (tool === "erase") return "not-allowed";
    const pt = nearest(g);
    if (Math.hypot(g.x - pt.x, g.y - pt.y) < 0.3 && connectionPoints(circuit).has(ptKey(pt.x, pt.y))) return "crosshair";
    return partAt(circuit, g.x, g.y) ? "grab" : "default";
  };

  // ---------- actions ----------

  const deleteSelection = useCallback(() => {
    const st = useCircuit.getState();
    const sel = st.selection;
    if (!sel) return;
    st.commit(sel.kind === "part" ? removePart(st.circuit, sel.id) : removeWires(st.circuit, sel.edges));
    st.select(null);
  }, []);

  const rotateSelection = useCallback(() => {
    const st = useCircuit.getState();
    if (st.selection?.kind !== "part") return;
    const next = rotatePart(st.circuit, st.selection.id);
    if (next) st.commit(next);
    else showToast("There's no room to turn it");
  }, [showToast]);

  const changeMode = useCallback((m: Mode) => {
    const st = useCircuit.getState();
    if (m === "run") {
      // Off the scale (a circuit built from scratch, or changed a lot): make the brightest lamp full glow.
      const brightest = brightestLamp(st.circuit);
      if (brightest > 1.5 * st.circuit.glowAt || brightest < 0.1 * st.circuit.glowAt) st.amend({ ...st.circuit, glowAt: brightest });
    }
    st.setMode(m);
    setDrag(null);
  }, []);

  const loadPreset = (id: string) => {
    setPresetId(id);
    const preset = presetById(id);
    if (!preset) return;
    s.commit(preset.make());
    s.select(null);
    phase.current.clear();
  };

  const classViewRef = useRef(classView);
  classViewRef.current = classView;

  // Keyboard: undo and redo, delete, rotate, Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.isContentEditable)) return;
      const st = useCircuit.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.mode === "build" && st.selection) {
        e.preventDefault();
        deleteSelection();
      } else if (e.key.toLowerCase() === "r" && !mod && st.mode === "build") {
        if (st.selection?.kind === "part") rotateSelection();
        else if (st.tool in PART_INFO) st.setPlaceRot(st.placeRot === 0 ? 1 : 0);
      } else if (e.key === "Escape" && !classViewRef.current) {
        st.setTool("select");
        st.select(null);
        setDrag(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, rotateSelection]);

  // The class view owns the screen; Escape (or ✕) hands it back.
  const openClassView = () => {
    setClassView(true);
    void enterFullscreen();
  };
  const closeClassView = useCallback(() => {
    setClassView(false);
    void restoreWindow();
  }, []);
  useEffect(() => {
    if (!classView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  const savePng = async () => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const look: Look = {
        screen: false,
        grid: false,
        junctionDots: options.junctionDots,
        readings: withReadings ? "show" : "none",
        glow: false,
        precision: options.precision,
      };
      const scratch = document.createElement("canvas").getContext("2d");
      if (!scratch) throw new Error("No 2D canvas");
      const b = measure(scratch, circuit, solution, look);
      if (!b) {
        setStatus("There's nothing to save yet — build a circuit first.");
        return;
      }
      const scale = mm(PRINT_GRID_MM) / G;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil((b.x1 - b.x0 + 2 * PRINT_MARGIN) * scale);
      canvas.height = Math.ceil((b.y1 - b.y0 + 2 * PRINT_MARGIN) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, (PRINT_MARGIN - b.x0) * scale, (PRINT_MARGIN - b.y0) * scale);
      drawCircuit(ctx, circuit, solution, look);
      const bytes = await canvasToPng(canvas);
      const name = withReadings ? "circuit_with_readings.png" : "circuit.png";
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Circuit picture save failed", e);
      setStatus(`Could not save the picture: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveCircuit = async () => {
    const outcome = await savePluginFile({
      name: "circuit.json",
      extension: "json",
      label: "Circuit",
      bytes: new TextEncoder().encode(toFile(circuit)),
    });
    setStatus(outcome.message);
  };

  const openCircuit = async (file: File | undefined) => {
    if (!file) return;
    const c = fromFile(await file.text());
    if (!c) {
      setStatus(`${file.name} isn't a circuit saved by this tool.`);
      return;
    }
    s.commit(c);
    s.select(null);
    setStatus(`Opened ${file.name}`);
  };

  // ---------- panels ----------

  const patchSelected = (patch: Partial<Part>, key?: string) => {
    if (!selectedPart) return;
    s.commit(updatePart(circuit, selectedPart.id, patch), key ? `${selectedPart.id}:${key}` : undefined);
  };

  const r = (p: Part): PartReading | undefined => solution.parts[p.id];
  const fmt = (v: number) => readingText(v, options.precision);
  const cells = circuit.parts.filter((p) => p.type === "cell");
  const blownNow = circuit.parts.filter((p) => p.type === "fuse" && p.blown);
  const meters = circuit.parts.filter((p) => p.type === "ammeter" || p.type === "voltmeter");
  const others = circuit.parts.filter((p) => p.type !== "ammeter" && p.type !== "voltmeter" && p.type !== "cell");
  const hidden = options.hideReadings;

  const warnings: ReactNode[] = [];
  for (const id of solution.shorted) {
    const p = circuit.parts.find((q) => q.id === id)!;
    warnings.push(
      p.r > 0 ? (
        <>
          Short circuit: nothing but wire across {partName(circuit, p)}. Only its internal resistance limits the current: emf ÷ r ={" "}
          {fmt(p.emf / p.r)} A.
        </>
      ) : (
        <>Short circuit: nothing but wire across {partName(circuit, p)}. With no internal resistance the current would be enormous (shown as ∞) — a real cell would heat up and go flat.</>
      ),
    );
  }
  for (const f of blownNow) warnings.push(<>Fuse {partName(circuit, f)} has blown. Tap it to replace it (open a switch first, or it will blow again).</>);
  if (loose.length) warnings.push(<>{loose.length === 1 ? "A wire end or terminal is" : `${loose.length} wire ends or terminals are`} joined to nothing (circled in red while building).</>);
  if (!cells.length && circuit.parts.length) warnings.push(<>There's no cell, so nothing flows. Add a cell or battery.</>);
  if (!solution.settled) warnings.push(<>The diodes in this circuit never settled on a consistent state; the readings may be wrong.</>);

  const ariaSummary = useMemo(() => {
    const bits = meters.map((p) => `${p.label || PART_INFO[p.type].name} reads ${hidden || !running ? "?" : readingText(meterValue(p, solution.parts[p.id]), options.precision)} ${p.type === "ammeter" ? "A" : "V"}`);
    return `Circuit with ${circuit.parts.length} parts. ${bits.join(". ")}`;
  }, [meters, circuit.parts.length, hidden, running, solution, options.precision]);

  const modeSwitch = (
    <Segmented<Mode>
      label="Build or run"
      options={[
        { value: "build", label: "Build", icon: "build" },
        { value: "run", label: "Run", icon: "play_arrow" },
      ]}
      value={mode}
      onChange={changeMode}
    />
  );

  return (
    <div className={`circuit-builder ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="cb-controls">
          <div className="panel">
            <div className="row cb-mode-row">
              {modeSwitch}
              <span className="cb-spacer" />
              <button className="small icon-only" onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)" aria-label="Undo">
                <Icon name="undo" size={18} />
              </button>
              <button className="small icon-only" onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Y)" aria-label="Redo">
                <Icon name="redo" size={18} />
              </button>
            </div>
            <p className="muted cb-note">
              {running
                ? "Running: the meters read and the lamps glow. Tap a switch to open or close it; tap any part to change its value."
                : "Building: pick a part, then tap the grid to place it. Drag from an end to draw a wire; drop a part on a wire to cut it in."}
            </p>
            <div className="row cb-row">
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
              <button disabled={busy} onClick={() => void savePng()}>
                <Icon name="save" size={20} /> {busy ? "Saving…" : "Save PNG…"}
              </button>
            </div>
            <label className="cb-check">
              <input type="checkbox" checked={withReadings} onChange={(e) => setWithReadings(e.target.checked)} />
              Put the meter readings in the picture (for a memo)
            </label>
            <div className="row cb-row">
              <button className="small" onClick={() => void saveCircuit()}>
                <Icon name="download" size={18} /> Save circuit…
              </button>
              <button className="small" onClick={() => fileRef.current?.click()}>
                <Icon name="folder_open" size={18} /> Open circuit…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Open a saved circuit"
                onChange={(e) => {
                  void openCircuit(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            {status && <div className="cb-status muted">{status}</div>}
          </div>

          <div className="panel">
            <h3>Example circuits</h3>
            <label className="cb-field">
              <select aria-label="Example circuit" value={presetId} onChange={(e) => loadPreset(e.target.value)}>
                <option value="">Choose an example…</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {presetId && <p className="muted cb-note">{presetById(presetId)?.note}</p>}
            <p className="muted cb-note">Loading one replaces the circuit; Undo brings yours back.</p>
          </div>

          {!running && (
            <div className="panel">
              <h3>Parts</h3>
              <div className="cb-tools" role="group" aria-label="Editing tool">
                {(["select", "wire", "erase"] as Tool[]).map((t) => (
                  <button key={t} className={`small ${tool === t ? "on" : ""}`} aria-pressed={tool === t} onClick={() => s.setTool(t)}>
                    {t === "wire" ? <PaletteIcon type="wire" /> : <Icon name={t === "select" ? "arrow_selector_tool" : "ink_eraser"} size={18} />}
                    {t === "select" ? "Select" : t === "wire" ? "Wire" : "Erase"}
                  </button>
                ))}
              </div>
              <div className="cb-palette" role="group" aria-label="Add a part">
                {PART_TYPES.map((t) => (
                  <button key={t} className={`cb-palette-btn ${tool === t ? "on" : ""}`} aria-pressed={tool === t} title={PART_INFO[t].hint} onClick={() => s.setTool(tool === t ? "select" : t)}>
                    <PaletteIcon type={t} />
                    <span>{PART_INFO[t].name}</span>
                  </button>
                ))}
              </div>
              <div className="row cb-row">
                <span className="cb-field-label">New parts go</span>
                <Segmented<Rot>
                  small
                  label="Direction for new parts"
                  options={[
                    { value: 0, label: "Across" },
                    { value: 1, label: "Down" },
                  ]}
                  value={placeRot === 1 ? 1 : 0}
                  onChange={s.setPlaceRot}
                />
              </div>
              <div className="row cb-row">
                <button className="small" onClick={() => s.commit(shift(circuit, 0, -1) ?? circuit)} title="Move the whole circuit up" aria-label="Move the whole circuit up">
                  ↑
                </button>
                <button className="small" onClick={() => s.commit(shift(circuit, 0, 1) ?? circuit)} title="Move the whole circuit down" aria-label="Move the whole circuit down">
                  ↓
                </button>
                <button className="small" onClick={() => s.commit(shift(circuit, -1, 0) ?? circuit)} title="Move the whole circuit left" aria-label="Move the whole circuit left">
                  ←
                </button>
                <button className="small" onClick={() => s.commit(shift(circuit, 1, 0) ?? circuit)} title="Move the whole circuit right" aria-label="Move the whole circuit right">
                  →
                </button>
                <span className="cb-spacer" />
                <button
                  className="small danger"
                  disabled={!circuit.parts.length && !circuit.wires.length}
                  onClick={() => {
                    s.commit({ ...EMPTY, glowAt: circuit.glowAt });
                    s.select(null);
                    setPresetId("");
                  }}
                >
                  <Icon name="delete" size={18} /> Clear
                </button>
              </div>
              <p className="muted cb-note">Keys: R turns the selected part, Delete removes it, Ctrl+Z undoes, Esc goes back to Select.</p>
            </div>
          )}

          {selectedPart && (
            <PartPanel
              key={selectedPart.id}
              part={selectedPart}
              circuit={circuit}
              reading={r(selectedPart)}
              running={running}
              hidden={hidden}
              fmt={fmt}
              onPatch={patchSelected}
              onRotate={rotateSelection}
              onDelete={deleteSelection}
            />
          )}
          {selection?.kind === "wire" && !running && (
            <div className="panel">
              <h3>Wire</h3>
              <p className="muted cb-note">{selection.edges.length === 1 ? "One grid step" : `${selection.edges.length} grid steps`}, to the next junction or terminal.</p>
              <button className="small danger" onClick={deleteSelection}>
                <Icon name="delete" size={18} /> Delete the wire
              </button>
            </div>
          )}

          <div className="panel">
            <h3>Display</h3>
            <label className="cb-check">
              <input type="checkbox" checked={options.flow} onChange={(e) => s.setOptions({ flow: e.target.checked })} />
              Show the current moving while it runs
            </label>
            <label className="cb-check cb-indent">
              <input type="checkbox" checked={options.electrons} disabled={!options.flow} onChange={(e) => s.setOptions({ electrons: e.target.checked })} />
              As electron flow (− to +) instead of conventional current
            </label>
            <label className="cb-check">
              <input type="checkbox" checked={options.hideReadings} onChange={(e) => s.setOptions({ hideReadings: e.target.checked })} />
              Question mode: meters show “?” so the class predicts first
            </label>
            <label className="cb-check">
              <input type="checkbox" checked={options.grid} onChange={(e) => s.setOptions({ grid: e.target.checked })} />
              Grid dots while building
            </label>
            <label className="cb-check">
              <input type="checkbox" checked={options.junctionDots} onChange={(e) => s.setOptions({ junctionDots: e.target.checked })} />
              Dots where wires join
            </label>
            <div className="row cb-row">
              <span className="cb-field-label">Readings to</span>
              <Segmented<Precision> small label="Reading precision" options={PRECISIONS} value={options.precision} onChange={(v) => s.setOptions({ precision: v })} />
            </div>
            <NumberField
              label="A lamp glows fully at"
              unit="W"
              value={circuit.glowAt}
              min={0.001}
              max={100000}
              onChange={(v) => s.commit({ ...circuit, glowAt: v }, "glowAt")}
            />
            <button className="small" onClick={() => s.commit({ ...circuit, glowAt: brightestLamp(circuit) })}>
              Set it to the brightest lamp now
            </button>
            <p className="muted cb-note">
              A lamp's glow follows its power, P = I²R, against this. It stays fixed while you open and close switches, so a lamp that
              dims really is using less power.
            </p>
          </div>
        </div>
      )}

      <div className="cb-main">
        <div className={`cb-stage ${classView ? "class-view" : ""}`} ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="cb-canvas"
            role="img"
            aria-label={ariaSummary}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onPointerLeave={() => setHover(null)}
          />
          {classView && (
            <div className="cb-class-bar">
              {modeSwitch}
              <button onClick={() => s.setOptions({ hideReadings: !hidden })}>
                <Icon name={hidden ? "visibility" : "quiz"} size={20} /> {hidden ? "Show the readings" : "Question mode"}
              </button>
              <button onClick={() => s.setOptions({ flow: !options.flow })}>{options.flow ? "Hide the current" : "Show the current"}</button>
              <button className="icon-only" onClick={s.undo} disabled={!s.past.length} aria-label="Undo" title="Undo">
                <Icon name="undo" size={20} />
              </button>
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <div className="panel cb-memo">
            {warnings.length > 0 && (
              <ul className="cb-warnings">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <Icon name="warning" size={18} /> <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {!running ? (
              <p className="muted cb-hidden">Switch to Run to see the readings, the glow and the current. Each change is checked as you build.</p>
            ) : hidden ? (
              <p className="muted cb-hidden">Question mode: the readings are hidden. Switch it off to show the memo.</p>
            ) : (
              <>
                <h3>The memo</h3>
                {meters.length > 0 && (
                  <table className="data cb-table">
                    <thead>
                      <tr>
                        <th>Meter</th>
                        <th className="cb-right">Reading</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meters.map((p) => (
                        <tr key={p.id}>
                          <td>{partName(circuit, p)}</td>
                          <td className="cb-right cb-num">
                            {fmt(meterValue(p, r(p)))} {p.type === "ammeter" ? "A" : "V"}
                          </td>
                          <td className="muted">{meterNote(circuit, p, r(p))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {cells.map((p) => {
                  const f = cellFigures(p, r(p) ?? { I: 0, V: 0, P: 0, glow: 0, on: false, floating: false });
                  const short = Math.abs(f.current) >= SHORT_CURRENT;
                  return (
                    <dl className="cb-facts" key={p.id}>
                      <dt>{partName(circuit, p)}</dt>
                      <dd>
                        emf ε = {formatNumber(p.emf, 3)} V, internal resistance r = {formatNumber(p.r, 3)} Ω
                      </dd>
                      <dt>Current</dt>
                      <dd>I = {short ? "∞" : fmt(Math.abs(f.current))} A</dd>
                      {!short && (
                        <>
                          <dt>Terminal voltage</dt>
                          <dd>
                            V = ε − Ir = {formatNumber(p.emf, 3)} − ({fmt(Math.abs(f.current))})({formatNumber(p.r, 3)}) = {fmt(f.terminal)} V
                            {p.r > 0 && <> — {fmt(f.lost)} V are “lost” inside the cell</>}
                          </dd>
                          {Math.abs(f.current) > 1e-9 && cells.length === 1 && (
                            <>
                              <dt>External resistance</dt>
                              <dd>
                                R = V ÷ I = {fmt(f.terminal)} ÷ {fmt(Math.abs(f.current))} = {fmt(Math.abs(f.external))} Ω
                              </dd>
                            </>
                          )}
                          <dt>Power</dt>
                          <dd>
                            {fmt(Math.abs(f.total))} W made by the emf (εI); {fmt(Math.abs(r(p)?.P ?? 0))} W delivered to the circuit (VI)
                          </dd>
                        </>
                      )}
                    </dl>
                  );
                })}
                {others.length > 0 && (
                  <table className="data cb-table">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th className="cb-right">R (Ω)</th>
                        <th className="cb-right">V (V)</th>
                        <th className="cb-right">I (A)</th>
                        <th className="cb-right">P (W)</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {others.map((p) => {
                        const pr = r(p);
                        const short = !!pr && Math.abs(pr.I) >= SHORT_CURRENT;
                        return (
                          <tr key={p.id}>
                            <td>{partName(circuit, p)}</td>
                            <td className="cb-right cb-num">{resistanceText(p)}</td>
                            <td className="cb-right cb-num">{fmt(Math.abs(pr?.V ?? 0))}</td>
                            <td className="cb-right cb-num">{short ? "∞" : fmt(Math.abs(pr?.I ?? 0))}</td>
                            <td className="cb-right cb-num">{hasPower(p) ? fmt(Math.abs(pr?.P ?? 0)) : "—"}</td>
                            <td className="muted">{stateText(p, pr)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <p className="muted cb-note">
                  Ideal meters (an ammeter has no resistance, a voltmeter infinite), ohmic lamps and ideal diodes, as the exam assumes.
                  Meters show the size of the reading.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_PART: Part = {
  id: "ghost",
  type: "resistor",
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

function hasPower(p: Part) {
  return p.type === "resistor" || p.type === "lamp" || p.type === "rheostat";
}

function resistanceText(p: Part): string {
  switch (p.type) {
    case "resistor":
    case "lamp":
      return formatNumber(p.R, 3);
    case "rheostat":
      return `${formatNumber(Math.min(p.R, p.Rmax), 3)} of ${formatNumber(p.Rmax, 3)}`;
    case "switch":
      return p.closed ? "0" : "∞";
    case "fuse":
      return p.blown ? "∞" : "0";
    default:
      return "—";
  }
}

function stateText(p: Part, r: PartReading | undefined): string {
  switch (p.type) {
    case "lamp": {
      const g = r?.glow ?? 0;
      return g < 0.005 ? "out" : `lit, ${Math.round(Math.min(g, 9.99) * 100)} % of full glow`;
    }
    case "switch":
      return p.closed ? "closed" : "open";
    case "fuse":
      return p.blown ? "blown" : `intact (rated ${formatNumber(p.rating, 3)} A)`;
    case "diode":
      return r?.on && Math.abs(r.I) > 1e-9 ? "conducting" : r?.on ? "forward, no current" : "blocking";
    default:
      return "";
  }
}

/** A word on a reading a student might not expect. */
function meterNote(c: Circuit, p: Part, r: PartReading | undefined): string {
  if (!r) return "";
  if (p.type === "voltmeter") {
    if (r.floating) return "one lead is not connected to the circuit";
    return "";
  }
  if (Math.abs(r.I) >= SHORT_CURRENT) return "short circuit";
  const hasCell = c.parts.some((q) => q.type === "cell");
  return hasCell && Math.abs(r.I) < 1e-9 ? "no current: the circuit is open here, or the meter is shorted out" : "";
}

/** The selected part's values (and, while running, what it is doing). */
function PartPanel({
  part: p,
  circuit,
  reading,
  running,
  hidden,
  fmt,
  onPatch,
  onRotate,
  onDelete,
}: {
  part: Part;
  circuit: Circuit;
  reading: PartReading | undefined;
  running: boolean;
  hidden: boolean;
  fmt: (v: number) => string;
  onPatch: (patch: Partial<Part>, key?: string) => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const info = PART_INFO[p.type];
  const valued = p.type === "cell" || p.type === "resistor" || p.type === "lamp" || p.type === "rheostat" || p.type === "fuse";
  return (
    <div className="panel cb-part">
      <h3>
        {info.name}
        {p.label && (
          <>
            {" "}
            <Label text={p.label} />
          </>
        )}
      </h3>
      <p className="muted cb-note">{info.hint}.</p>
      <label className="cb-field">
        <span className="cb-field-label">Label</span>
        <input type="text" className="cb-label-input" maxLength={12} value={p.label} onChange={(e) => onPatch({ label: e.target.value }, "label")} />
      </label>
      {p.type === "cell" && (
        <>
          <NumberField label="emf" unit="V" value={p.emf} min={0} max={10000} onChange={(v) => onPatch({ emf: v }, "emf")} />
          <NumberField label="Internal resistance r" unit="Ω" value={p.r} min={0} max={1e6} onChange={(v) => onPatch({ r: v }, "r")} />
          <div className="row cb-row">
            <span className="cb-field-label">Cells drawn</span>
            <Segmented<number>
              small
              label="Cells drawn"
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
              value={p.cells}
              onChange={(v) => onPatch({ cells: v })}
            />
          </div>
        </>
      )}
      {(p.type === "resistor" || p.type === "lamp") && (
        <NumberField label="Resistance" unit="Ω" value={p.R} min={0} max={1e7} onChange={(v) => onPatch({ R: v }, "R")} />
      )}
      {p.type === "rheostat" && (
        <>
          <div className="cb-slider">
            <div className="cb-slider-head">
              <span className="cb-field-label">Set to</span>
              <span className="cb-num">{formatNumber(Math.min(p.R, p.Rmax), 2)} Ω</span>
            </div>
            <input
              type="range"
              aria-label="Rheostat setting"
              min={0}
              max={p.Rmax}
              step={p.Rmax / 200 || 0.1}
              value={Math.min(p.R, p.Rmax)}
              onChange={(e) => onPatch({ R: parseFloat(e.target.value) }, "R")}
            />
          </div>
          <NumberField label="Largest resistance" unit="Ω" value={p.Rmax} min={0.01} max={1e7} onChange={(v) => onPatch({ Rmax: v, R: Math.min(p.R, v) }, "Rmax")} />
        </>
      )}
      {p.type === "switch" && (
        <div className="row cb-row">
          <span className="cb-field-label">Switch</span>
          <Segmented<string>
            small
            label="Switch position"
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
            value={p.closed ? "closed" : "open"}
            onChange={(v) => onPatch({ closed: v === "closed" })}
          />
        </div>
      )}
      {p.type === "fuse" && (
        <>
          <NumberField label="Rating" unit="A" value={p.rating} min={0.001} max={10000} onChange={(v) => onPatch({ rating: v }, "rating")} />
          {p.blown && (
            <button className="small" onClick={() => onPatch({ blown: false })}>
              Replace the fuse
            </button>
          )}
        </>
      )}
      {valued && (
        <label className="cb-check">
          <input type="checkbox" checked={p.showValue} onChange={(e) => onPatch({ showValue: e.target.checked })} />
          Print the value on the diagram
        </label>
      )}
      {!running && (
        <div className="row cb-row">
          <button className="small" onClick={onRotate} title="Turn it a quarter (R)">
            <Icon name="rotate_right" size={18} /> Turn
          </button>
          <button className="small" onClick={() => onPatch({ flip: !p.flip })} title="Put the label on the other side">
            <Icon name="swap_horiz" size={18} /> Label side
          </button>
          <button className="small danger" onClick={onDelete} title="Delete (Del)">
            <Icon name="delete" size={18} /> Delete
          </button>
        </div>
      )}
      {running && reading && !hidden && (
        <dl className="cb-facts cb-live">
          {p.type === "ammeter" && (
            <>
              <dt>Reading</dt>
              <dd>{fmt(Math.abs(reading.I))} A</dd>
            </>
          )}
          {p.type === "voltmeter" && (
            <>
              <dt>Reading</dt>
              <dd>{fmt(Math.abs(reading.V))} V</dd>
            </>
          )}
          {p.type !== "ammeter" && p.type !== "voltmeter" && (
            <>
              <dt>Current</dt>
              <dd>{Math.abs(reading.I) >= SHORT_CURRENT ? "∞" : fmt(Math.abs(reading.I))} A</dd>
              <dt>{p.type === "cell" ? "Terminal voltage" : "Voltage across"}</dt>
              <dd>{fmt(Math.abs(reading.V))} V</dd>
            </>
          )}
          {hasPower(p) && (
            <>
              <dt>Power</dt>
              <dd>
                {fmt(reading.P)} W{p.type === "lamp" ? ` — ${stateText(p, reading)}` : ""}
              </dd>
            </>
          )}
        </dl>
      )}
      {circuit.parts.length > 0 && running && <p className="muted cb-note">Changes here are live.</p>}
    </div>
  );
}
