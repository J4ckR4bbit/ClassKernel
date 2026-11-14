import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng } from "../png";
import { formatNumber, formatSigFigs } from "../numbers";
import { prefersReducedMotion } from "../../lib/motion";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import {
  CellState,
  DEFAULT_STATE,
  ELECTROLYTES,
  F,
  HALF_CELLS,
  HalfCell,
  R,
  STANDARD_T,
  Side,
  Term,
  analyse,
  cellNotation,
  fileNameFor,
  halfCellById,
  logCoefficient,
  overallText,
  oxidationText,
  quotientText,
  reductionText,
  sideFor,
  step,
  talkingPoints,
  variableTerms,
  voltsText,
} from "./cell";
import { CellAnimator, SCENE_H, SCENE_W, buildScene } from "./drawing";
import "./galvanic-cell.css";

type Speed = 1 | 5 | 20;
const SPEEDS: Array<{ value: Speed; label: string }> = [
  { value: 1, label: "×1" },
  { value: 5, label: "×5" },
  { value: 20, label: "×20" },
];

const SAVE_W = 2000;

/** The data-sheet line for a half-cell in the pickers: "Zn²⁺ / Zn   −0,76 V". */
const cellOption = (c: HalfCell) => `${c.label}   ${voltsText(c.E0)}`;

/**
 * A concentration (log slider plus a number) or a gas pressure (linear), for
 * one species in one beaker. Big enough for a touch panel.
 */
