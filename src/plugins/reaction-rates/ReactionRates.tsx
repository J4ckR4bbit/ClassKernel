import { useCallback, useEffect, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatFixed, formatNumber } from "../numbers";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { printCanvas, sizeCanvas } from "../shared/canvas";
import { NumberField, Sub } from "../shared/SimControls";
import { GRAPHS_H, GRAPHS_W, SCENE_H, SCENE_W, drawGraphs, drawScene } from "./drawing";
import { conditionsLabel, explainChange } from "./explain";
import { Surface, activationEnergy, limiting, metalLeft, recentRate, stepSim } from "./rates";
import { Speed, useRates } from "./rateStore";
import "../shared/sim-controls.css";

const PRINT_MM_PER_UNIT = 0.15;
const SURFACES: Array<{ value: Surface; label: string }> = [
  { value: "lump", label: "One lump" },
  { value: "pieces", label: "Six pieces" },
  { value: "powder", label: "Powder" },
];

/**
 * Reaction rates: collision theory in a beaker of acid with a metal at the
 * bottom, with the Maxwell–Boltzmann distribution and the gas formed against
 * time.
 */
export default function ReactionRates() {
  const { showToast } = useAppPick("showToast");
  const s = useRates();
  const { params: p, options: o, sim, running } = s;
  const q = o.question;
  const [classView, setClassView] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
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
    let sinceBump = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useRates.getState();
      if (st.running && !st.sim.done) {
        stepSim(st.sim, dt * st.options.speed);
        dirty.current = true;
        sinceBump += dt;
        if (st.sim.done) {
          st.setRunning(false);
          sinceBump = 1;
        }
        if (sinceBump > 0.25) {
          sinceBump = 0;
          st.bump();
        }
      }
      if (!dirty.current) return;
      dirty.current = false;
      draw();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const draw = () => {
    const st = useRates.getState();
    const fit = classViewRef.current;
    const scene = sceneRef.current && sizeCanvas(sceneRef.current, SCENE_W, SCENE_H, fit);
    if (scene) drawScene(scene, st.sim, { screen: true });
    const graph = graphRef.current && sizeCanvas(graphRef.current, GRAPHS_W, GRAPHS_H, fit);
    if (graph) drawGraphs(graph, st.sim, st.held, { screen: true, values: st.options.values, histogram: st.options.histogram, question: st.options.question });
  };

  // ---------- actions ----------

  const run = () => {
    if (sim.done) s.reset();
    s.setRunning(!running);
  };
  const keep = () => {
    s.hold(conditionsLabel(p));
    s.reset();
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

  const save = async (what: "beaker" | "graphs") => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const [W, H] = what === "beaker" ? [SCENE_W, SCENE_H] : [GRAPHS_W, GRAPHS_H];
      const { canvas, ctx } = printCanvas(W, H, mm(PRINT_MM_PER_UNIT));
      if (what === "beaker") drawScene(ctx, sim, { screen: false });
      else drawGraphs(ctx, sim, s.held, { screen: false, values: o.values, histogram: false, question: q });
      const bytes = await canvasToPng(canvas);
      const name = what === "beaker" ? "reaction_rate_particles.png" : "reaction_rate_graphs.png";
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Reaction rate picture save failed", e);
      setStatus(`Could not save the picture: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- panels ----------

  const ea = activationEnergy(sim.params);
  const hot = sim.particles.filter((x) => x.ke >= ea).length;
  const lim = limiting(sim.params);
  const readouts = (
    <div className="sim-readouts">
      <div className="sim-readout">
        <span className="sim-readout-label">Collisions with the metal</span>
        <span className="sim-readout-value">{formatNumber(sim.collisions, 0)}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Effective</span>
        <span className="sim-readout-value">
          {formatNumber(sim.effective, 0)}
          {sim.collisions ? ` (${formatFixed((100 * sim.effective) / sim.collisions, 1)} %)` : ""}
        </span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Particles with Eₖ ≥ Eₐ now</span>
        <span className="sim-readout-value">
          {hot} of {sim.particles.length}
        </span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Rate (last 5 s)</span>
        <span className="sim-readout-value">{formatFixed(recentRate(sim), 1)} bubbles·s⁻¹</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Left</span>
        <span className="sim-readout-value">
          {sim.particles.length} acid · {metalLeft(sim)} metal
        </span>
      </div>
    </div>
  );

  const runButton = (
    <button className={running ? "" : "primary"} onClick={run}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Pause" : sim.done ? "Run again" : "Run"}
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

  const changes = s.held ? explainChange(s.held, p) : [];

  return (
    <div className={`sim-tool reaction-rates ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="sim-controls">
          <div className="panel">
            <div className="row sim-row">
              {runButton}
              {resetButton}
            </div>
            <div className="row sim-row">
              <span className="sim-field-label">Speed</span>
              <Segmented<Speed>
                small
                label="Speed"
                options={[1, 2, 4, 8].map((v) => ({ value: v as Speed, label: `×${v}` }))}
                value={o.speed}
                onChange={(v) => s.setOptions({ speed: v })}
              />
            </div>
            <div className="row sim-row">
              {questionButton}
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
            <div className="row sim-row">
              <button className="small" disabled={busy} onClick={() => void save("beaker")}>
                <Icon name="save" size={18} /> Save the particles…
              </button>
              <button className="small" disabled={busy} onClick={() => void save("graphs")}>
                <Icon name="save" size={18} /> Save the graphs…
              </button>
            </div>
            {status && <div className="sim-status muted">{status}</div>}
            {sim.done && <p className="sim-banner">Finished: the {lim.reagent} has all reacted.</p>}
          </div>

          <div className="panel">
            <h3>The conditions</h3>
            <NumberField label="Temperature" unit="°C" value={p.temperature} min={0} max={100} step={1} decimals={0} slider onChange={(v) => s.setParams({ temperature: Math.round(v) })} />
            <NumberField
              label="Acid concentration"
              unit="mol·dm⁻³"
              value={p.concentration}
              min={0.5}
              max={2}
              step={0.25}
              decimals={2}
              slider
              onChange={(v) => s.setParams({ concentration: Math.round(v * 4) / 4 })}
            />
            <div className="sim-field-label" style={{ margin: "6px 0" }}>
              The metal (the same mass each way)
            </div>
            <div className="sim-seg">
              <Segmented<Surface> small label="Surface area of the metal" options={SURFACES} value={p.surface} onChange={(v) => s.setParams({ surface: v })} />
            </div>
            <label className="sim-check">
              <input type="checkbox" checked={p.catalyst} onChange={(e) => s.setParams({ catalyst: e.target.checked })} />
              Add a catalyst
            </label>
            <p className="muted sim-note">Temperature and the catalyst change the run as it goes; a new concentration or surface starts a new run.</p>
          </div>

          <div className="panel">
            <h3>Compare two experiments</h3>
            <div className="row sim-row">
              <button onClick={keep} disabled={sim.gas.length < 3} title="Keep this run's graphs dashed and start a fresh run">
                Keep this run and start again
              </button>
            </div>
            {s.held && (
              <div className="row sim-row">
                <span className="muted sim-note">Dashed: {s.held.label}.</span>
                <button className="small" onClick={s.clearHeld}>
                  Clear the dashed run
                </button>
              </div>
            )}
            <p className="muted sim-note">Run one experiment, keep it, change one condition and run again: the two curves on each graph show the difference.</p>
          </div>

          <div className="panel">
            <h3>Display</h3>
            <label className="sim-check">
              <input type="checkbox" checked={o.histogram} onChange={(e) => s.setOptions({ histogram: e.target.checked })} />
              Show the beaker's particles under the curve
            </label>
            <label className="sim-check">
              <input type="checkbox" checked={o.values} onChange={(e) => s.setOptions({ values: e.target.checked })} />
              Numbers on the gas graph's axes
            </label>
          </div>
        </div>
      )}

      <div className="sim-main">
        <div className={`sim-board ${classView ? "class-view" : ""}`}>
          <div className="sim-canvas-box">
            <canvas ref={sceneRef} className="sim-canvas sim-picture" role="img" aria-label="Acid particles colliding with a metal at the bottom of a beaker" />
          </div>
          <div className="sim-canvas-box">
            <canvas ref={graphRef} className="sim-canvas" role="img" aria-label="The Maxwell–Boltzmann distribution, and the gas formed against time" />
          </div>
          {readouts}
          {classView && (
            <div className="sim-class-bar">
              {runButton}
              {resetButton}
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <div className="panel sim-notes">
            {q ? (
              <p className="muted sim-hidden">Question mode: the explanations are hidden. Switch it off to show them.</p>
            ) : (
              <>
                <h3>What is happening</h3>
                <p className="sim-now">
                  {sim.done
                    ? `The ${lim.reagent} has all reacted: no more effective collisions are possible, so the graph is flat. The amount of gas is set by the limiting reagent, not by how fast it formed.`
                    : sim.t === 0
                      ? "Press Run. Watch for the glowing particles — the ones with enough energy — and whether they hit the metal the right way round."
                      : `Only ${sim.collisions ? formatFixed((100 * sim.effective) / sim.collisions, 1) : "0"} % of the collisions so far were effective. As the acid is used up there are fewer particles to collide, so the rate falls and the gas graph levels off.`}
                </p>
                {changes.length > 0 && (
                  <dl className="sim-steps" style={{ marginBottom: 14 }}>
                    <dt>Compared with the dashed run</dt>
                    <dd>
                      {changes.map((c, i) => (
                        <div key={i}>
                          <Sub text={c} />
                        </div>
                      ))}
                    </dd>
                  </dl>
                )}
              </>
            )}
            <h3>Exam points</h3>
            <dl className="sim-steps">
              <dt>Collision theory</dt>
              <dd>
                <Sub text="A reaction happens only when particles collide effectively: with the correct orientation and with kinetic energy equal to or greater than the activation energy, E_k ≥ E_a." />
              </dd>
              <dt>Rate</dt>
              <dd>The reaction rate is directly proportional to the number of effective collisions per unit time — say "per unit time", not just "more collisions".</dd>
              <dt>The distribution</dt>
              <dd>
                <Sub text="Hotter: the curve flattens and its peak moves to higher energy, with the same area (the same number of particles); more of it lies beyond E_a. A catalyst leaves the curve alone and moves E_a to the left." />
              </dd>
              <dt>Concentration</dt>
              <dd>
                <Sub text="More particles: the whole curve is taller, so more of them lie beyond E_a — though the same fraction." />
              </dd>
              <dt>Catalyst</dt>
              <dd>A substance that increases the rate of the reaction but remains unchanged at the end of the reaction: an alternative pathway of lower activation energy.</dd>
              <dt>Measuring</dt>
              <dd>Gas volume (a syringe or an upturned cylinder), loss of mass of the flask, a colour change, or a precipitate hiding a cross (turbidity).</dd>
              <dt>The final amount</dt>
              <dd>Set by the limiting reagent: changing the rate changes how soon the graph levels off, not where.</dd>
            </dl>
            <p className="muted sim-note">
              The model: one effective collision stands for one metal atom reacting (magnesium really needs two H⁺ for each atom), and the activation energy is scaled so the
              shaded tail is big enough to see. Real activation energies are many times larger compared with the particles' energies, so a real reaction is far more
              sensitive to temperature than this beaker is.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
