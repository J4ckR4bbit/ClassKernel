import { Fragment, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatFixed, formatNumber } from "../numbers";
import { prefersReducedMotion } from "../../lib/motion";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import {
  Arrangement,
  GRAPH_H,
  GRAPH_W,
  LabelStyle,
  Layout,
  SKETCH_H,
  SKETCH_W,
  drawFbds,
  drawGraph,
  drawSketch,
  easeLayout,
  fbdScene,
  layoutFor,
} from "./drawing";
import { EXAMPLES, exampleById } from "./examples";
import { memo, subscriptRuns } from "./memo";
import { G, clampStart, cutString, forces, slipAngle, stateText, step } from "./slope";
import { Speed, useSlope } from "./slopeStore";
import "./slope.css";

const SPEEDS: Array<{ value: Speed; label: string }> = [
  { value: 0.25, label: "×¼" },
  { value: 0.5, label: "×½" },
  { value: 1, label: "×1" },
];

/** How fast Tilt raises the slope, degrees a second. */
const TILT_RATE = 4;
/** v–t samples every this many seconds of the motion. */
const SAMPLE_EVERY = 0.04;
/** The saved sketch: millimetres per scene unit, so it prints about 12 cm wide. */
const PRINT_MM_PER_UNIT = 0.12;

/** "F_{g∥}" with real subscripts. */
function Sub({ text }: { text: string }) {
  return (
    <>
      {subscriptRuns(text).map(([t, sub], i) => (sub ? <sub key={i}>{t}</sub> : <Fragment key={i}>{t}</Fragment>))}
    </>
  );
}