function AmountField({
  term,
  value,
  onChange,
}: {
  term: Term;
  value: number;
  onChange: (v: number) => void;
}) {
  const gas = term.phase === "g";
  const label = gas ? `p(${term.formula})` : `[${term.formula}]`;
  const unit = gas ? "kPa" : "mol·dm⁻³";
  const sliderValue = gas ? value : Math.log10(Math.max(1e-4, value));
  const fromSlider = (v: number) => (gas ? v : Number((10 ** v).toPrecision(3)));
  return (
    <div className="gc-amount">
      <div className="gc-amount-head">
        <span className="gc-amount-label">{label}</span>
        <span className="gc-amount-value">
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} in ${unit}`}
            value={value}
            min={gas ? 1 : 0.0001}
            max={gas ? 300 : 2}
            step="any"
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange(Math.min(gas ? 300 : 2, n));
            }}
          />
          <span className="muted">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={gas ? 1 : -4}
        max={gas ? 300 : Math.log10(2)}
        step={gas ? 1 : 0.01}
        value={sliderValue}
        onChange={(e) => onChange(fromSlider(parseFloat(e.target.value)))}
      />
    </div>
  );
}

/**
 * Galvanic cell animator. Two half-cells from the standard electrode
 * potentials table, drawn as the cell on the board with the electrons, ions
 * and voltmeter reading following the chemistry — and the Nernst equation
 * when the concentrations or the temperature are changed.
 */
export default function GalvanicCell() {
  const { showToast } = useAppPick("showToast");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const animator = useRef(new CellAnimator());

  const [state, setState] = useState<CellState>(DEFAULT_STATE);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [questionMode, setQuestionMode] = useState(false);
  const [classView, setClassView] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [discharged, setDischarged] = useState(0);

  const analysis = useMemo(() => analyse(state), [state]);

  // The animation loop reads these, so it never restarts on a change.
  const live = useRef({ state, analysis, running, speed, questionMode, discharged });
  live.current = { state, analysis, running, speed, questionMode, discharged };

  const patch = (change: Partial<CellState>) => setState((prev) => ({ ...prev, ...change }));
  const setAmount = (side: Side, formula: string, value: number) =>
    setState((prev) => ({ ...prev, [side]: { ...prev[side], amounts: { ...prev[side].amounts, [formula]: value } } }));
  const chooseCell = (side: Side, id: string) => {
    setState((prev) => ({ ...prev, [side]: sideFor(id) }));
    setDischarged(0);
    animator.current.reset();
  };
  const swapSides = () => {
    setState((prev) => ({ ...prev, left: prev.right, right: prev.left }));
    animator.current.reset();
  };
  const reset = () => {
    setRunning(false);
    setState((prev) => ({ ...prev, left: sideFor(prev.left.cell), right: sideFor(prev.right.cell), temperature: STANDARD_T, saltBridge: true }));
    setDischarged(0);
    animator.current.reset();
  };

  // Size the canvas to its box, at the screen's pixel density.
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const box = stage.getBoundingClientRect();
    const width = Math.max(200, Math.min(box.width, (box.height * SCENE_W) / SCENE_H || Infinity));
    const height = (width * SCENE_H) / SCENE_W;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }, []);

  useEffect(() => {
    fit();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fit, classView]);

  // The loop: move the cell on, move the particles, draw.
  useEffect(() => {
    const motion = prefersReducedMotion() ? 0 : 1;
    let frame = 0;
    let last = performance.now();
    let lastPublished = last;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = live.current;
      let { state: s, analysis: a, discharged: d } = current;
      if (current.running) {
        const result = step(s, a, dt, current.speed);
        if (result.extent > 0) {
          s = result.state;
          a = analyse(s);
          d += result.extent;
          live.current = { ...current, state: s, analysis: a, discharged: d };
          if (now - lastPublished > 100 || !a.running) {
            lastPublished = now;
            setState(s);
            setDischarged(d);
          }
        }
        if (!a.running) setRunning(false);
      }
      const scene = buildScene(s, a, { showAnswers: !current.questionMode, discharged: d, motion });
      animator.current.update(dt, scene);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(canvas.width / SCENE_W, 0, 0, canvas.height / SCENE_H, 0, 0);
        animator.current.draw(ctx, scene);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  const save = async () => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = SAVE_W;
      canvas.height = Math.round((SAVE_W * SCENE_H) / SCENE_W);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D canvas");
      ctx.setTransform(canvas.width / SCENE_W, 0, 0, canvas.height / SCENE_H, 0, 0);
      const current = live.current;
      animator.current.draw(ctx, buildScene(current.state, current.analysis, { showAnswers: !current.questionMode, discharged: current.discharged, motion: 1 }));
      const bytes = await canvasToPng(canvas);
      const name = fileNameFor(current.analysis);
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Galvanic cell save failed", e);
      setStatus(`Could not save the file: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const left = halfCellById(state.left.cell);
  const right = halfCellById(state.right.cell);
  const a = analysis;
  const nernstK = (R * state.temperature) / (a.n * F);
  const logK = logCoefficient(state.temperature, a.n);

  const runButton = (
    <button className={running ? "" : "primary"} onClick={() => setRunning((r) => !r)} disabled={!a.running && !running}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Pause" : a.flat ? "Flat" : "Run the cell"}
    </button>
  );

  return (
    <div className={`galvanic-cell ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="gc-controls">
          <div className="panel">
            <div className="row">
              {runButton}
              <button onClick={reset}>Reset</button>
            </div>
            <div className="row gc-row">
              <span className="gc-field-label">Speed</span>
              <Segmented small label="Running speed" options={SPEEDS} value={speed} onChange={setSpeed} />
            </div>
            <label className="gc-check">
              <input type="checkbox" checked={questionMode} onChange={(e) => setQuestionMode(e.target.checked)} />
              Question mode: hide the reading, the labels and the working
            </label>
            <div className="row gc-row">
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
              <button disabled={busy} onClick={() => void save()}>
                <Icon name="save" size={20} /> {busy ? "Saving…" : "Save PNG…"}
              </button>
            </div>
            {status && <div className="gc-status muted">{status}</div>}
          </div>

          <div className="panel">
            <h3>The half-cells</h3>
            <p className="muted gc-note">
              Pick what goes in each beaker. The one with the higher electrode potential becomes the cathode — the
              tool works that out, so either can go on either side.
            </p>
            {(["left", "right"] as Side[]).map((side) => {
              const cell = side === "left" ? left : right;
              return (
                <div className="gc-side" key={side}>
                  <label className="gc-field">
                    <span className="gc-field-label">{side === "left" ? "Left beaker" : "Right beaker"}</span>
                    <select value={cell.id} onChange={(e) => chooseCell(side, e.target.value)}>
                      {HALF_CELLS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cellOption(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {variableTerms(cell).map((t) => (
                    <AmountField key={t.formula} term={t} value={state[side].amounts[t.formula]} onChange={(v) => setAmount(side, t.formula, v)} />
                  ))}
                </div>
              );
            })}
            <div className="row">
              <button className="small" onClick={swapSides}>
                <Icon name="swap_horiz" size={18} /> Swap sides
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Conditions</h3>
            <div className="gc-amount">
              <div className="gc-amount-head">
                <span className="gc-amount-label">Temperature</span>
                <span className="gc-amount-value">
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Temperature in kelvin"
                    value={state.temperature}
                    min={273}
                    max={373}
                    step={1}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) patch({ temperature: Math.min(373, Math.max(273, n)) });
                    }}
                  />
                  <span className="muted">K</span>
                </span>
              </div>
              <input
                type="range"
                aria-label="Temperature slider"
                min={273}
                max={373}
                step={1}
                value={state.temperature}
                onChange={(e) => patch({ temperature: parseFloat(e.target.value) })}
              />
            </div>
            <label className="gc-check">
              <input type="checkbox" checked={state.saltBridge} onChange={(e) => patch({ saltBridge: e.target.checked })} />
              Salt bridge in place
            </label>
            <label className="gc-field">
              <span className="gc-field-label">Electrolyte in the bridge</span>
              <select value={state.electrolyte} onChange={(e) => patch({ electrolyte: e.target.value })}>
                {ELECTROLYTES.map((el) => (
                  <option key={el.id} value={el.id}>
                    {el.formula}
                  </option>
                ))}
              </select>
            </label>
            <div className="row gc-row">
              <span className="gc-field-label">Electrodes</span>
              <Segmented
                small
                label="Electrode size"
                options={[
                  { value: "small", label: "Small" },
                  { value: "large", label: "Large" },
                ]}
                value={state.largeElectrodes ? "large" : "small"}
                onChange={(v) => patch({ largeElectrodes: v === "large" })}
              />
            </div>
            <p className="muted gc-note">
              Bigger electrodes don't change the reading — a favourite exam question. Only the concentrations and the
              temperature do.
            </p>
          </div>

          <div className="panel">
            <h3>Standard electrode potentials</h3>
            <p className="muted gc-note">At 298 K and 1 mol·dm⁻³ (gases at 101,3 kPa), as on the data sheet.</p>
            <table className="data gc-table">
              <thead>
                <tr>
                  <th>Half-reaction</th>
                  <th className="gc-right">E° (V)</th>
                </tr>
              </thead>
              <tbody>
                {HALF_CELLS.map((c) => (
                  <tr key={c.id} className={c.id === left.id || c.id === right.id ? "gc-in-use" : ""}>
                    <td>{reductionText(c)}</td>
                    <td className="gc-right">{voltsText(c.E0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="gc-main">
        <div className={`gc-stage ${classView ? "class-view" : ""}`} ref={stageRef}>
          <canvas ref={canvasRef} className="gc-canvas" role="img" aria-label={`Galvanic cell: ${cellNotation(a, state, false)}`} />
          {classView && (
            <div className="gc-class-bar">
              {runButton}
              <button onClick={() => setQuestionMode((q) => !q)}>
                <Icon name={questionMode ? "visibility" : "quiz"} size={20} /> {questionMode ? "Show the answers" : "Question mode"}
              </button>
              <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                <Icon name="close" size={20} /> Close
              </button>
            </div>
          )}
        </div>

        {!classView && (
          <div className="panel gc-analysis">
            {questionMode ? (
              <p className="muted gc-hidden">
                Question mode: the reading, the labels and the working are hidden. Switch it off to show the memo.
              </p>
            ) : (
              <>
                <h3>The memo</h3>
                <dl className="gc-memo">
                  <dt>Electrode potentials</dt>
                  <dd>
                    {a.concentrationCell ? (
                      <>Both half-cells are {a.cathode.label}: E° = {voltsText(a.cathode.E0)}. A concentration cell.</>
                    ) : (
                      <>
                        {a.cathode.label}: E° = {voltsText(a.cathode.E0)} (higher — reduced at the cathode).{" "}
                        {a.anode.label}: E° = {voltsText(a.anode.E0)} (lower — oxidised at the anode).
                      </>
                    )}
                  </dd>
                  <dt>Half-reactions</dt>
                  <dd>
                    <div>
                      <span className="gc-role gc-anode">Anode (−), oxidation:</span> {oxidationText(a.anode, a.anodeFactor)}
                    </div>
                    <div>
                      <span className="gc-role gc-cathode">Cathode (+), reduction:</span> {reductionText(a.cathode, a.cathodeFactor)}
                    </div>
                  </dd>
                  <dt>Net reaction</dt>
                  <dd>{overallText(a, state)}</dd>
                  <dt>E°cell</dt>
                  <dd>
                    E°cell = E°cathode − E°anode = ({voltsText(a.cathode.E0)}) − ({voltsText(a.anode.E0)}) ={" "}
                    <strong>{voltsText(a.E0cell)}</strong>
                    {a.polarityReversed && (
                      <span className="gc-warn">
                        {" "}
                        — negative, because these concentrations have turned the cell round: under standard conditions{" "}
                        {a.standardCathodeSide === "left" ? left.label : right.label} would be the cathode.
                      </span>
                    )}
                  </dd>
                  <dt>Cell notation</dt>
                  <dd>
                    {cellNotation(a, state, false)}
                    <div className="muted gc-small">With the conditions: {cellNotation(a, state, true)}</div>
                  </dd>
                  <dt>Nernst equation</dt>
                  <dd>
                    <div>
                      E = E°cell − (RT / nF) ln Q, with n = {a.n}, R = {formatNumber(R, 2)} J·K⁻¹·mol⁻¹, F ={" "}
                      {formatNumber(F, 0)} C·mol⁻¹, T = {formatNumber(state.temperature, 0)} K
                    </div>
                    <div>
                      Q = {quotientText(a)} = {formatSigFigs(a.Q, 3)}
                    </div>
                    <div>
                      RT / nF = {formatSigFigs(nernstK, 3)} V, so (RT / nF) ln Q = {voltsText(a.correction, 3)}
                    </div>
                    <div>
                      E = {voltsText(a.E0cell, 2)} − ({voltsText(a.correction, 3)}) = <strong>{voltsText(a.E, 3)}</strong>
                      {!state.saltBridge && <span className="gc-warn"> — but the voltmeter reads 0 V: no salt bridge, no circuit.</span>}
                    </div>
                    <div className="muted gc-small">
                      In base-10 form at this temperature: E = E° − ({formatSigFigs(logK * a.n, 3)} / n) log Q
                      {state.temperature === STANDARD_T ? " — the familiar 0,059 / n at 25 °C." : "."}
                    </div>
                  </dd>
                  <dt>Points to make</dt>
                  <dd>
                    <ul className="gc-points">
                      {talkingPoints(a, state).map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </dd>
                </dl>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
