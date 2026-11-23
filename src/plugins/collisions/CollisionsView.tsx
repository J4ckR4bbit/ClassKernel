import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatNumber } from "../numbers";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { printCanvas, sizeCanvas } from "../shared/canvas";
import { Memo, NumberField, Sub } from "../shared/SimControls";
import { EXAMPLES, Kind, Plan, plan, stateAt } from "./collisions";
import { GRAPH_H, GRAPH_W, SKETCH_H, SKETCH_W, drawGraphs, drawSketch } from "./drawing";
import { Positive, direction, memo, n2 } from "./memo";
import { useCollisions } from "./collisionStore";
import "../shared/sim-controls.css";

const PRINT_MM_PER_UNIT = 0.15;

/**
 * Collisions and impulse: two trolleys on a frictionless track collide (or a
 * spring pushes them apart), with their velocity, momentum and force graphs
 * and the memo.
 */
export default function CollisionsView() {
  const { showToast } = useAppPick("showToast");
  const s = useCollisions();
  const { params: p, options: o, t, running } = s;
  const pl = useMemo(() => plan(p), [p]);
  const out = pl.out;
  const sg = o.positive === "right" ? 1 : -1;
  const q = o.question;
  const [classView, setClassView] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sketchRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);

  // ---------- the run ----------

  const planRef = useRef<Plan>(pl);
  planRef.current = pl;
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
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
      const st = useCollisions.getState();
      const plan = planRef.current;
      if (st.running) {
        // Through the contact, slow enough that it lasts about a second and a half on screen.
        const near = st.t >= plan.tc - 0.05 * plan.dt && st.t <= plan.tc + 1.05 * plan.dt;
        const rate = st.options.slowMo && near && plan.out.collides ? Math.min(1, plan.dt / 1.5) : 1;
        const next = Math.min(plan.tEnd, st.t + dt * rate);
        st.setT(next);
        if (next >= plan.tEnd) st.setRunning(false);
        dirty.current = true;
      }
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const draw = () => {
    const st = useCollisions.getState();
    const plan = planRef.current;
    const fit = classViewRef.current;
    const sign = st.options.positive === "right" ? 1 : -1;
    const sketch = sketchRef.current && sizeCanvas(sketchRef.current, SKETCH_W, SKETCH_H, fit);
    if (sketch) drawSketch(sketch, st.params, plan, stateAt(plan, st.t), { screen: true, question: st.options.question, sign });
    const graph = graphRef.current && sizeCanvas(graphRef.current, GRAPH_W, GRAPH_H, fit);
    if (graph) drawGraphs(graph, st.params, plan, st.t, st.held, { screen: true, values: st.options.values && !st.options.question, sign, average: st.options.average && !st.options.question });
  };

  // ---------- actions ----------

  const run = () => {
    if (!out.possible) return;
    if (!running && t >= pl.tEnd - 1e-9) s.setT(0);
    s.setRunning(!running);
  };
  const compareDouble = () => {
    s.hold(out.dpB, p.contactTime, `Δt = ${formatNumber(p.contactTime, 3)} s`);
    const held = useCollisions.getState().held;
    s.setParams({ contactTime: Math.min(2, p.contactTime * 2) });
    useCollisions.setState({ held });
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
  useEffect(() => {
    if (!classView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  const save = async (what: "sketch" | "graphs") => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const [W, H] = what === "sketch" ? [SKETCH_W, SKETCH_H] : [GRAPH_W, GRAPH_H];
      const { canvas, ctx } = printCanvas(W, H, mm(PRINT_MM_PER_UNIT));
      if (what === "sketch") drawSketch(ctx, p, pl, stateAt(pl, t), { screen: false, question: q, sign: sg });
      else drawGraphs(ctx, p, pl, Math.max(t, pl.tEnd), s.held, { screen: false, values: o.values && !q, sign: sg, average: o.average && !q });
      const bytes = await canvasToPng(canvas);
      const name = what === "sketch" ? `collision_${p.kind}.png` : `collision_${p.kind}_graphs.png`;
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Collision picture save failed", e);
      setStatus(`Could not save the picture: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- panels ----------

  const steps = useMemo(() => memo(p, out, o.positive), [p, out, o.positive]);
  const hidden = "?";
  const verdict = !out.collides ? "No collision" : !out.possible ? "Impossible" : out.verdict === "elastic" ? "Elastic" : out.verdict === "inelastic" ? "Inelastic" : "Explosion: Eₖ gained";
  const readouts = (
    <div className="sim-readouts">
      <div className="sim-readout">
        <span className="sim-readout-label">Σp before</span>
        <span className="sim-readout-value">{n2(sg * out.pBefore)} kg·m·s⁻¹</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Σp after</span>
        <span className="sim-readout-value">{q || !out.possible ? hidden : `${n2(sg * out.pAfter)} kg·m·s⁻¹`}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">ΣEₖ before</span>
        <span className="sim-readout-value">{n2(out.ekBefore)} J</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">ΣEₖ after</span>
        <span className="sim-readout-value">{q || !out.possible ? hidden : `${n2(out.ekAfter)} J`}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">The collision</span>
        <span className="sim-readout-value">{q ? hidden : verdict}</span>
      </div>
    </div>
  );

  const runButton = (
    <button className={running ? "" : "primary"} onClick={run} disabled={!out.possible}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Pause" : "Run"}
    </button>
  );
  const resetButton = (
    <button onClick={s.reset}>
      <Icon name="restart_alt" size={20} /> Reset
    </button>
  );
  const questionButton = (
    <button onClick={() => s.setOptions({ question: !q })}>
      <Icon name={q ? "visibility" : "quiz"} size={20} /> {q ? "Show the answers" : "Question mode"}
    </button>
  );

  const display = (v: number) => sg * v;
  const set = (v: number) => sg * v;
  const sgLabel = o.positive === "right" ? "+ to the right" : "+ to the left";
  const explosion = p.kind === "explosion";

  return (
    <div className={`sim-tool collisions ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="sim-controls">
          <div className="panel">
            <select className="sim-select" aria-label="Example" value={s.example} onChange={(e) => s.loadExample(e.target.value)}>
              <option value="" disabled>
                {s.example ? "Examples" : "Your own — or pick an example…"}
              </option>
              {EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <div className="row sim-row">
              {runButton}
              {resetButton}
            </div>
            <div className="row sim-row">
              {questionButton}
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
            <div className="row sim-row">
              <button className="small" disabled={busy} onClick={() => void save("sketch")}>
                <Icon name="save" size={18} /> Save the sketch…
              </button>
              <button className="small" disabled={busy} onClick={() => void save("graphs")}>
                <Icon name="save" size={18} /> Save the graphs…
              </button>
            </div>
            {status && <div className="sim-status muted">{status}</div>}
            {out.problem && <p className="sim-warn">{out.problem}</p>}
          </div>

          <div className="panel">
            <h3>What happens</h3>
            <select className="sim-select" aria-label="Kind of interaction" value={p.kind} onChange={(e) => s.setParams({ kind: e.target.value as Kind })}>
              <option value="stick">They stick together</option>
              <option value="elastic">An elastic collision</option>
              <option value="given">A's velocity after is given</option>
              <option value="explosion">A spring pushes them apart</option>
            </select>
            <NumberField label="Mass of A" unit="kg" value={p.massA} min={0.01} max={100000} step={0.1} onChange={(v) => s.setParams({ massA: v })} />
            <NumberField label="Mass of B" unit="kg" value={p.massB} min={0.01} max={100000} step={0.1} onChange={(v) => s.setParams({ massB: v })} />
            {explosion ? (
              <NumberField label="Velocity of both before" unit="m·s⁻¹" value={display(p.uA)} min={-50} max={50} step={0.1} allowNegative onChange={(v) => s.setParams({ uA: set(v), uB: set(v) })} />
            ) : (
              <>
                <NumberField label="Velocity of A before" unit="m·s⁻¹" value={display(p.uA)} min={-50} max={50} step={0.1} allowNegative onChange={(v) => s.setParams({ uA: set(v) })} />
                <NumberField label="Velocity of B before" unit="m·s⁻¹" value={display(p.uB)} min={-50} max={50} step={0.1} allowNegative onChange={(v) => s.setParams({ uB: set(v) })} />
              </>
            )}
            {(p.kind === "given" || explosion) && (
              <NumberField label="Velocity of A after" unit="m·s⁻¹" value={display(p.vAGiven)} min={-50} max={50} step={0.1} allowNegative onChange={(v) => s.setParams({ vAGiven: set(v) })} />
            )}
            <p className="muted sim-note">Velocities with their signs: {sgLabel}. A starts on the left, B on the right.</p>
            <NumberField label="Contact time, Δt" unit="s" value={p.contactTime} min={0.001} max={2} step={0.01} onChange={(v) => s.setParams({ contactTime: v })} />
          </div>

          <div className="panel">
            <h3>Compare contact times</h3>
            <div className="row sim-row">
              <button onClick={compareDouble} disabled={!out.collides || !out.possible} title="Keep this force–time graph dashed, double the contact time and run it again">
                Compare at double the contact time
              </button>
            </div>
            {s.held && (
              <div className="row sim-row">
                <span className="muted sim-note">Dashed: the force on B at {s.held.label}.</span>
                <button className="small" onClick={s.clearHeld}>
                  Clear the dashed graph
                </button>
              </div>
            )}
            <p className="muted sim-note">The same change in momentum over a longer time needs a smaller force: the area under the graph stays the same.</p>
          </div>

          <div className="panel">
            <h3>Display</h3>
            <div className="row sim-row">
              <span className="sim-field-label">Positive is</span>
              <Segmented<Positive>
                small
                label="Sign convention"
                options={[
                  { value: "right", label: "To the right" },
                  { value: "left", label: "To the left" },
                ]}
                value={o.positive}
                onChange={(v) => s.setOptions({ positive: v })}
              />
            </div>
            <label className="sim-check">
              <input type="checkbox" checked={o.slowMo} onChange={(e) => s.setOptions({ slowMo: e.target.checked })} />
              Slow motion through the collision
            </label>
            <label className="sim-check">
              <input type="checkbox" checked={o.average} onChange={(e) => s.setOptions({ average: e.target.checked })} />
              Show the average force on the force–time graph
            </label>
            <label className="sim-check">
              <input type="checkbox" checked={o.values} onChange={(e) => s.setOptions({ values: e.target.checked })} />
              Numbers on the axes
            </label>
          </div>
        </div>
      )}

      <div className="sim-main">
        <div className={`sim-board ${classView ? "class-view" : ""}`}>
          <div className="sim-canvas-box">
            <canvas
              ref={sketchRef}
              className="sim-canvas sim-picture"
              role="img"
              aria-label={`Trolley A (${formatNumber(p.massA, 3)} kg) and trolley B (${formatNumber(p.massB, 3)} kg) on a frictionless track`}
            />
          </div>
          <div className="sim-canvas-box">
            <canvas ref={graphRef} className="sim-canvas" role="img" aria-label="Velocity, momentum and force against time" />
          </div>
          {readouts}
          {classView && (
            <div className="sim-class-bar">
              {runButton}
              {resetButton}
              {questionButton}
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <div className="panel sim-notes">
            {q ? (
              <p className="muted sim-hidden">Question mode: the working is hidden. Switch it off to show the memo.</p>
            ) : (
              <>
                <h3>The memo</h3>
                <Memo steps={steps} />
                {out.collides && out.possible && (
                  <p className="muted sim-note">
                    In this model the force rises and falls smoothly through the contact (half a sine wave), so its peak is π/2 times the average:{" "}
                    {n2(Math.abs((Math.PI / 2) * out.forceB))} N here. A after: {n2(sg * out.vA)} m·s⁻¹ ({direction(out.vA)}); B after: {n2(sg * out.vB)} m·s⁻¹ (
                    {direction(out.vB)}).
                  </p>
                )}
              </>
            )}
            <h3 style={{ marginTop: 14 }}>Exam points</h3>
            <dl className="sim-steps">
              <dt>Isolated system</dt>
              <dd>One with no net external force acting on it. Only then is the total momentum conserved: the forces between A and B are internal.</dd>
              <dt>Elastic or inelastic</dt>
              <dd>Elastic: both momentum and kinetic energy are conserved. Inelastic: only momentum is conserved. Decide by calculating ΣEₖ before and after.</dd>
              <dt>Impulse</dt>
              <dd>
                <Sub text="The product of the net force and the contact time, J = F_{net}Δt = Δp: the area under a force–time graph. Its unit, N·s, is the same as kg·m·s⁻¹." />
              </dd>
              <dt>Third law</dt>
              <dd>
                <Sub text="A pushes B as hard as B pushes A, in the opposite direction, for the same time — so Δp_A = −Δp_B, whatever the masses." />
              </dd>
              <dt>Everyday</dt>
              <dd>Airbags, crumple zones, catching a hard ball with your hands moving back: a longer contact time gives a smaller force for the same change in momentum.</dd>
              <dt>Signs</dt>
              <dd>Choose a positive direction, say it, and keep it: a velocity the other way goes in as negative.</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
