import { PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatFixed, formatNumber, formatSigFigs } from "../numbers";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { APP_H, APP_W, Across, END_VIEW, GRAPH_H, GRAPH_W, drawApparatus, drawGraphs } from "./drawing";
import { GenParams, Kind, StartPlane, angleStep, degrees, drive, driveOmega, flux, fluxRate, outputEmf, peakEmf, position, sample, turned } from "./generator";
import { GenOptions, GenState, GraphAxis, useGenerator } from "./generatorStore";
import "./generator.css";

const WINDOWS = [1, 2, 4, 8].map((s) => ({ value: s, label: `${s} s` }));
const TURNS = [
  { value: 1, label: "1 turn" },
  { value: 2, label: "2 turns" },
];

/** How far the coil has turned since this sweep began, in degrees, in the direction it is set to turn. */
function turnedNow(st: Pick<GenState, "params" | "samples" | "theta">): number {
  return st.samples.length ? turned(st.params.clockwise, st.samples[0].theta, st.theta) : 0;
}

/** What the graphs are plotted against, for drawing them. */
function acrossFor(p: GenParams, o: GenOptions, heldClockwise: boolean): Across {
  return o.axis === "angle" ? { kind: "angle", span: 360 * o.turns, clockwise: p.clockwise, heldClockwise } : { kind: "time", window: o.window };
}

/** Has this sweep reached the end of the graphs? */
function sweepDone(st: Pick<GenState, "params" | "samples" | "theta" | "t" | "options">): boolean {
  return st.options.axis === "angle" ? Math.abs(turnedNow(st)) >= 360 * st.options.turns - 1e-6 : st.t >= st.options.window - 1e-9;
}
/** The saved pictures: millimetres per scene unit (about 15 cm wide). */
const PRINT_MM_PER_UNIT = 0.15;

const signed = (v: number, dp = 2) => formatFixed(v, dp).replace(/^-/, "−");
/** A value to 3 significant figures with the true minus sign. */
const sig = (v: number) => (Math.abs(v) < 1e-12 ? "0" : formatSigFigs(v, 3).replace(/^-/, "−"));

