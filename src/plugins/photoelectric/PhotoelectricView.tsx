import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng, mm } from "../png";
import { formatFixed, formatNumber } from "../numbers";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { printCanvas, sizeCanvas } from "../shared/canvas";
import { Memo, NumberField } from "../shared/SimControls";
import {
  APP_H,
  APP_W,
  COLLECTOR,
  Electron,
  EnergyUnit,
  Flash,
  GRAPH_H,
  GRAPH_W,
  GraphKind,
  LEVELS_H,
  LEVELS_W,
  Photon,
  SPEC_H,
  SPEC_W,
  drawCell,
  drawFingerprints,
  drawGraph,
  drawHydrogenSpectrum,
  drawLevels,
  fingerprintsHeight,
  levelAt,
  photonPath,
} from "./drawing";
import { CONSTANTS_NOTE, ev2, photoMemo, sci, sig3, transitionMemo } from "./memo";
import {
  CUSTOM_METAL,
  ELEMENTS,
  EV,
  HYDROGEN_LEVELS,
  METALS,
  colourName,
  elementById,
  emission,
  frequencyOf,
  photocurrent,
  thresholdFrequency,
  transition,
  wavelengthOf,
} from "./photons";
import { SpectraMode, Tab, metalOf, usePhotons } from "./photonStore";
import "../shared/sim-controls.css";

const PRINT_MM_PER_UNIT = 0.15;
/** Photons drawn a second at full intensity (a picture of the rate, not the rate). */
const PHOTONS_A_SECOND = 14;
const PHOTON_SPEED = 900;

/**
 * Photons and electrons: light on a metal in a vacuum photocell, with the
 * Eₖ(max)–f graph and the memo; and hydrogen's energy levels, the line
 * spectrum its falls make, and the fingerprints of the discharge tubes.
 */
