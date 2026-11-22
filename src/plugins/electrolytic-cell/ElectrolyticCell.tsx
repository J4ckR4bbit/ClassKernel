import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng } from "../png";
import { formatFixed } from "../numbers";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import {
  COUPLES,
  CHLORIDE_CONCENTRATED,
  Candidate,
  Couple,
  DEFAULT_SETUP,
  ELECTROLYTES,
  F,
  MATERIALS,
  PRESETS,
  Product,
  Progress,
  Setup,
  VM,
  advance,
  analyse,
  electrolyteById,
  fileNameFor,
  freshProgress,
  netText,
  oxidationText,
  presetFor,
  productsOf,
  reductionText,
  talkingPoints,
  three,
  timeText,
  voltsText,
} from "./electrolysis";
import { CellAnimator, SCENE_H, SCENE_W, buildScene } from "./drawing";
import "../galvanic-cell/galvanic-cell.css";
import "./electrolytic-cell.css";

type Speed = 1 | 60 | 600;
const SPEEDS: Array<{ value: Speed; label: string }> = [
  { value: 1, label: "×1" },
  { value: 60, label: "×60" },
  { value: 600, label: "×600" },
];

const SAVE_W = 2000;
const MAX_AMPS = 5;

/** "Cu²⁺ / Cu". */
const coupleLabel = (c: Couple) => `${c.ox[0].formula} / ${c.red[0].formula}`;

/** "Cu²⁺ (+0,34 V), H₂O (−0,83 V)". */
const candidateList = (list: Candidate[]) => list.map((c) => `${c.agent} (${voltsText(c.couple.E0)})`).join(", ");

/** One line of Faraday's law for something made or used at an electrode. */
function FaradayLine({ product, shared, molten }: { product: Product; shared: boolean; molten: boolean }) {
  const ne = three(product.electrons);
  const n = three(product.moles);
  const f = product.formula;
  const where = product.role === "cathode" ? "Cathode" : "Anode";
  const share = shared ? <> ({ne} mol e⁻ went this way)</> : null;
  if (product.dissolved && product.purity < 1) {
    return (
      <div>
        {where}: the impure anode has lost <strong>{three(product.grams)} g</strong>, about {Math.round(product.purity * 100)} % of it{" "}
        {f}: n({f}) = {n} mol. The rest is the impurities: the more reactive ones oxidised, the others fallen as sludge.
        {share}
      </div>
    );
  }
  if (product.dissolved) {
    return (
      <div>
        {where}: n({f}) = n(e⁻) / {product.ratio} = {n} mol, so the anode loses m = nM = {n} × {formatFixed(product.molarMass, 1)} ={" "}
        <strong>{three(product.moles * product.molarMass)} g</strong>
        {share}
      </div>
    );
  }
  return (
    <div>
      {where}: n({f}) = n(e⁻) / {product.ratio} = {n} mol
      {product.volume !== null ? (
        <>
          , V({f}) = nVm = {n} × {formatFixed(VM, 1)} = <strong>{three(product.volume)} dm³</strong> at STP
        </>
      ) : product.molarMass > 0 ? (
        <>
          , m({f}) = nM = {n} × {formatFixed(product.molarMass, 1)} = <strong>{three(product.grams)} g</strong>
          {molten ? " (liquid)" : ""}
        </>
      ) : null}
      {share}
    </div>
  );
}

/**
 * Electrolytic cell. A DC supply drives a non-spontaneous reaction: pick the
 * electrolyte and the two electrodes (or one of the usual set-ups), switch on,
 * and watch the ions move, the gases bubble and the metal plate out — with
 * the memo saying what forms at each electrode and why, and Faraday's law for
 * the charge that has passed.
 */