function parseInput(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  slider = false,
  onChange,
}: {
  label: ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  slider?: boolean;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null ? null : parseInput(draft);
  const bad = draft !== null && (n === null || n < min || n > max);
  const name = typeof label === "string" ? label : "";
  return (
    <div className="gen-field">
      <div className="gen-field-head">
        <span className="gen-field-label">{label}</span>
        <span className="gen-number">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${name} in ${unit}`.trim()}
            aria-invalid={bad}
            className={bad ? "gen-bad" : ""}
            value={draft ?? formatNumber(value, 3)}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = parseInput(e.target.value);
              if (v !== null && v >= min && v <= max) onChange(v);
            }}
            onBlur={() => setDraft(null)}
          />
          <span className="muted">{unit}</span>
        </span>
      </div>
      {slider && (
        <input type="range" aria-label={`${name} slider`} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      )}
    </div>
  );
}

/** Size a canvas to its box at the scene's shape (as wide as the box, or as big as fits it both ways) and clear it to white. */
function sizeCanvas(canvas: HTMLCanvasElement, sceneW: number, sceneH: number, fitHeight: boolean): CanvasRenderingContext2D | null {
  const box = canvas.parentElement?.getBoundingClientRect();
  if (!box || box.width < 2) return null;
  let cssW = box.width;
  if (fitHeight && box.height > 2) cssW = Math.min(cssW, (box.height * sceneW) / sceneH);
  const cssH = (cssW * sceneH) / sceneW;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(w / sceneW, 0, 0, h / sceneH, 0, 0);
  return ctx;
}

/** Where the coil is, in words, and what that means for the flux and the emf. */
function positionText(theta: number): string {
  switch (position(theta)) {
    case "perpendicular":
      return "The plane of the coil is perpendicular to the field: the flux through it is a maximum, but for that moment it isn't changing — ΔΦ/Δt and the emf are zero.";
    case "parallel":
      return "The plane of the coil is parallel to the field: no flux passes through it, but the flux is changing fastest — ΔΦ/Δt and the emf are at their largest.";
    default:
      return "Between the two: the flux and its rate of change are both part-way, one growing as the other shrinks.";
  }
}

/**
 * Generator: turn the coil — by hand on the crank, or steadily — and watch
 * the flux, its rate of change and the induced emf drawn against time.
 */
export default function GeneratorView() {
  const { showToast } = useAppPick("showToast");
  const s = useGenerator();
  const { params: p, theta, t, omega, running, options: o } = s;
  const appRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
  const [classView, setClassView] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // ---------- turning ----------

  /** While the crank is held: the angle the hand has put it at. */
  const hand = useRef<{ theta: number; pointer: number } | null>(null);
  const classViewNow = useRef(false);
  classViewNow.current = classView;
  const dirty = useRef(true);
  dirty.current = true;

  useEffect(() => {
    const onResize = () => (dirty.current = true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useGenerator.getState();
      const window = st.options.window;
      let moved = false;
      if (hand.current) {
        // By hand: the coil follows the crank a moment behind it, like a coil with a little inertia, so
        // uneven pointer events don't make it jump; ω is how fast it actually turned, lightly smoothed.
        const target = st.theta + (hand.current.theta - st.theta) * (1 - Math.exp(-dt / 0.05));
        const raw = dt > 0 ? (target - st.theta) / dt : 0;
        const w = st.omega + (raw - st.omega) * (1 - Math.exp(-dt / 0.04));
        let t1 = st.t + dt;
        const past =
          st.options.axis === "angle" ? Math.abs(turned(st.params.clockwise, st.samples[0]?.theta ?? st.theta, target)) > 360 * st.options.turns : t1 > window;
        if (past) {
          st.newSweep();
          t1 = dt;
        }
        const fresh = useGenerator.getState();
        fresh.advance(target, t1, w, [sample(fresh.params, t1, target, w)]);
        moved = true;
      } else if (st.running) {
        let t0 = st.t;
        let left = dt;
        let th = st.theta;
        const byAngle = st.options.axis === "angle";
        const degPerSecond = 360 * st.params.speed;
        while (left > 1e-9) {
          // Up to the end of the graphs: a time, or (against the angle) the time to finish the turns.
          const now = useGenerator.getState();
          const toEnd = byAngle ? (360 * st.options.turns - turned(st.params.clockwise, now.samples[0]?.theta ?? th, th)) / degPerSecond : window - t0;
          const span = Math.min(left, Math.max(0, toEnd));
          if (span <= 1e-9) {
            if (st.options.pauseAtEnd) {
              useGenerator.getState().setRunning(false);
              break;
            }
            useGenerator.getState().newSweep();
            t0 = 0;
            if (byAngle && degPerSecond <= 0) break;
            continue;
          }
          const step = drive(st.params, t0, th, span);
          th = step.theta;
          t0 += span;
          left -= span;
          useGenerator.getState().advance(th, t0, driveOmega(st.params), step.samples);
        }
        moved = true;
      }
      if (!moved && !dirty.current) return;
      dirty.current = false;
      draw();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const draw = () => {
    const st = useGenerator.getState();
    const fit = classViewNow.current;
    const peak = peakEmf(st.params);
    const scaleMax = Math.max(peak, ...st.samples.map((x) => Math.abs(x.emf)));
    const app = appRef.current && sizeCanvas(appRef.current, APP_W, APP_H, fit);
    if (app) drawApparatus(app, st.params, st.theta, st.omega, outputEmf(st.params, st.theta, st.omega), scaleMax, { screen: true, current: st.options.current, normal: st.options.normal });
    // Shown to the class, the graphs take the screen's height: each one taller.
    const graphH = fit ? 1000 : GRAPH_H;
    const graph = graphRef.current && sizeCanvas(graphRef.current, GRAPH_W, graphH, fit);
    if (graph) {
      const w = Math.abs(driveOmega(st.params));
      drawGraphs(
        graph,
        acrossFor(st.params, st.options, st.heldClockwise),
        st.options.axis === "angle" ? turnedNow(st) : st.t,
        st.samples,
        st.held,
        { flux: st.params.field * st.params.area, rate: st.params.field * st.params.area * w, emf: peak },
        { screen: true, values: st.options.values, markers: st.options.markers },
        graphH,
      );
    }
  };

  // The crank: grab it anywhere in the view along the axis and turn.
  const toScene = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * APP_W, y: ((e.clientY - rect.top) / rect.height) * APP_H };
  };
  const pointerAngle = (pt: { x: number; y: number }) => Math.atan2(-(pt.y - END_VIEW.cy), pt.x - END_VIEW.cx) - Math.PI / 2;
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = toScene(e);
    if (Math.hypot(pt.x - END_VIEW.cx, pt.y - END_VIEW.cy) > END_VIEW.reach + 60) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const st = useGenerator.getState();
    st.setRunning(false);
    // The coil turns by as much as the hand does, from where it is — grabbing it doesn't make it jump.
    hand.current = { theta: st.theta, pointer: pointerAngle(pt) };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pt = toScene(e);
    const near = Math.hypot(pt.x - END_VIEW.cx, pt.y - END_VIEW.cy) <= END_VIEW.reach + 60;
    e.currentTarget.style.cursor = hand.current ? "grabbing" : near ? "grab" : "default";
    if (!hand.current) return;
    const a = pointerAngle(pt);
    hand.current = { theta: hand.current.theta + angleStep(hand.current.pointer, a), pointer: a };
  };
  const onPointerUp = () => {
    if (!hand.current) return;
    hand.current = null;
    const st = useGenerator.getState();
    st.advance(st.theta, st.t, 0, []);
  };

  // ---------- actions ----------

  const run = () => {
    if (!running && sweepDone(useGenerator.getState())) s.newSweep();
    s.setRunning(!running);
  };
  const compareHalf = () => {
    s.hold(`${formatNumber(p.speed, 2)} rev·s⁻¹`);
    s.setParams({ speed: p.speed / 2 });
    s.reset();
    s.setRunning(true);
  };

  const openClassView = () => {
    setClassView(true);
    void enterFullscreen();
  };
  const closeClassView = useCallback(() => {
    setClassView(false);
    void restoreWindow();
  }, []);
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
  useEffect(() => {
    if (!classView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  /** Save the generator or the graphs in black and white at 300 dpi. */
  const save = async (what: "apparatus" | "graphs") => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const [W, H] = what === "apparatus" ? [APP_W, APP_H] : [GRAPH_W, GRAPH_H];
      const scale = mm(PRINT_MM_PER_UNIT);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const peak = peakEmf(p);
      if (what === "apparatus") {
        drawApparatus(ctx, p, theta, omega, outputEmf(p, theta, omega), peak, { screen: false, current: o.current, normal: o.normal });
      } else {
        const w = Math.abs(driveOmega(p));
        drawGraphs(ctx, acrossFor(p, o, s.heldClockwise), o.axis === "angle" ? turnedNow(s) : t, s.samples, s.held, { flux: p.field * p.area, rate: p.field * p.area * w, emf: peak }, { screen: false, values: o.values, markers: false });
      }
      const bytes = await canvasToPng(canvas);
      const name = what === "apparatus" ? `${p.kind}_generator.png` : `${p.kind}_generator_graphs.png`;
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Generator picture save failed", e);
      setStatus(`Could not save the picture: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- panels ----------

  const ac = p.kind === "ac";
  const w = Math.abs(driveOmega(p));
  const out = outputEmf(p, theta, omega);
  const readouts = (
    <div className="gen-readouts">
      <div className="gen-readout">
        <span className="gen-readout-label">θ (B to the normal)</span>
        <span className="gen-readout-value">{Math.round(degrees(theta))}°</span>
      </div>
      <div className="gen-readout">
        <span className="gen-readout-label">Turned</span>
        <span className="gen-readout-value">{Math.round(turnedNow(s))}°</span>
      </div>
      <div className="gen-readout">
        <span className="gen-readout-label">Φ</span>
        <span className="gen-readout-value">{sig(flux(p, theta))} Wb</span>
      </div>
      <div className="gen-readout">
        <span className="gen-readout-label">ΔΦ/Δt</span>
        <span className="gen-readout-value">{sig(fluxRate(p, theta, omega))} Wb·s⁻¹</span>
      </div>
      <div className="gen-readout">
        <span className="gen-readout-label">emf (X to Y)</span>
        <span className="gen-readout-value">{signed(out)} V</span>
      </div>
    </div>
  );
  const runButton = (
    <button className={running ? "" : "primary"} onClick={run}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Stop" : "Turn it"}
    </button>
  );

  return (
    <div className={`generator ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="gen-controls">
          <div className="panel">
            <div className="row">
              {runButton}
              <button onClick={s.reset}>
                <Icon name="restart_alt" size={20} /> Reset
              </button>
            </div>
            <p className="muted gen-note">Turn it steadily with the button, or drag the crank in the view along the axis to turn it by hand — fast, slow, backwards, or not at all.</p>
            <NumberField label="Speed" unit="rev·s⁻¹" value={p.speed} min={0.05} max={10} step={0.05} slider onChange={(v) => s.setParams({ speed: v })} />
            <div className="row gen-row">
              <span className="gen-field-label">Direction</span>
              <Segmented
                small
                label="Direction of turning"
                options={[
                  { value: "cw", label: "Clockwise" },
                  { value: "acw", label: "Anticlockwise" },
                ]}
                value={p.clockwise ? "cw" : "acw"}
                onChange={(v) => s.setParams({ clockwise: v === "cw" })}
              />
            </div>
            <div className="row gen-row">
              <button onClick={compareHalf} disabled={s.samples.length < 2} title="Keep these graphs dashed, halve the speed and turn it again">
                Compare at half speed
              </button>
            </div>
            <div className="row gen-row">
              <button className="small" onClick={() => s.hold(`${formatNumber(p.speed, 2)} rev·s⁻¹`)} disabled={s.samples.length < 2}>
                Keep these graphs (dashed)
              </button>
              {s.held && (
                <button className="small" onClick={s.clearHeld}>
                  Clear the dashed graphs
                </button>
              )}
            </div>
            {s.held && <p className="muted gen-note">Dashed: the graphs at {s.heldLabel}.</p>}
            <div className="row gen-row">
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
            <div className="row gen-row">
              <button className="small" disabled={busy} onClick={() => void save("apparatus")}>
                <Icon name="save" size={18} /> Save the generator…
              </button>
              <button className="small" disabled={busy} onClick={() => void save("graphs")}>
                <Icon name="save" size={18} /> Save the graphs…
              </button>
            </div>
            {status && <div className="gen-status muted">{status}</div>}
          </div>

          <div className="panel">
            <h3>The generator</h3>
            <div className="gen-seg">
              <Segmented<Kind>
                small
                label="Kind of generator"
                options={[
                  { value: "ac", label: "AC: slip rings" },
                  { value: "dc", label: "DC: commutator" },
                ]}
                value={p.kind}
                onChange={(v) => s.setParams({ kind: v })}
              />
            </div>
            <div className="gen-field-label gen-start-label">At the start, the plane of the coil is</div>
            <div className="gen-seg">
              <Segmented<StartPlane>
                small
                label="Starting position"
                options={[
                  { value: "parallel", label: "Parallel to B" },
                  { value: "perpendicular", label: "Perpendicular to B" },
                ]}
                value={p.start}
                onChange={(v) => s.setParams({ start: v })}
              />
            </div>
            <NumberField label="Turns, N" unit="" value={p.turns} min={1} max={10000} step={1} onChange={(v) => s.setParams({ turns: Math.round(v) })} />
            <NumberField label="Field, B" unit="T" value={p.field} min={0.001} max={5} step={0.01} slider onChange={(v) => s.setParams({ field: v })} />
            <NumberField label="Area of the coil, A" unit="m²" value={p.area} min={0.0001} max={1} step={0.001} onChange={(v) => s.setParams({ area: v })} />
          </div>

          <div className="panel">
            <h3>Display</h3>
            <div className="row gen-row">
              <span className="gen-field-label">Plot against</span>
              <Segmented<GraphAxis>
                small
                label="Plot the graphs against"
                options={[
                  { value: "time", label: "Time" },
                  { value: "angle", label: "Angle of rotation" },
                ]}
                value={o.axis}
                onChange={(v) => {
                  s.setOptions({ axis: v });
                  s.newSweep();
                }}
              />
            </div>
            <div className="row gen-row">
              <span className="gen-field-label">Across the graphs</span>
              {o.axis === "angle" ? (
                <Segmented<number> small label="Turns across the graphs" options={TURNS} value={o.turns} onChange={(v) => s.setOptions({ turns: v })} />
              ) : (
                <Segmented<number> small label="Time across the graphs" options={WINDOWS} value={o.window} onChange={(v) => s.setOptions({ window: v })} />
              )}
            </div>
            <label className="gen-check">
              <input type="checkbox" checked={o.pauseAtEnd} onChange={(e) => s.setOptions({ pauseAtEnd: e.target.checked })} />
              Stop when the graphs are full
            </label>
            <label className="gen-check">
              <input type="checkbox" checked={o.values} onChange={(e) => s.setOptions({ values: e.target.checked })} />
              Numbers on the axes
            </label>
            <label className="gen-check">
              <input type="checkbox" checked={o.markers} onChange={(e) => s.setOptions({ markers: e.target.checked })} />
              Mark where the coil is perpendicular (⊥) or parallel (∥) to the field
            </label>
            <label className="gen-check">
              <input type="checkbox" checked={o.current} onChange={(e) => s.setOptions({ current: e.target.checked })} />
              Show the induced current on the coil
            </label>
            <label className="gen-check">
              <input type="checkbox" checked={o.normal} onChange={(e) => s.setOptions({ normal: e.target.checked })} />
              Show the normal and θ in the view along the axis
            </label>
          </div>
        </div>
      )}

      <div className="gen-main">
        <div className={`gen-board ${classView ? "class-view" : ""}`}>
          <div className="gen-app-box">
            <canvas
              ref={appRef}
              className="gen-app"
              role="img"
              aria-label={`${ac ? "AC" : "DC"} generator; the coil is at θ = ${Math.round(degrees(theta))}°`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
          <div className="gen-graph-box">
            <canvas ref={graphRef} className="gen-graph" role="img" aria-label="Flux, rate of change of flux and emf against time" />
          </div>
          {readouts}
          {classView && (
            <div className="gen-class-bar">
              {runButton}
              <button onClick={s.reset}>
                <Icon name="restart_alt" size={20} /> Reset
              </button>
              <button onClick={compareHalf} disabled={s.samples.length < 2}>
                Half speed
              </button>
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <div className="panel gen-notes">
            <h3>What is happening</h3>
            <p className="gen-now">{positionText(theta)}</p>
            <dl className="gen-facts">
              <dt>Flux</dt>
              <dd>
                Φ = BA cos θ, with θ the angle between B and the normal to the coil. Here BA = ({formatNumber(p.field, 3)})({formatNumber(p.area, 4)}) ={" "}
                {sig(p.field * p.area)} Wb, so Φ swings between ±{sig(p.field * p.area)} Wb.
              </dd>
              <dt>Faraday's law</dt>
              <dd>
                The emf induced is directly proportional to the rate of change of magnetic flux (flux linkage): emf = −N ΔΦ/Δt. So the emf
                graph is the ΔΦ/Δt graph turned upside down and multiplied by N — largest where Φ is passing through zero, zero where Φ
                is largest.
              </dd>
              <dt>Lenz's law</dt>
              <dd>The induced current flows in a direction so as to set up a magnetic field to oppose the change in magnetic flux — hence the minus sign.</dd>
              <dt>The peak emf</dt>
              <dd>
                NBAω = ({formatNumber(p.turns, 0)})({formatNumber(p.field, 3)})({formatNumber(p.area, 4)})(2π × {formatNumber(p.speed, 2)}) ={" "}
                {signed(peakEmf(p))} V at {formatNumber(p.speed, 2)} rev·s⁻¹; one turn takes T = {sig(1 / p.speed)} s. Turn it at half the speed
                and the peak halves; against time the period doubles, but against the angle of rotation it stays one cycle per 360°.
              </dd>
              <dt>{ac ? "Slip rings" : "The commutator"}</dt>
              <dd>
                {ac
                  ? "Each end of the coil stays joined to the same brush, so the emf across X and Y reverses every half turn: alternating current."
                  : "The split ring swaps the coil's connections to the brushes every half turn, just as the coil passes perpendicular to the field and its emf is zero — so the emf across X and Y never reverses: direct current that pulses between zero and its peak."}
              </dd>
            </dl>
            <p className="muted gen-note">
              The papers ask for these graphs' shapes, not values (Φ = BA cos θ and Faraday's law are qualitative in the SAG); the numbers are
              there to compare. ω = 2π × {formatNumber(p.speed, 2)} = {signed(w)} rad·s⁻¹.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