function parseInput(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, "").replace(",", ".").replace("−", "-");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** A number typed either way (2,5 or 2.5), with a slider under it when there is a sensible range. */
function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  slider = false,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  slider?: boolean;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null ? null : parseInput(draft);
  const bad = draft !== null && (n === null || n < min || n > max);
  const name = typeof label === "string" ? label : "";
  return (
    <div className="sl-field">
      <div className="sl-field-head">
        <span className="sl-field-label">{label}</span>
        <span className="sl-number">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${name} in ${unit}`.trim()}
            aria-invalid={bad}
            className={bad ? "sl-bad" : ""}
            disabled={disabled}
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
        <input
          type="range"
          aria-label={`${name} slider`}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      )}
    </div>
  );
}

/**
 * Size a canvas to its box at the scene's shape — as wide as the box, or,
 * when `fitHeight`, as big as fits both ways — with its pixels matched to the
 * screen, and clear it to white in scene units.
 */
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

const n2 = (v: number) => formatFixed(v, 2).replace(/^-/, "−");

/**
 * Block on a slope: set up a slope question, run it, and watch the block stay
 * put or move — with its free-body diagrams, the v–t graph and the memo.
 */
export default function SlopeSimulator() {
  const { showToast } = useAppPick("showToast");
  const s = useSlope();
  const { params: p, motion: m, running, tilting, speed, options: o } = s;
  const sketchRef = useRef<HTMLCanvasElement | null>(null);
  const fbdRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
  const [classView, setClassView] = useState(false);
  const [slipped, setSlipped] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const f = useMemo(() => forces(p, m), [p, m]);
  const steps = useMemo(() => memo(p, f, m), [p, f, m]);
  const q = o.question;

  // ---------- the loop ----------

  const layout = useRef<Layout | null>(null);
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
    let nextSample = 0;
    let restFor = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useSlope.getState();
      let busyFrame = false;
      if (st.running) {
        busyFrame = true;
        const sim = dt * st.speed;
        const next = step(st.params, st.motion, sim);
        // At rest with nothing falling: after a couple of seconds there is nothing more to see.
        const still = Math.abs(next.v) < 1e-9 && forces(st.params, next).state === "rest" && !(next.cut && next.hangV > 0);
        restFor = still ? restFor + sim : 0;
        const sample = next.t >= nextSample || !!next.ended || (Math.abs(next.v) < 1e-9) !== (Math.abs(st.motion.v) < 1e-9);
        if (sample) nextSample = next.t + SAMPLE_EVERY;
        st.setMotion(next, sample);
        if (next.ended || restFor > 2) st.setRunning(false);
      } else if (st.tilting) {
        busyFrame = true;
        const from = st.params.angle;
        const to = Math.min(80, from + TILT_RATE * dt * st.speed);
        const slip = slipAngle({ ...st.params, angle: from }, from);
        if (slip !== null && slip <= to) {
          // It slips: stop tilting just past the angle, and let it go.
          const angle = Math.ceil(slip * 10 + 1e-9) / 10;
          st.setParams({ angle });
          st.setTilting(false);
          st.setRunning(true);
          setSlipped(slip);
        } else if (to >= 80) {
          st.setParams({ angle: 80 });
          st.setTilting(false);
        } else st.setParams({ angle: to });
      }
      const target = layoutFor(st.params);
      layout.current = layout.current ? easeLayout(layout.current, target, prefersReducedMotion() ? 1 : 1 - Math.exp(-dt * 8)) : target;
      const settling = Math.abs(layout.current.scale - target.scale) > 0.01 || Math.abs(layout.current.ox - target.ox) > 0.1;
      if (!busyFrame && !settling && !dirty.current) return;
      dirty.current = false;
      const fNow = forces(st.params, st.motion);
      const fit = classViewNow.current;
      const sketch = sketchRef.current && sizeCanvas(sketchRef.current, SKETCH_W, SKETCH_H, fit);
      if (sketch) {
        drawSketch(sketch, st.params, st.motion, fNow, layout.current, {
          screen: true,
          angleValue: st.options.angleValue,
          forces: st.options.forcesInPicture,
          velocity: st.options.velocity,
          labels: st.options.labels,
          question: st.options.question,
        });
      }
      const arrangement: Arrangement = fit ? "column" : "row";
      const scene = fbdScene(st.params, arrangement);
      const fbd = fbdRef.current && sizeCanvas(fbdRef.current, scene.w, scene.h, fit);
      if (fbd) drawFbds(fbd, st.params, fNow, st.motion, { screen: true, labels: st.options.labels, sizes: st.options.sizes && !st.options.question }, arrangement);
      const graph = graphRef.current && sizeCanvas(graphRef.current, GRAPH_W, GRAPH_H, false);
      if (graph) drawGraph(graph, st.samples, true, st.options.question);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ---------- actions ----------

  const run = () => {
    if (m.ended) s.reset();
    setSlipped(null);
    s.setRunning(!running);
  };
  const reset = () => {
    s.reset();
    setSlipped(null);
  };
  const tilt = () => {
    if (tilting) return s.setTilting(false);
    setSlipped(null);
    s.reset();
    s.setTilting(true);
  };
  const cut = () => {
    s.setMotion(cutString(p, m), true);
    if (!running) s.setRunning(true);
  };
  const loadExample = (id: string) => {
    const e = exampleById(id);
    if (!e) return;
    setSlipped(null);
    s.load(e.params, id);
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

  /** Save one of the pictures in black and white at 300 dpi. */
  const save = async (what: "sketch" | "fbd") => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const scene = fbdScene(p, "row");
      const [W, H] = what === "sketch" ? [SKETCH_W, SKETCH_H] : [scene.w, scene.h];
      const scale = mm(PRINT_MM_PER_UNIT);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const start = { ...m };
      if (what === "sketch") {
        drawSketch(ctx, p, start, f, layoutFor(p), { screen: false, angleValue: o.angleValue, forces: false, velocity: false, labels: o.labels, question: o.question });
      } else {
        drawFbds(ctx, p, f, m, { screen: false, labels: o.labels, sizes: o.sizes && !o.question });
      }
      const bytes = await canvasToPng(canvas);
      const name = what === "sketch" ? `slope_${formatNumber(p.angle, 1).replace(",", "_")}deg.png` : "slope_free_body_diagrams.png";
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Slope picture save failed", e);
      setStatus(`Could not save the picture: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- panels ----------

  const pulley = p.setup === "pulley";
  const example = exampleById(s.exampleId);
  const displacement = m.x - clampStart(p);
  const muSWarn = !p.frictionless && p.muK > p.muS;

  const runButton = (
    <button className={running ? "" : "primary"} onClick={run} disabled={tilting}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Pause" : m.ended ? "Run again" : m.t > 0 ? "Carry on" : "Run"}
    </button>
  );
  const tiltButton = !pulley && (
    <button onClick={tilt} disabled={running} title="Raise the angle slowly until the block slips">
      <Icon name="rotate_right" size={20} /> {tilting ? "Stop tilting" : "Tilt until it slips"}
    </button>
  );
  const cutButton = pulley && (
    <button onClick={cut} disabled={m.cut} title="Cut the string between the block and the hanging mass">
      <Icon name="content_cut" size={20} /> {m.cut ? "String cut" : "Cut the string"}
    </button>
  );

  const readouts = (
    <div className="sl-readouts">
      <div className="sl-readout">
        <span className="sl-readout-label">t</span>
        <span className="sl-readout-value">{n2(m.t)} s</span>
      </div>
      <div className="sl-readout">
        <span className="sl-readout-label">Δx (up +)</span>
        <span className="sl-readout-value">{q ? "?" : `${n2(displacement)} m`}</span>
      </div>
      <div className="sl-readout">
        <span className="sl-readout-label">v (up +)</span>
        <span className="sl-readout-value">{q ? "?" : `${n2(m.v)} m·s⁻¹`}</span>
      </div>
      <div className="sl-readout">
        <span className="sl-readout-label">a (up +)</span>
        <span className="sl-readout-value">{q ? "?" : `${n2(f.a)} m·s⁻²`}</span>
      </div>
      <div className="sl-readout sl-state">
        <span className="sl-readout-label">The block</span>
        <span className="sl-readout-value small-value">{q && m.t === 0 ? "Will it move?" : stateText(f, m, p)}</span>
      </div>
    </div>
  );

  return (
    <div className={`slope-sim ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="sl-controls">
          <div className="panel">
            <div className="row">
              {runButton}
              <button onClick={reset} disabled={m.t === 0 && !tilting && m.v === p.v0}>
                <Icon name="restart_alt" size={20} /> Reset
              </button>
            </div>
            <div className="row sl-row">
              {tiltButton}
              {cutButton}
            </div>
            <div className="row sl-row">
              <span className="sl-field-label">Speed</span>
              <Segmented small label="Running speed" options={SPEEDS} value={speed} onChange={s.setSpeed} />
            </div>
            <div className="row sl-row">
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
            <div className="row sl-row">
              <button className="small" disabled={busy} onClick={() => void save("sketch")}>
                <Icon name="save" size={18} /> Save the sketch…
              </button>
              <button className="small" disabled={busy} onClick={() => void save("fbd")}>
                <Icon name="save" size={18} /> Save the diagrams…
              </button>
            </div>
            {status && <div className="sl-status muted">{status}</div>}
          </div>

          <div className="panel">
            <h3>Examples</h3>
            <select aria-label="Example" className="sl-select" value={s.exampleId} onChange={(e) => loadExample(e.target.value)}>
              <option value="">Choose an example…</option>
              {EXAMPLES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {example && (
              <p className="muted sl-note">
                <Sub text={example.note} />
              </p>
            )}
          </div>

          <div className="panel">
            <h3>The slope</h3>
            <div className="sl-seg">
              <Segmented
                small
                label="Set-up"
                options={[
                  { value: "block", label: "Block on its own" },
                  { value: "pulley", label: "With a hanging mass" },
                ]}
                value={p.setup}
                onChange={(v) => s.setParams({ setup: v })}
              />
            </div>
            <NumberField label="Angle θ" unit="°" value={p.angle} min={0} max={80} step={0.5} slider disabled={tilting} onChange={(v) => s.setParams({ angle: v })} />
            <NumberField label="Mass of the block" unit="kg" value={p.mass} min={0.1} max={100} step={0.1} slider onChange={(v) => s.setParams({ mass: v })} />
            {pulley && (
              <NumberField label="Hanging mass" unit="kg" value={p.hangingMass} min={0.1} max={100} step={0.1} slider onChange={(v) => s.setParams({ hangingMass: v })} />
            )}
            <label className="sl-check">
              <input type="checkbox" checked={p.frictionless} onChange={(e) => s.setParams({ frictionless: e.target.checked })} />
              Frictionless
            </label>
            {!p.frictionless && (
              <>
                <NumberField label="μₛ (static)" unit="" value={p.muS} min={0} max={1.5} step={0.01} slider onChange={(v) => s.setParams({ muS: v })} />
                <NumberField label="μₖ (kinetic)" unit="" value={p.muK} min={0} max={1.5} step={0.01} slider onChange={(v) => s.setParams({ muK: v })} />
                {muSWarn && <p className="sl-warn">μₖ is usually smaller than μₛ: a block slides more easily than it starts.</p>}
              </>
            )}
          </div>

          {!pulley && (
            <div className="panel">
              <h3>Applied force F</h3>
              <NumberField label="F" unit="N" value={p.force} min={0} max={1000} step={0.5} slider onChange={(v) => s.setParams({ force: v })} />
              <div className="row sl-row">
                <span className="sl-field-label">Along the slope</span>
                <Segmented
                  small
                  label="Direction of the applied force"
                  options={[
                    { value: "up", label: "Up" },
                    { value: "down", label: "Down" },
                  ]}
                  value={p.forceDir}
                  onChange={(v) => s.setParams({ forceDir: v })}
                />
              </div>
              <NumberField label="Angle to the slope" unit="°" value={p.forceAngle} min={-80} max={80} step={1} slider onChange={(v) => s.setParams({ forceAngle: v })} />
              <p className="muted sl-note">
                Positive tilts F away from the slope (a pull); negative into it (a push).
                {p.angle > 0 && (
                  <>
                    {" "}
                    <button className="text sl-inline" onClick={() => s.setParams({ forceAngle: -p.angle, forceDir: "up" })}>
                      Make it horizontal
                    </button>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="panel">
            <h3>The start</h3>
            <NumberField label="Slope length" unit="m" value={p.length} min={1} max={20} step={0.5} onChange={(v) => s.setParams({ length: v, start: Math.min(p.start, v) })} />
            <NumberField label="Start, from the bottom" unit="m" value={p.start} min={0} max={p.length} step={0.1} slider onChange={(v) => s.setParams({ start: v })} />
            <NumberField label="Starting velocity (up +)" unit="m·s⁻¹" value={p.v0} min={-20} max={20} step={0.1} slider onChange={(v) => s.setParams({ v0: v })} />
          </div>

          <div className="panel">
            <h3>Display</h3>
            <div className="row sl-row">
              <span className="sl-field-label">Label the forces with</span>
              <Segmented<LabelStyle>
                small
                label="Force labels"
                options={[
                  { value: "symbols", label: "Symbols" },
                  { value: "words", label: "Words" },
                ]}
                value={o.labels}
                onChange={(v) => s.setOptions({ labels: v })}
              />
            </div>
            <label className="sl-check">
              <input type="checkbox" checked={o.sizes} onChange={(e) => s.setOptions({ sizes: e.target.checked })} />
              Write each force's size on the diagrams
            </label>
            <label className="sl-check">
              <input type="checkbox" checked={o.forcesInPicture} onChange={(e) => s.setOptions({ forcesInPicture: e.target.checked })} />
              Draw the forces on the block in the picture too
            </label>
            <label className="sl-check">
              <input type="checkbox" checked={o.velocity} onChange={(e) => s.setOptions({ velocity: e.target.checked })} />
              Show the velocity arrow
            </label>
            <label className="sl-check">
              <input type="checkbox" checked={o.angleValue} onChange={(e) => s.setOptions({ angleValue: e.target.checked })} />
              Write the angle's value (or just θ)
            </label>
            <label className="sl-check">
              <input type="checkbox" checked={q} onChange={(e) => s.setOptions({ question: e.target.checked })} />
              Question mode: hide the numbers and the memo
            </label>
          </div>
        </div>
      )}

      <div className="sl-main">
        <div className={`sl-board ${classView ? "class-view" : ""}`}>
          <div className="sl-sketch-box">
            <canvas ref={sketchRef} className="sl-sketch" role="img" aria-label={`A ${formatNumber(p.mass, 2)} kg block on a ${formatNumber(p.angle, 1)}° slope. ${stateText(f, m, p)}.`} />
          </div>
          {readouts}
          {slipped !== null && !q && (
            <p className="sl-banner">
              It slipped at θ = {formatFixed(slipped, 1)}°{!pulley && p.force === 0 && <> — tan {formatFixed(slipped, 1)}° = {formatFixed(Math.tan((slipped * Math.PI) / 180), 2)} = μₛ</>}.
            </p>
          )}
          {f.state === "lifted" && <p className="sl-warn">The applied force lifts the block off the slope — make F smaller or its angle to the slope smaller.</p>}
          <div className="sl-fbd-box">
            <canvas ref={fbdRef} className="sl-fbd" role="img" aria-label="Free-body diagrams of the block, drawn to scale" />
          </div>
          {classView && (
            <div className="sl-class-bar">
              {runButton}
              <button onClick={reset}>
                <Icon name="restart_alt" size={20} /> Reset
              </button>
              {tiltButton}
              {cutButton}
              <button onClick={() => s.setOptions({ question: !q })}>
                <Icon name={q ? "visibility" : "quiz"} size={20} /> {q ? "Show the numbers" : "Question mode"}
              </button>
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <>
            <div className="panel sl-graph-panel">
              <h3>Velocity–time graph</h3>
              <canvas ref={graphRef} className="sl-graph" role="img" aria-label="The block's velocity against time, up the slope positive" />
            </div>
            <div className="panel sl-memo">
              {q ? (
                <p className="muted sl-hidden">Question mode: the working is hidden. Switch it off to show the memo.</p>
              ) : (
                <>
                  <h3>The memo{m.t > 0 ? `, at t = ${n2(m.t)} s` : ""}</h3>
                  <dl className="sl-steps">
                    {steps.map((st) => (
                      <Fragment key={st.head}>
                        <dt>{st.head}</dt>
                        <dd>
                          {st.lines.map((l, i) => (
                            <div key={i}>
                              <Sub text={l} />
                            </div>
                          ))}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                  <p className="muted sl-note">
                    g = {formatNumber(G, 1)} m·s⁻², as on the data sheet.
                    {pulley ? " The string is light and inextensible and the pulley frictionless." : ""} The free-body diagrams are drawn to scale.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