export default function ElectrolyticCell() {
  const { showToast } = useAppPick("showToast");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const animator = useRef(new CellAnimator());

  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [progress, setProgress] = useState<Progress>(() => freshProgress(DEFAULT_SETUP));
  const [amperes, setAmperes] = useState(2);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>(60);
  const [stopOn, setStopOn] = useState(true);
  const [stopMinutes, setStopMinutes] = useState(30);
  const [questionMode, setQuestionMode] = useState(false);
  const [classView, setClassView] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const analysis = useMemo(() => analyse(setup, progress), [setup, progress]);
  const stopAt = stopOn ? stopMinutes * 60 : Infinity;
  const finished = progress.stopped !== "" || progress.time >= stopAt - 1e-6;

  // The animation loop reads these, so it never restarts on a change. It
  // moves the progress on itself and shows React a copy now and then, so the
  // progress is only ever changed through commit().
  const live = useRef({ setup, progress, amperes, running, speed, stopAt, questionMode });
  live.current = { ...live.current, setup, amperes, running, speed, stopAt, questionMode };
  const commit = (next: Progress) => {
    live.current.progress = next;
    setProgress(next);
  };

  const startAgain = (next: Setup) => {
    // Straight into the loop's copy too, so no frame runs the old cell on the new set-up.
    live.current = { ...live.current, setup: next, running: false };
    setRunning(false);
    setSetup(next);
    commit(freshProgress(next));
    animator.current.reset();
  };
  const change = (patch: Partial<Setup>) => startAgain({ ...setup, ...patch });
  const chooseElectrolyte = (id: string) => {
    const el = electrolyteById(id);
    change({ electrolyte: id, concentration: el.defaultConcentration, membrane: id === "nacl" ? setup.membrane : false, collectGas: el.molten ? false : setup.collectGas });
  };
  const choosePreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) startAgain(preset.setup);
  };
  const reset = () => startAgain(setup);
  const changeCurrent = (value: number) => {
    const next = Math.min(MAX_AMPS, Math.max(0.1, value));
    setAmperes(next);
    if (live.current.progress.time > 0 && next !== amperes) commit({ ...live.current.progress, currentChanged: true });
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

  // The loop: run the cell on, move the particles, draw. Everything moves on
  // every computer, even one set to show fewer animations: the movement is
  // what the class is watching.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastPublished = last;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const current = live.current;
      let p = current.progress;
      let on = current.running;
      if (on) {
        const seconds = Math.min(dt * current.speed, current.stopAt - p.time);
        if (seconds > 0) p = advance(current.setup, p, current.amperes, seconds);
        const done = p.stopped !== "" || p.time >= current.stopAt - 1e-6;
        if (done) on = false;
        if (p !== current.progress) live.current.progress = p;
        if (now - lastPublished > 100 || done) {
          lastPublished = now;
          setProgress(p);
        }
        if (done) setRunning(false);
      }
      const a = analyse(current.setup, p);
      const scene = buildScene(current.setup, p, a, { showAnswers: !current.questionMode, running: on, amperes: current.amperes });
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

  // The class view owns the screen; Escape (or Close) hands it back.
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
      const a = analyse(current.setup, current.progress);
      // Drawn with the supply on, so the ammeter shows the current a question gives.
      animator.current.draw(ctx, buildScene(current.setup, current.progress, a, { showAnswers: !current.questionMode, running: true, amperes: current.amperes }));
      const bytes = await canvasToPng(canvas);
      const name = fileNameFor(current.setup);
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (e) {
      console.error("Electrolytic cell save failed", e);
      setStatus(`Could not save the file: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const a = analysis;
  const el = a.electrolyte;
  const molten = el.molten;
  const products = productsOf(setup, progress);
  const preset = presetFor(setup);
  const shared = (role: "anode" | "cathode") => products.filter((p) => p.role === role).length > 1;
  const sludge = Object.entries(progress.sludge).filter(([, g]) => g > 0);
  const inUse = new Set([...a.cathodeList, ...a.anodeList].map((c) => c.couple.id));
  const chosen = new Set([a.cathode.couple.id, a.anode.couple.id]);
  const tableCouples = Object.values(COUPLES).sort((x, y) => x.E0 - y.E0);

  const runButton = (
    <button className={running ? "" : "primary"} onClick={() => setRunning((r) => !r)} disabled={!running && finished}>
      <Icon name={running ? "pause" : "play_arrow"} size={20} /> {running ? "Switch off" : "Switch on"}
    </button>
  );

  const finishedNote =
    progress.stopped === "anode-gone"
      ? "The anode has dissolved away: Reset to start again."
      : !running && progress.time >= stopAt - 1e-6
        ? `Switched off at ${timeText(stopAt)}. Reset, or switch off later, to run on.`
        : "";

  return (
    <div className={`galvanic-cell electrolytic-cell ${classView ? "class-view" : ""}`}>
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
            <div className="row gc-row ec-stop">
              <label className="gc-check">
                <input type="checkbox" checked={stopOn} onChange={(e) => setStopOn(e.target.checked)} />
                Switch off after
              </label>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Switch off after, in minutes"
                value={stopMinutes}
                min={1}
                max={600}
                step={1}
                disabled={!stopOn}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n) && n > 0) setStopMinutes(Math.min(600, n));
                }}
              />
              <span className="muted">min</span>
            </div>
            <div className="ec-clock">
              <span>t = {timeText(progress.time)}</span>
              {finishedNote && <span className="muted">{finishedNote}</span>}
            </div>
            <label className="gc-check">
              <input type="checkbox" checked={questionMode} onChange={(e) => setQuestionMode(e.target.checked)} />
              Question mode: hide the products, the labels and the working
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
            <h3>The cell</h3>
            <label className="gc-field">
              <span className="gc-field-label">Set-up</span>
              <select aria-label="Set-up" value={preset?.id ?? ""} onChange={(e) => choosePreset(e.target.value)}>
                {!preset && <option value="">Your own</option>}
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted gc-note">Or build your own: change anything below and the tool works out what happens.</p>
            <label className="gc-field">
              <span className="gc-field-label">Electrolyte</span>
              <select aria-label="Electrolyte" value={setup.electrolyte} onChange={(e) => chooseElectrolyte(e.target.value)}>
                {ELECTROLYTES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.formula}
                    {e.molten ? "(l), molten" : "(aq)"}
                  </option>
                ))}
              </select>
            </label>
            {molten ? (
              <p className="muted gc-note">
                {el.name}, heated to {el.temperature}. There is no water to compete.
              </p>
            ) : (
              <div className="gc-amount">
                <div className="gc-amount-head">
                  <span className="gc-amount-label">[{el.formula}]</span>
                  <span className="gc-amount-value">
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`Concentration of ${el.formula} in mol·dm⁻³`}
                      value={setup.concentration}
                      min={0.01}
                      max={el.maxConcentration}
                      step="any"
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isFinite(n) && n > 0) change({ concentration: Math.min(el.maxConcentration, Math.max(0.01, n)) });
                      }}
                    />
                    <span className="muted">mol·dm⁻³</span>
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Concentration slider"
                  min={-2}
                  max={Math.log10(el.maxConcentration)}
                  step={0.01}
                  value={Math.log10(setup.concentration)}
                  onChange={(e) => change({ concentration: Number((10 ** parseFloat(e.target.value)).toPrecision(2)) })}
                />
              </div>
            )}
            <label className="gc-field">
              <span className="gc-field-label">Anode (+)</span>
              <select aria-label="Anode" value={setup.anode} onChange={(e) => change({ anode: e.target.value })}>
                {MATERIALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="gc-field">
              <span className="gc-field-label">Cathode (−)</span>
              <select aria-label="Cathode" value={setup.cathode} onChange={(e) => change({ cathode: e.target.value })}>
                {MATERIALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {setup.electrolyte === "nacl" && (
              <label className="gc-check">
                <input type="checkbox" checked={setup.membrane} onChange={(e) => change({ membrane: e.target.checked })} />
                Membrane between the electrodes
              </label>
            )}
            {!molten && (
              <label className="gc-check">
                <input type="checkbox" checked={setup.collectGas} onChange={(e) => change({ collectGas: e.target.checked })} />
                Collect the gases in tubes
              </label>
            )}
          </div>

          <div className="panel">
            <h3>The supply</h3>
            <div className="gc-amount">
              <div className="gc-amount-head">
                <span className="gc-amount-label">Current</span>
                <span className="gc-amount-value">
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label="Current in amperes"
                    value={amperes}
                    min={0.1}
                    max={MAX_AMPS}
                    step={0.1}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n) && n > 0) changeCurrent(n);
                    }}
                  />
                  <span className="muted">A</span>
                </span>
              </div>
              <input
                type="range"
                aria-label="Current slider"
                min={0.1}
                max={MAX_AMPS}
                step={0.1}
                value={amperes}
                onChange={(e) => changeCurrent(parseFloat(e.target.value))}
              />
            </div>
            <p className="muted gc-note">
              A steady current, whatever the voltage it takes. Q = It, so the current and the time decide how much is
              made.
            </p>
          </div>

          <div className="panel">
            <h3>Standard electrode potentials</h3>
            <p className="muted gc-note">The half-reactions these cells can use, as on the data sheet. Those that could happen in this cell are shaded; the two that do are in bold.</p>
            <table className="data gc-table">
              <thead>
                <tr>
                  <th>Half-reaction</th>
                  <th className="gc-right">E° (V)</th>
                </tr>
              </thead>
              <tbody>
                {tableCouples.map((c) => (
                  <tr key={c.id} className={chosen.has(c.id) ? "gc-in-use" : inUse.has(c.id) ? "ec-candidate" : ""}>
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
        <div className={`gc-stage ec-stage ${classView ? "class-view" : ""}`} ref={stageRef}>
          <canvas ref={canvasRef} className="gc-canvas" role="img" aria-label={`Electrolytic cell: ${el.name}, ${a.anodeMaterial.name} anode, ${a.cathodeMaterial.name} cathode`} />
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
                Question mode: the products, the anode and cathode labels, the electron and ion directions and the working
                are hidden. Bubbles and plating still show, for the class to observe. Switch it off to show the memo.
              </p>
            ) : (
              <>
                <h3>The memo</h3>
                <dl className="gc-memo ec-memo">
                  <dt>In the cell</dt>
                  <dd>
                    {el.name} ({el.ions.map((i) => (molten ? i.formula : `${i.formula}(aq)`)).join(", ")}
                    {molten ? "" : " and water"}). Anode (+): {a.anodeMaterial.name.toLowerCase()}
                    {a.anodeMaterial.inert ? ", inert" : ""}. Cathode (−): {a.cathodeMaterial.name.toLowerCase()}.
                  </dd>
                  <dt>At the cathode (−)</dt>
                  <dd>
                    <div>
                      {a.cathodeList.length > 1 ? (
                        <>
                          Could be reduced: {candidateList(a.cathodeList)}. The strongest oxidising agent (highest E°) is
                          reduced: <strong>{a.cathode.agent}</strong>.
                        </>
                      ) : (
                        <>
                          Only {a.cathode.agent} can be reduced{molten ? ": there is no water" : ""}.
                        </>
                      )}
                    </div>
                    <div>
                      <span className="gc-role gc-cathode">Reduction:</span> {reductionText(a.cathode.couple, molten)}
                    </div>
                  </dd>
                  <dt>At the anode (+)</dt>
                  <dd>
                    <div>
                      {a.anodeList.length > 1 ? (
                        <>
                          Could be oxidised: {candidateList([...a.anodeList].sort((x, y) => x.couple.E0 - y.couple.E0))}.{" "}
                          {a.chlorideException ? (
                            <>
                              By E° alone H₂O would be oxidised, but from a concentrated chloride solution (at least{" "}
                              {formatFixed(CHLORIDE_CONCENTRATED, 1)} mol·dm⁻³ Cl⁻) chlorine forms instead: oxygen is slow to
                              form at the electrode. So <strong>Cl⁻</strong> is oxidised.
                            </>
                          ) : (
                            <>
                              The strongest reducing agent (lowest E°) is oxidised: <strong>{a.anode.agent}</strong>.
                              {a.chlorideDilute && " The chloride solution is dilute, so O₂ forms, not Cl₂."}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          Only {a.anode.agent} can be oxidised{molten ? ": there is no water" : ""}.
                        </>
                      )}
                      {a.anodeMaterial.inert && ` The ${a.anodeMaterial.symbol} anode is inert.`}
                    </div>
                    <div>
                      <span className="gc-role gc-anode">Oxidation:</span> {oxidationText(a.anode.couple, molten)}
                    </div>
                  </dd>
                  <dt>Net reaction</dt>
                  <dd>{netText(a)}</dd>
                  <dt>E°cell</dt>
                  <dd>
                    E°cell = E°cathode − E°anode = E°({coupleLabel(a.cathode.couple)}) − E°({coupleLabel(a.anode.couple)}) = (
                    {voltsText(a.cathode.couple.E0)}) − ({voltsText(a.anode.couple.E0)}) ={" "}
                    <strong>{a.minVoltage > 0.005 ? voltsText(-a.minVoltage) : "0,00 V"}</strong>
                    {a.minVoltage > 0.005
                      ? `: negative, so the reaction is not spontaneous. The supply must give more than ${voltsText(a.minVoltage).replace("+", "")} to drive it.`
                      : ": the same half-reaction runs forwards at one electrode and backwards at the other, so a small voltage drives it."}
                  </dd>
                  <dt>Faraday's law</dt>
                  <dd>
                    {progress.charge <= 0 ? (
                      <span className="muted">Switch on, and the charge that passes is worked through here.</span>
                    ) : (
                      <>
                        <div>
                          {progress.currentChanged ? (
                            <>
                              Q = <strong>{three(progress.charge)} C</strong> (the total that has passed: the current was changed
                              during the run)
                            </>
                          ) : (
                            <>
                              Q = It = {formatFixed(amperes, 2)} A × {three(progress.time)} s = <strong>{three(progress.charge)} C</strong>
                            </>
                          )}
                        </div>
                        <div>
                          n(e⁻) = Q / F = {three(progress.charge)} / {formatFixed(F, 0)} ={" "}
                          <strong>{three(progress.charge / F)} mol</strong>
                        </div>
                        {products.map((p) => (
                          <FaradayLine key={`${p.role}:${p.formula}:${p.dissolved}`} product={p} shared={shared(p.role)} molten={molten} />
                        ))}
                        {sludge.length > 0 && (
                          <div>
                            Anode sludge: {sludge.map(([m, g]) => `${three(g)} g ${m}`).join(" and ")} — not oxidised, so it takes no
                            charge.
                          </div>
                        )}
                        <div className="muted gc-small">
                          F = 96 500 C·mol⁻¹; Vm = {formatFixed(VM, 1)} dm³·mol⁻¹ at STP; M from the periodic table.
                        </div>
                      </>
                    )}
                  </dd>
                  <dt>Points to make</dt>
                  <dd>
                    <ul className="gc-points">
                      {talkingPoints(setup, progress, a).map((p, i) => (
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
