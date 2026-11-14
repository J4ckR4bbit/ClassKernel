import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { prefersReducedMotion } from "../../lib/motion";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import { formatFixed, formatNumber } from "../numbers";
import Apparatus from "./Apparatus";
import PhGraph from "./PhGraph";
import {
  INDICATORS,
  SOLUTES,
  Setup,
  Solute,
  concentrationFromPH,
  concentrationText,
  equivalencePoints,
  equivalenceRelation,
  flaskAfter,
  indicatorById,
  indicatorColour,
  mix,
  pHAfter,
  pHOf,
  soluteById,
  suitableIndicators,
  volumeText,
} from "./chemistry";
import { BURETTE_CAPACITY, useTitration } from "./titrationStore";
import "../shared/tool-layout.css";
import "./titration.css";

const KINDS: Array<{ kind: Solute["kind"]; label: string }> = [
  { kind: "strong acid", label: "Strong acids" },
  { kind: "weak acid", label: "Weak acids" },
  { kind: "strong base", label: "Strong bases" },
  { kind: "weak base", label: "Weak bases" },
  { kind: "neutral", label: "Other" },
];

function SoluteSelect({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {KINDS.map((k) => (
        <optgroup key={k.kind} label={k.label}>
          {SOLUTES.filter((s) => s.kind === k.kind).map((s) => (
            <option key={s.id} value={s.id}>
              {s.formula} — {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** A number the teacher types: concentration or volume, with a sensible floor. */
function NumberInput({ value, onChange, min, max, step, label, width = 90 }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; width?: number }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      style={{ width }}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
    />
  );
}

/**
 * Titration simulator: a burette over a flask, any of the usual acids and
 * bases in either, an indicator, and the pH curve drawn as the titrant runs
 * in. Everything comes from the charge balance in titration.ts, so weak,
 * strong and polyprotic cases all behave.
 */
export default function Titration() {
  const t = useTitration();
  const [customVolume, setCustomVolume] = useState(0.5);
  const [classView, setClassView] = useState(false);
  const [stirring, setStirring] = useState(false);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const setup: Setup = useMemo(
    () => ({
      burette: { solute: soluteById(t.buretteSolute), concentration: t.buretteConcentration },
      flask: { solute: soluteById(t.flaskSolute), concentration: t.flaskConcentration, volume: t.flaskVolume },
    }),
    [t.buretteSolute, t.buretteConcentration, t.flaskSolute, t.flaskConcentration, t.flaskVolume],
  );

  const pH = useMemo(() => pHAfter(setup, t.added), [setup, t.added]);
  const bulkPH = useMemo(() => pHAfter(setup, t.stirredAt), [setup, t.stirredAt]);
  const mixed = t.stirredAt >= t.added - 1e-9;
  // The plume: what has run in since the last stir, met by twice its volume of the flask's solution.
  const plumePH = useMemo(() => {
    if (mixed) return null;
    const unmixed = t.added - t.stirredAt;
    const bulk = flaskAfter(setup, t.stirredAt);
    return pHOf(
      mix([
        ...bulk.parts.map((p) => ({ solute: p.solute, concentration: p.concentration, volume: 2 * unmixed })),
        { solute: setup.burette.solute, concentration: setup.burette.concentration, volume: unmixed },
      ]),
    );
  }, [mixed, setup, t.added, t.stirredAt]);
  const equivalence = useMemo(() => equivalencePoints(setup), [setup]);
  const indicator = t.indicator && t.indicator !== "universal" ? indicatorById(t.indicator) ?? null : null;
  const colour = indicatorColour(t.indicator, mixed ? pH : bulkPH);
  const plumeColour = plumePH === null ? null : indicatorColour(t.indicator, plumePH);
  const flaskVolume = t.flaskVolume + t.added;
  const reveal = !t.hideFlaskConcentration;

  // The tap: run titrant in while it is open.
  useEffect(() => {
    if (!t.tapOpen) return;
    const interval = setInterval(() => useTitration.getState().add(useTitration.getState().tapRate * 0.05), 50);
    return () => clearInterval(interval);
  }, [t.tapOpen]);

  const stir = () => {
    t.stir();
    setStirring(true);
    setTimeout(() => setStirring(false), 900);
  };

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

  const burette = setup.burette.solute;
  const flask = setup.flask.solute;
  const solubilityWarning = [setup.burette, setup.flask]
    .filter((p) => p.solute.solubility !== undefined && p.concentration > p.solute.solubility)
    .map((p) => `${p.solute.formula} only dissolves to about ${concentrationText(p.solute.solubility!)}; at ${concentrationText(p.concentration)} it would be a suspension. The simulation treats it as dissolved.`);
  const empty = t.added >= BURETTE_CAPACITY - 1e-9;

  const addButtons = (
    <div className="ti-add">
      {[0.05, 0.5, 1, 5].map((v) => (
        <button key={v} className="small" disabled={empty} onClick={() => t.add(v)} title={v === 0.05 ? "One drop" : undefined}>
          +{formatFixed(v, 2)}
        </button>
      ))}
      <span className="ti-custom">
        <NumberInput label="Volume to add in cm³" value={customVolume} onChange={setCustomVolume} min={0.01} max={BURETTE_CAPACITY} step={0.1} width={70} />
        <button className="small" disabled={empty} onClick={() => t.add(customVolume)}>
          Add cm³
        </button>
      </span>
    </div>
  );

  const runButtons = (
    <div className="row ti-run">
      <button className={t.tapOpen ? "" : "primary"} disabled={empty} onClick={() => t.set({ tapOpen: !t.tapOpen })}>
        <Icon name={t.tapOpen ? "stop_circle" : "play_arrow"} size={20} /> {t.tapOpen ? "Close tap" : "Open tap"}
      </button>
      <button onClick={stir} disabled={mixed && !stirring} title="Swirl the flask so the colour is even">
        <Icon name="restart_alt" size={20} /> Stir
      </button>
      <button onClick={() => t.record(pH)}>
        <Icon name="note_add" size={20} /> Record
      </button>
    </div>
  );

  return (
    <div className={`titration ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="ti-controls">
          <div className="panel">
            {runButtons}
            <div className="row ti-row">
              <span className="ti-label">Tap rate</span>
              <Segmented
                small
                label="Flow rate"
                options={[
                  { value: 0.25, label: "Drops" },
                  { value: 1, label: "Slow" },
                  { value: 4, label: "Fast" },
                ]}
                value={t.tapRate}
                onChange={(v) => t.set({ tapRate: v })}
              />
            </div>
            <div className="ti-label" style={{ marginTop: 10 }}>Add a measured volume (cm³)</div>
            {addButtons}
            <label className="ti-check">
              <input type="checkbox" checked={t.autoMix} onChange={(e) => t.set({ autoMix: e.target.checked, stirredAt: e.target.checked ? t.added : t.stirredAt })} />
              Auto-mix (otherwise stir to see the true colour)
            </label>
            <div className="row ti-row">
              <button onClick={t.reset} title="Refill the burette and start the same titration again">
                <Icon name="restart_alt" size={20} /> Refill &amp; restart
              </button>
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>In the burette</h3>
            <div className="ti-field">
              <SoluteSelect label="Solution in the burette" value={t.buretteSolute} onChange={(id) => t.set({ buretteSolute: id, ...{ added: 0, stirredAt: 0, readings: [], tapOpen: false } })} />
            </div>
            <div className="ti-field">
              <span className="ti-label">Concentration</span>
              <NumberInput label="Burette concentration in mol per dm³" value={t.buretteConcentration} onChange={(v) => t.set({ buretteConcentration: v })} min={0.0001} max={5} step={0.01} />
              <span className="muted">mol·dm⁻³</span>
            </div>
            <p className="muted ti-note">{burette.notes}</p>
          </div>

          <div className="panel">
            <h3>In the flask</h3>
            <div className="ti-field">
              <SoluteSelect label="Solution in the flask" value={t.flaskSolute} onChange={(id) => t.set({ flaskSolute: id, ...{ added: 0, stirredAt: 0, readings: [], tapOpen: false } })} />
            </div>
            <div className="ti-field">
              <span className="ti-label">Concentration</span>
              <NumberInput label="Flask concentration in mol per dm³" value={t.flaskConcentration} onChange={(v) => t.set({ flaskConcentration: v })} min={0.0001} max={5} step={0.01} />
              <span className="muted">mol·dm⁻³</span>
            </div>
            <div className="ti-field">
              <span className="ti-label">Volume</span>
              <NumberInput label="Flask volume in cm³" value={t.flaskVolume} onChange={(v) => t.set({ flaskVolume: v })} min={1} max={100} step={1} />
              <span className="muted">cm³</span>
            </div>
            <label className="ti-check">
              <input type="checkbox" checked={t.hideFlaskConcentration} onChange={(e) => t.set({ hideFlaskConcentration: e.target.checked })} />
              Unknown: hide this concentration and the equivalence volumes
            </label>
            <div className="row">
              <button className="small" onClick={t.swap}>
                <Icon name="swap_horiz" size={18} /> Swap burette and flask
              </button>
            </div>
            <p className="muted ti-note">{flask.notes}</p>
          </div>

          <div className="panel">
            <h3>Indicator</h3>
            <div className="ti-field">
              <select value={t.indicator ?? ""} onChange={(e) => t.set({ indicator: e.target.value || null })} aria-label="Indicator">
                <option value="">None</option>
                <option value="universal">Universal indicator</option>
                {INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({formatNumber(i.low, 1)}–{formatNumber(i.high, 1)})
                  </option>
                ))}
              </select>
            </div>
            {indicator && (
              <p className="muted ti-note">
                Changes from <strong>{indicator.acidName}</strong> below pH {formatNumber(indicator.low, 1)} to <strong>{indicator.baseName}</strong> above pH {formatNumber(indicator.high, 1)}.
              </p>
            )}
            <label className="ti-check">
              <input type="checkbox" checked={t.showWholeCurve} onChange={(e) => t.set({ showWholeCurve: e.target.checked })} />
              Show the whole curve ahead of the titration
            </label>
          </div>
        </div>
      )}

      <div className="ti-main">
        <div className="ti-bench">
          <div className="ti-apparatus-box">
            <Apparatus
              added={t.added}
              flaskVolume={flaskVolume}
              colour={colour}
              plumeColour={plumeColour}
              mixed={mixed}
              stirring={stirring}
              dropKey={t.drops}
              flowing={t.tapOpen}
              reducedMotion={reducedMotion}
              tapLabel={t.tapOpen ? "open" : "closed"}
            />
            {classView && (
              <div className="ti-class-bar">
                {runButtons}
                {addButtons}
                <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
                  <Icon name="close" size={20} /> Close
                </button>
              </div>
            )}
          </div>
          <div className="ti-graph-box">
            <PhGraph setup={setup} added={t.added} currentPH={pH} showWhole={t.showWholeCurve} equivalence={reveal ? equivalence : null} indicator={indicator} readings={t.readings} />
            <div className="ti-readouts">
              <div className="ti-readout">
                <span className="ti-readout-label">Burette reading</span>
                <span className="ti-readout-value">{volumeText(t.added)}</span>
              </div>
              <div className="ti-readout">
                <span className="ti-readout-label">pH{mixed ? "" : " (once mixed)"}</span>
                <span className="ti-readout-value">{formatFixed(pH, 2)}</span>
              </div>
              <div className="ti-readout">
                <span className="ti-readout-label">[H₃O⁺]</span>
                <span className="ti-readout-value small-value">{concentrationFromPH(pH)}</span>
              </div>
              <div className="ti-readout">
                <span className="ti-readout-label">[OH⁻]</span>
                <span className="ti-readout-value small-value">{concentrationFromPH(14 - pH)}</span>
              </div>
              <div className="ti-readout">
                <span className="ti-readout-label">In the flask</span>
                <span className="ti-readout-value small-value">{volumeText(flaskVolume, 1)}</span>
              </div>
            </div>
            {!mixed && <div className="ti-warn">Not mixed yet: the colour where the drops land isn't the flask's. Stir.</div>}
            {empty && <div className="ti-warn">The burette is empty: refill to carry on.</div>}
          </div>
        </div>

        {!classView && (
          <div className="panel ti-memo">
            <h3>The memo</h3>
            <dl className="ti-facts">
              <dt>Set-up</dt>
              <dd>
                {volumeText(t.flaskVolume, 1)} of {reveal ? concentrationText(t.flaskConcentration) : "an unknown concentration of"} {flask.formula} in the flask; {concentrationText(t.buretteConcentration)} {burette.formula} in the burette
                {t.indicator ? `; ${t.indicator === "universal" ? "universal indicator" : indicator?.name}` : "; no indicator"}.
              </dd>
              <dt>Mole ratio</dt>
              <dd>{equivalenceRelation(setup)}</dd>
              {reveal && equivalence.length > 0 && (
                <>
                  <dt>Equivalence</dt>
                  <dd>
                    {equivalence.map((e) => (
                      <div key={e.step}>
                        {equivalence.length > 1 ? `Step ${e.step}: ` : ""}
                        {volumeText(e.volume)} of {burette.formula}
                        {e.volume > BURETTE_CAPACITY ? " (more than the burette holds)" : ""}, pH {formatFixed(e.pH, 2)} at equivalence
                        {suitableIndicators(e.pH).length ? ` — ${suitableIndicators(e.pH).map((i) => i.name).join(", ")} would show it` : " — no indicator here changes near this pH"}.
                      </div>
                    ))}
                  </dd>
                </>
              )}
              {!reveal && (
                <>
                  <dt>Equivalence</dt>
                  <dd className="muted">Hidden: the class finds it from the colour change and works the concentration out.</dd>
                </>
              )}
              {solubilityWarning.map((w, i) => (
                <div className="ti-warn ti-span" key={i}>
                  {w}
                </div>
              ))}
              {t.readings.length > 0 && (
                <>
                  <dt>Readings</dt>
                  <dd>
                    <table className="data ti-readings">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Burette (cm³)</th>
                          <th>pH</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.readings.map((r, i) => (
                          <tr key={i}>
                            <td className="muted">{i + 1}</td>
                            <td>{formatFixed(r.volume, 2)}</td>
                            <td>{formatFixed(r.pH, 2)}</td>
                            <td>
                              <button className="small icon-only danger" title="Remove this reading" aria-label="Remove this reading" onClick={() => t.removeReading(i)}>
                                <Icon name="close" size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