export default function PhotoelectricView() {
  const { showToast } = useAppPick("showToast");
  const s = usePhotons();
  const { tab, params: p, options: o } = s;
  const metal = metalOf(p);
  const e = emission(p.frequency, metal.workFunction);
  const lambda = wavelengthOf(p.frequency);
  const q = o.question;
  const [classView, setClassView] = useState(false);
  const [lightOn, setLightOn] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const cellRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<HTMLCanvasElement | null>(null);
  const levelsRef = useRef<HTMLCanvasElement | null>(null);
  const specRef = useRef<HTMLCanvasElement | null>(null);

  // ---------- the animation ----------

  const photons = useRef<Photon[]>([]);
  const electrons = useRef<Electron[]>([]);
  const flashes = useRef<Flash[]>([]);
  const spawn = useRef(0);
  const dischargeClock = useRef(0);
  const lightOnRef = useRef(lightOn);
  lightOnRef.current = lightOn;
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
      const st = usePhotons.getState();
      let moved = false;
      if (st.tab === "photoelectric") {
        const m = metalOf(st.params);
        const em = emission(st.params.frequency, m.workFunction);
        // New photons, at a rate that pictures the intensity.
        if (lightOnRef.current && st.params.intensity > 0) {
          spawn.current += dt * PHOTONS_A_SECOND * (st.params.intensity / 100);
          while (spawn.current >= 1) {
            spawn.current -= 1;
            photons.current.push({ u: Math.random() * 2 - 1, s: 0 });
          }
        }
        const keep: Photon[] = [];
        for (const ph of photons.current) {
          const path = photonPath(ph.u);
          const len = Math.hypot(path.to.x - path.from.x, path.to.y - path.from.y);
          ph.s += (dt * PHOTON_SPEED) / len;
          if (ph.s < 1) {
            keep.push(ph);
            continue;
          }
          if (em.emitted) {
            // Electrons leave at up to v_max; the drawing's speed pictures it.
            const speed = (40 + 330 * Math.min(1.4, em.vMax / 1.2e6)) * (0.7 + 0.3 * Math.random());
            const tx = COLLECTOR.x + 6;
            const ty = COLLECTOR.top + 10 + Math.random() * (COLLECTOR.bottom - COLLECTOR.top - 20);
            const d = Math.hypot(tx - path.to.x, ty - path.to.y);
            electrons.current.push({ x: path.to.x - 8, y: path.to.y, vx: ((tx - path.to.x) / d) * speed, vy: ((ty - path.to.y) / d) * speed });
          } else flashes.current.push({ x: path.to.x - 4, y: path.to.y, age: 0 });
        }
        photons.current = keep;
        electrons.current = electrons.current.filter((el) => {
          el.x += el.vx * dt;
          el.y += el.vy * dt;
          return el.x > COLLECTOR.x + 6;
        });
        flashes.current = flashes.current.filter((f) => (f.age += dt) < 0.4);
        moved = photons.current.length > 0 || electrons.current.length > 0 || flashes.current.length > 0;
      } else {
        if (st.discharge && st.mode === "hydrogen") {
          dischargeClock.current += dt;
          if (dischargeClock.current > 0.45) {
            dischargeClock.current = 0;
            // A collision in the tube lifts the electron; it falls back a level or more at a time.
            if (st.electron === 1 || Math.random() < 0.15) st.moveTo(2 + Math.floor(Math.random() * (HYDROGEN_LEVELS.length - 1)));
            else st.moveTo(1 + Math.floor(Math.random() * (st.electron - 1)));
          }
        }
        moved = performance.now() - st.photonAt < 1200;
      }
      if (!moved && !dirty.current) return;
      dirty.current = false;
      draw();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const graphState = () => {
    const st = usePhotons.getState();
    const m = metalOf(st.params);
    const cmp = st.params.compareId ? METALS.find((x) => x.id === st.params.compareId) : undefined;
    return {
      frequency: st.params.frequency,
      workFunction: m.workFunction,
      intensity: lightOnRef.current ? st.params.intensity : 0,
      metalName: m.name,
      compare: cmp && cmp.name !== m.name ? { name: cmp.name, workFunction: cmp.workFunction } : null,
    };
  };

  const cellState = () => {
    const st = usePhotons.getState();
    const m = metalOf(st.params);
    const em = emission(st.params.frequency, m.workFunction);
    const intensity = lightOnRef.current ? st.params.intensity : 0;
    const i = photocurrent(intensity, em);
    return {
      wavelength: wavelengthOf(st.params.frequency),
      intensity,
      metalName: m.name,
      workFunction: m.workFunction,
      emitted: em.emitted,
      current: i / 10e-6,
      currentText: `${formatFixed(i * 1e6, 1)} µA`,
    };
  };

  const spectrumCounts = () =>
    Object.entries(usePhotons.getState().falls).map(([k, n]) => {
      const [from, to] = k.split("-").map(Number);
      return { t: transition(from, to), n };
    });

  const fingerprintRows = () => {
    const st = usePhotons.getState();
    const rows = ELEMENTS.filter((el) => st.options.shown.includes(el.id)).map((el) => ({ el, hidden: false }));
    const mystery = st.mystery ? elementById(st.mystery) : undefined;
    if (mystery) rows.push({ el: mystery, hidden: !st.revealed });
    return rows;
  };

  const draw = () => {
    const st = usePhotons.getState();
    const fit = classViewRef.current;
    const look = { screen: true, question: st.options.question };
    if (st.tab === "photoelectric") {
      const cell = cellRef.current && sizeCanvas(cellRef.current, APP_W, APP_H, fit);
      if (cell) drawCell(cell, cellState(), photons.current, electrons.current, flashes.current, look);
      const graph = graphRef.current && sizeCanvas(graphRef.current, GRAPH_W, GRAPH_H, fit);
      if (graph) drawGraph(graph, st.options.graph, graphState(), st.options.unit, { ...look, values: st.options.values, extend: st.options.extend, gradient: st.options.gradient });
    } else {
      const last = st.last ? transition(st.last.from, st.last.to) : null;
      if (st.mode === "hydrogen") {
        const lev = levelsRef.current && sizeCanvas(levelsRef.current, LEVELS_W, LEVELS_H, fit);
        const falls = spectrumCounts().map((c) => c.t);
        if (lev) drawLevels(lev, st.electron, falls, last, st.excite, (performance.now() - st.photonAt) / 1000, { ...look, toScale: st.options.toScale, energies: st.options.energies });
        const spec = specRef.current && sizeCanvas(specRef.current, SPEC_W, SPEC_H, fit);
        if (spec) drawHydrogenSpectrum(spec, spectrumCounts(), look);
      } else {
        const rows = fingerprintRows();
        const spec = specRef.current && sizeCanvas(specRef.current, SPEC_W, fingerprintsHeight(rows.length), fit);
        if (spec) drawFingerprints(spec, rows, look);
      }
    }
  };

  const onLevelsDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * LEVELS_W;
    const y = ((ev.clientY - rect.top) / rect.height) * LEVELS_H;
    const n = levelAt(x, y, o.toScale);
    if (n !== null) s.moveTo(n);
  };

  // ---------- actions ----------

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
    const onKey = (k: KeyboardEvent) => {
      if (k.key === "Escape") closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  type What = "cell" | "graph" | "levels" | "spectrum";
  const save = async (what: What) => {
    setBusy(true);
    setStatus("Saving…");
    try {
      const rows = fingerprintRows();
      const [W, H] =
        what === "cell" ? [APP_W, APP_H] : what === "graph" ? [GRAPH_W, GRAPH_H] : what === "levels" ? [LEVELS_W, LEVELS_H] : [SPEC_W, s.mode === "hydrogen" ? SPEC_H : fingerprintsHeight(rows.length)];
      const { canvas, ctx } = printCanvas(W, H, mm(PRINT_MM_PER_UNIT));
      const look = { screen: false, question: q };
      if (what === "cell") drawCell(ctx, cellState(), photons.current, electrons.current, [], look);
      else if (what === "graph") drawGraph(ctx, o.graph, graphState(), o.unit, { ...look, values: o.values, extend: o.extend, gradient: o.gradient });
      else if (what === "levels") {
        const last = s.last ? transition(s.last.from, s.last.to) : null;
        drawLevels(ctx, s.electron, spectrumCounts().map((c) => c.t), last, s.excite, 10, { ...look, toScale: o.toScale, energies: o.energies });
      } else if (s.mode === "hydrogen") drawHydrogenSpectrum(ctx, spectrumCounts(), look);
      else drawFingerprints(ctx, rows, look);
      const bytes = await canvasToPng(canvas);
      const name =
        what === "cell"
          ? `photocell_${metal.name.toLowerCase().replace(/\s+/g, "_")}_${Math.round(lambda)}nm.png`
          : what === "graph"
            ? `photoelectric_graph_${o.graph}.png`
            : what === "levels"
              ? "hydrogen_energy_levels.png"
              : s.mode === "hydrogen"
                ? "hydrogen_spectrum.png"
                : "emission_spectra.png";
      const outcome = await savePluginFile({ name, extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${name}`);
    } catch (err) {
      console.error("Photoelectric picture save failed", err);
      setStatus(`Could not save the picture: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- panels ----------

  const steps = useMemo(
    () => photoMemo({ frequency: p.frequency, setBy: p.setBy, workFunction: metal.workFunction, metalName: metal.name, intensity: lightOn ? p.intensity : 0 }),
    [p.frequency, p.setBy, metal.workFunction, metal.name, p.intensity, lightOn],
  );
  const lastT = s.last ? transition(s.last.from, s.last.to) : null;
  const hidden = "?";
  const current = photocurrent(lightOn ? p.intensity : 0, e);

  const photoReadouts = (
    <div className="sim-readouts">
      <div className="sim-readout">
        <span className="sim-readout-label">Wavelength λ</span>
        <span className="sim-readout-value">{sig3(lambda)} nm</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Frequency f</span>
        <span className="sim-readout-value">{sci(p.frequency)} Hz</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Photon energy E</span>
        <span className="sim-readout-value">{q ? hidden : `${ev2(e.energy / EV)} eV`}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Work function W₀</span>
        <span className="sim-readout-value">{formatNumber(metal.workFunction, 2)} eV</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Eₖ(max)</span>
        <span className="sim-readout-value">{q ? hidden : e.emitted ? `${ev2(e.ekMax / EV)} eV` : "none"}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">
          v<sub>max</sub>
        </span>
        <span className="sim-readout-value">{q ? hidden : e.emitted ? `${sci(e.vMax)} m·s⁻¹` : "—"}</span>
      </div>
      <div className="sim-readout">
        <span className="sim-readout-label">Current</span>
        <span className="sim-readout-value">{q ? hidden : `${formatFixed(current * 1e6, 1)} µA`}</span>
      </div>
    </div>
  );

  const lightButton = (
    <button className={lightOn ? "" : "primary"} onClick={() => setLightOn(!lightOn)}>
      <Icon name={lightOn ? "pause" : "play_arrow"} size={20} /> {lightOn ? "Light off" : "Light on"}
    </button>
  );
  const questionButton = (
    <button onClick={() => s.setOptions({ question: !q })}>
      <Icon name={q ? "visibility" : "quiz"} size={20} /> {q ? "Show the answers" : "Question mode"}
    </button>
  );

  const tabs = (
    <div className="sim-seg">
      <Segmented<Tab>
        label="Photoelectric effect or emission spectra"
        options={[
          { value: "photoelectric", label: "Photoelectric effect" },
          { value: "spectra", label: "Emission spectra" },
        ]}
        value={tab}
        onChange={(v) => s.setTab(v)}
      />
    </div>
  );

  const photoControls = (
    <>
      <div className="panel">
        {tabs}
        <div className="row sim-row">
          {lightButton}
          {questionButton}
        </div>
        <div className="row sim-row">
          <button onClick={openClassView} title="Fill the screen so the class can see it">
            <Icon name="co_present" size={20} /> Show to class
          </button>
        </div>
        <div className="row sim-row">
          <button className="small" disabled={busy} onClick={() => void save("cell")}>
            <Icon name="save" size={18} /> Save the photocell…
          </button>
          <button className="small" disabled={busy} onClick={() => void save("graph")}>
            <Icon name="save" size={18} /> Save the graph…
          </button>
        </div>
        {status && <div className="sim-status muted">{status}</div>}
      </div>

      <div className="panel">
        <h3>The light</h3>
        <div className="sim-seg">
          <Segmented<"wavelength" | "frequency">
            small
            label="Set the light by"
            options={[
              { value: "wavelength", label: "By wavelength" },
              { value: "frequency", label: "By frequency" },
            ]}
            value={p.setBy}
            onChange={(v) => s.setParams({ setBy: v })}
          />
        </div>
        {p.setBy === "wavelength" ? (
          <NumberField label="Wavelength, λ" unit="nm" value={Math.round(lambda * 10) / 10} min={100} max={1000} step={1} decimals={1} slider onChange={(v) => s.setParams({ frequency: frequencyOf(v) })} />
        ) : (
          <NumberField
            label="Frequency, f"
            unit="× 10¹⁴ Hz"
            value={Math.round(p.frequency / 1e12) / 100}
            min={3}
            max={30}
            step={0.05}
            decimals={2}
            slider
            onChange={(v) => s.setParams({ frequency: v * 1e14 })}
          />
        )}
        <p className="muted sim-note">
          {colourName(lambda) === "ultraviolet" || colourName(lambda) === "infrared" ? `${colourName(lambda)[0].toUpperCase()}${colourName(lambda).slice(1)}: invisible, drawn grey.` : `Visible: ${colourName(lambda)} light.`}
        </p>
        <NumberField label="Intensity" unit="%" value={p.intensity} min={0} max={100} step={1} decimals={0} slider onChange={(v) => s.setParams({ intensity: Math.round(v) })} />
        <p className="muted sim-note">Intensity here is the number of photons arriving each second.</p>
      </div>

      <div className="panel">
        <h3>The metal</h3>
        <select className="sim-select" aria-label="Metal" value={p.metalId} onChange={(ev) => s.setParams({ metalId: ev.target.value })}>
          {METALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {formatNumber(m.workFunction, 2)} eV
            </option>
          ))}
          <option value={CUSTOM_METAL}>Your own work function…</option>
        </select>
        {p.metalId === CUSTOM_METAL && (
          <NumberField label="Work function, W₀" unit="eV" value={p.customW0} min={0.5} max={10} step={0.01} decimals={2} onChange={(v) => s.setParams({ customW0: v })} />
        )}
        <p className="muted sim-note">
          f₀ = {sci(thresholdFrequency(metal.workFunction))} Hz; λ₀ = {sig3(wavelengthOf(thresholdFrequency(metal.workFunction)))} nm. Tables in papers differ a little — type the paper's value under "Your own".
        </p>
      </div>

      <div className="panel">
        <h3>The graph</h3>
        <select className="sim-select" aria-label="Graph" value={o.graph} onChange={(ev) => s.setOptions({ graph: ev.target.value as GraphKind })}>
          <option value="ek-f">Eₖ(max) against frequency</option>
          <option value="ek-i">Eₖ(max) against intensity</option>
          <option value="i-i">Current against intensity</option>
        </select>
        <div className="row sim-row">
          <span className="sim-field-label">Energy in</span>
          <Segmented<EnergyUnit>
            small
            label="Energy unit"
            options={[
              { value: "J", label: "J" },
              { value: "eV", label: "eV" },
            ]}
            value={o.unit}
            onChange={(v) => s.setOptions({ unit: v })}
          />
        </div>
        {o.graph === "ek-f" && (
          <>
            <select className="sim-select" aria-label="Compare with" value={p.compareId} onChange={(ev) => s.setParams({ compareId: ev.target.value })} style={{ marginTop: 10 }}>
              <option value="">Compare with another metal: none</option>
              {METALS.map((m) => (
                <option key={m.id} value={m.id}>
                  Compare with {m.name} ({formatNumber(m.workFunction, 2)} eV)
                </option>
              ))}
            </select>
            <label className="sim-check">
              <input type="checkbox" checked={o.extend} onChange={(ev) => s.setOptions({ extend: ev.target.checked })} />
              Extend the line to the energy axis (−W₀)
            </label>
            <label className="sim-check">
              <input type="checkbox" checked={o.gradient} onChange={(ev) => s.setOptions({ gradient: ev.target.checked })} />
              Show the gradient (h)
            </label>
          </>
        )}
        <label className="sim-check">
          <input type="checkbox" checked={o.values} onChange={(ev) => s.setOptions({ values: ev.target.checked })} />
          Numbers on the axes
        </label>
      </div>
    </>
  );

  const [from, setFrom] = useState(3);
  const [to, setTo] = useState(2);
  const spectraControls = (
    <>
      <div className="panel">
        {tabs}
        <div className="sim-seg">
          <Segmented<SpectraMode>
            small
            label="What to show"
            options={[
              { value: "hydrogen", label: "Hydrogen's levels" },
              { value: "elements", label: "Element fingerprints" },
            ]}
            value={s.mode}
            onChange={(v) => s.setMode(v)}
          />
        </div>
        <div className="row sim-row">
          {questionButton}
          <button onClick={openClassView} title="Fill the screen so the class can see it">
            <Icon name="co_present" size={20} /> Show to class
          </button>
        </div>
        <div className="row sim-row">
          {s.mode === "hydrogen" && (
            <button className="small" disabled={busy} onClick={() => void save("levels")}>
              <Icon name="save" size={18} /> Save the levels…
            </button>
          )}
          <button className="small" disabled={busy} onClick={() => void save("spectrum")}>
            <Icon name="save" size={18} /> Save the spectrum…
          </button>
        </div>
        {status && <div className="sim-status muted">{status}</div>}
      </div>
      {s.mode === "hydrogen" ? (
        <div className="panel">
          <h3>An electron falls</h3>
          <div className="row sim-row">
            <label className="sim-field-label">
              From n ={" "}
              <select aria-label="From level" value={from} onChange={(ev) => setFrom(Number(ev.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="sim-field-label">
              to n ={" "}
              <select aria-label="To level" value={Math.min(to, from - 1)} onChange={(ev) => setTo(Number(ev.target.value))}>
                {Array.from({ length: from - 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" onClick={() => s.fall(from, Math.min(to, from - 1))}>
              Fall
            </button>
          </div>
          <p className="muted sim-note">Or tap a level in the diagram: above the electron to excite it, below to make it fall and give out a photon.</p>
          <div className="row sim-row">
            <button className={s.discharge ? "" : "primary"} onClick={() => s.setDischarge(!s.discharge)}>
              <Icon name={s.discharge ? "pause" : "play_arrow"} size={20} /> {s.discharge ? "Stop the discharge" : "Run the discharge tube"}
            </button>
            <button onClick={s.clearSpectrum}>
              <Icon name="restart_alt" size={20} /> Clear
            </button>
          </div>
          <p className="muted sim-note">The discharge tube excites atom after atom, and every fall adds to the spectrum: the lines build up.</p>
          <label className="sim-check">
            <input type="checkbox" checked={o.toScale} onChange={(ev) => s.setOptions({ toScale: ev.target.checked })} />
            Draw the levels to scale
          </label>
          <label className="sim-check">
            <input type="checkbox" checked={o.energies} onChange={(ev) => s.setOptions({ energies: ev.target.checked })} />
            Show each level's energy
          </label>
        </div>
      ) : (
        <div className="panel">
          <h3>Discharge tubes</h3>
          {ELEMENTS.map((el) => (
            <label key={el.id} className="sim-check">
              <input
                type="checkbox"
                checked={o.shown.includes(el.id)}
                onChange={(ev) => s.setOptions({ shown: ev.target.checked ? [...o.shown, el.id] : o.shown.filter((x) => x !== el.id) })}
              />
              {el.name}
            </label>
          ))}
          <div className="row sim-row">
            <button onClick={s.newMystery}>
              <Icon name="quiz" size={20} /> {s.mystery ? "Another mystery tube" : "Mystery tube"}
            </button>
            {s.mystery && !s.revealed && <button onClick={s.reveal}>Reveal</button>}
          </div>
          <p className="muted sim-note">
            {s.mystery
              ? s.revealed
                ? `The mystery tube is ${elementById(s.mystery)?.name.toLowerCase()}: its lines match line for line.`
                : "Which gas is in the mystery tube? Match its lines to one of the tubes above."
              : "A mystery tube adds an unnamed spectrum for the class to identify."}
          </p>
        </div>
      )}
    </>
  );

  const examPoints = (
    <dl className="sim-steps">
      <dt>Electrons</dt>
      <dd>Electrons — not atoms — are emitted, called photoelectrons. One photon gives all its energy to one electron.</dd>
      <dt>Threshold</dt>
      <dd>Compare f with f₀, or E with W₀ — never f with W₀. Below f₀ nothing is emitted, however intense the light.</dd>
      <dt>Intensity</dt>
      <dd>More intense light: more photons a second, so more electrons a second (a bigger current) — but the same Eₖ(max).</dd>
      <dt>Frequency</dt>
      <dd>Higher frequency: more energy per photon, so a bigger Eₖ(max) — the number of electrons a second is unchanged.</dd>
      <dt>The graph</dt>
      <dd>Eₖ(max) against f is a straight line: gradient h, x-intercept f₀, y-intercept −W₀. Every metal's line has the same gradient.</dd>
      <dt>Significance</dt>
      <dd>The photoelectric effect establishes the quantum theory and shows the particle nature of light.</dd>
      <dt>Units</dt>
      <dd>nm → m (× 10⁻⁹) and eV → J (× 1,6 × 10⁻¹⁹) before E = hf.</dd>
    </dl>
  );

  const spectraPoints = (
    <dl className="sim-steps">
      <dt>The source</dt>
      <dd>In a discharge tube, the gas's atoms are excited: their electrons move to higher energy levels. As an electron returns to a lower energy level, the energy difference is given out as a photon, E = hf = ΔE.</dd>
      <dt>Lines</dt>
      <dd>The levels have fixed energies, so only certain energy differences — and so only certain frequencies — are possible: a line spectrum, not a continuous one.</dd>
      <dt>Fingerprints</dt>
      <dd>Every element has its own energy levels, so its own set of lines: its emission spectrum identifies it.</dd>
      <dt>In words</dt>
      <dd>Say "moves from a higher energy level to a lower energy level"; "jumps" or "moves" without the energy levels earns nothing.</dd>
    </dl>
  );

  const photoBoard = (
    <div className={`sim-board ${classView ? "class-view" : ""}`}>
      <div className="sim-canvas-box">
        <canvas ref={cellRef} className="sim-canvas sim-picture" role="img" aria-label={`Photocell: ${sig3(lambda)} nm light on ${metal.name.toLowerCase()}; ${e.emitted ? "electrons emitted" : "no electrons emitted"}`} />
      </div>
      <div className="sim-canvas-box">
        <canvas ref={graphRef} className="sim-canvas" role="img" aria-label="Photoelectric graph" />
      </div>
      {photoReadouts}
      {classView && (
        <div className="sim-class-bar">
          {lightButton}
          {questionButton}
          <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
            <Icon name="close" size={20} /> Close
          </button>
        </div>
      )}
    </div>
  );

  const spectraBoard = (
    <div className={`sim-board ${classView ? "class-view" : ""}`}>
      {s.mode === "hydrogen" && (
        <div className="sim-canvas-box">
          <canvas
            ref={levelsRef}
            className="sim-canvas sim-picture"
            role="img"
            aria-label={`Hydrogen's energy levels; the electron is on n = ${s.electron}`}
            onPointerDown={onLevelsDown}
            style={{ cursor: "pointer" }}
          />
        </div>
      )}
      <div className={`sim-canvas-box ${s.mode === "elements" ? "sim-wide" : ""}`}>
        <canvas ref={specRef} className="sim-canvas" role="img" aria-label="Emission spectrum" />
      </div>
      {classView && (
        <div className="sim-class-bar">
          {s.mode === "hydrogen" && (
            <button className={s.discharge ? "" : "primary"} onClick={() => s.setDischarge(!s.discharge)}>
              <Icon name={s.discharge ? "pause" : "play_arrow"} size={20} /> {s.discharge ? "Stop" : "Run the tube"}
            </button>
          )}
          {questionButton}
          <button onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
            <Icon name="close" size={20} /> Close
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className={`sim-tool photoelectric ${classView ? "class-view" : ""}`}>
      {!classView && <div className="sim-controls">{tab === "photoelectric" ? photoControls : spectraControls}</div>}
      <div className="sim-main">
        {tab === "photoelectric" ? photoBoard : spectraBoard}
        {!classView && tab === "photoelectric" && (
          <div className="panel sim-notes">
            {q ? (
              <p className="muted sim-hidden">Question mode: the working is hidden. Switch it off to show the memo.</p>
            ) : (
              <>
                <h3>The memo</h3>
                <Memo steps={steps} />
                <p className="muted sim-note">{CONSTANTS_NOTE} Worked with unrounded values; answers to three significant figures.</p>
              </>
            )}
            <h3 style={{ marginTop: 14 }}>Exam points</h3>
            {examPoints}
          </div>
        )}
        {!classView && tab === "spectra" && (
          <div className="panel sim-notes">
            {s.mode === "hydrogen" &&
              (q ? (
                <p className="muted sim-hidden">Question mode: the working is hidden. Switch it off to show the memo.</p>
              ) : lastT ? (
                <>
                  <h3>
                    The memo: n = {lastT.from} → n = {lastT.to}
                  </h3>
                  <Memo steps={transitionMemo(lastT)} />
                  <p className="muted sim-note">
                    {CONSTANTS_NOTE} Measured, hydrogen's red line is at 656 nm; the data sheet's rounded constants give {sig3(transition(3, 2).wavelength)} nm.
                  </p>
                </>
              ) : (
                <p className="muted sim-hidden">Make the electron fall — choose the levels, or tap a level below it — and the working appears here.</p>
              ))}
            <h3 style={{ marginTop: s.mode === "hydrogen" ? 14 : 0 }}>Exam points</h3>
            {spectraPoints}
          </div>
        )}
      </div>
    </div>
  );
}
