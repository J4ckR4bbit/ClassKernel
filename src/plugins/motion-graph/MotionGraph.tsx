import { useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng } from "../png";
import { formatNumber } from "../numbers";
import {
  DEFAULT_JOURNEY,
  DEFAULT_MOTION,
  GraphMode,
  Journey,
  MotionSettings,
  Quantity,
  analyse,
  computeMotionLayout,
  describeStage,
  drawMotion,
  fileNameFor,
  summarise,
} from "./motion";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import "../shared/tool-layout.css";
import "./motion-graph.css";

const QUANTITIES: Array<{ key: Quantity; label: string }> = [
  { key: "position", label: "Position x–t" },
  { key: "velocity", label: "Velocity v–t" },
  { key: "acceleration", label: "Acceleration a–t" },
];

const MODES: Array<{ value: GraphMode; label: string }> = [
  { value: "drawn", label: "Drawn" },
  { value: "blank", label: "Blank" },
  { value: "off", label: "Off" },
];

/** Number entry with big +/− buttons — the app is built for a touch panel. */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));
  return (
    <label className="mg-field">
      <span className="mg-field-label">
        {label}
        {suffix ? <span className="muted"> ({suffix})</span> : null}
      </span>
      <span className="mg-number">
        <button className="small" onClick={() => onChange(clamp(value - step))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
        />
        <button className="small" onClick={() => onChange(clamp(value + step))} aria-label={`Increase ${label}`}>
          +
        </button>
      </span>
    </label>
  );
}

/**
 * Motion graph builder. Describe a journey one stage at a time — how long, and
 * how fast at the end — and the position, velocity and acceleration graphs are
 * worked out from it, so the three can never disagree with each other.
 */
export default function MotionGraph() {
  const { showToast } = useAppPick("showToast");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [journey, setJourney] = useState<Journey>(DEFAULT_JOURNEY);
  const [v, setV] = useState<MotionSettings>(DEFAULT_MOTION);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof MotionSettings>(key: K, value: MotionSettings[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const states = useMemo(() => analyse(journey), [journey]);
  const layout = useMemo(() => computeMotionLayout(states, v), [states, v]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge || layout.empty) return;
    const timer = setTimeout(() => drawMotion(canvas, states, v), 90);
    return () => clearTimeout(timer);
  }, [states, v, layout.tooLarge, layout.empty]);

  const setStage = (i: number, patch: Partial<{ seconds: number; endVelocity: number }>) =>
    setJourney((prev) => ({
      ...prev,
      stages: prev.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));

  const addStage = () =>
    setJourney((prev) => {
      const last = prev.stages[prev.stages.length - 1];
      return { ...prev, stages: [...prev.stages, { seconds: 2, endVelocity: last ? last.endVelocity : 0 }] };
    });

  const removeStage = (i: number) =>
    setJourney((prev) => ({ ...prev, stages: prev.stages.filter((_, j) => j !== i) }));

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge || layout.empty) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      drawMotion(canvas, states, v); // the preview may still be inside its pause
      const bytes = await canvasToPng(canvas);
      const outcome = await savePluginFile({ name: fileNameFor(v), extension: "png", label: "PNG image", bytes });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${fileNameFor(v)}`);
    } catch (e) {
      console.error("Motion graph save failed", e);
      setStatus(`Could not save the file: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // The two versions of the same figure a question needs.
  const memoVersion = () => setV((prev) => ({ ...prev, position: "drawn", velocity: "drawn", acceleration: "drawn" }));
  const questionVersion = () =>
    setV((prev) => ({ ...prev, velocity: "drawn", position: "blank", acceleration: "blank" }));

  return (
    <div className="motion-graph">
      <div className="mg-controls">
        <div className="panel">
          <div className="row">
            <button className="primary grow" disabled={busy || layout.empty} onClick={() => void save()}>
              {busy ? "Saving…" : "Save PNG…"}
            </button>
            <button onClick={() => setJourney(DEFAULT_JOURNEY)}>Reset</button>
          </div>
          {status && <div className="mg-status muted">{status}</div>}
          <p className="muted mg-note tail">
            {layout.empty ? "Add a stage below to start the journey." : summarise(states)}
          </p>
        </div>

        <div className="panel">
          <h3>The journey</h3>
          <p className="muted mg-note">
            One row per stage: how long it lasts, and how fast the object is going at the end of it. Everything else —
            the acceleration, the position — follows from that, so the three graphs always agree.
          </p>
          <NumberField
            label="Starting velocity"
            suffix="m·s⁻¹"
            value={journey.startVelocity}
            onChange={(n) => setJourney((prev) => ({ ...prev, startVelocity: n }))}
            min={-100}
            max={100}
            step={1}
          />
          <NumberField
            label="Starting position"
            suffix="m"
            value={journey.startPosition}
            onChange={(n) => setJourney((prev) => ({ ...prev, startPosition: n }))}
            min={-1000}
            max={1000}
            step={1}
          />
          <table className="data mg-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Lasts (s)</th>
                <th>Ends at (m·s⁻¹)</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {journey.stages.map((s, i) => (
                <tr key={i}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={s.seconds}
                      onChange={(e) => setStage(i, { seconds: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={1}
                      value={s.endVelocity}
                      onChange={(e) => setStage(i, { endVelocity: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <button className="small icon-only danger" title="Remove this stage" aria-label="Remove this stage" onClick={() => removeStage(i)}>
                      <Icon name="close" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={addStage}>+ Stage</button>
          </div>
          {states.length > 0 && (
            <ol className="mg-stages">
              {states.map((s) => (
                <li key={s.index}>{describeStage(s)}</li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <h3>The figure</h3>
          <p className="muted mg-note">
            <b>Blank</b> keeps the axes but leaves the curve out — the version a learner draws on. Same journey, so the
            memo and the question can never drift apart.
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="small" onClick={questionVersion}>
              Question: v–t given
            </button>
            <button className="small" onClick={memoVersion}>
              Memo: all drawn
            </button>
          </div>
          {QUANTITIES.map((q) => (
            <div key={q.key} className="mg-field">
              <span className="mg-field-label">{q.label}</span>
              <Segmented small label={q.label} options={MODES} value={v[q.key]} onChange={(m) => set(q.key, m)} />
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>The sheet</h3>
          <label className="mg-check">
            <input
              type="checkbox"
              checked={v.showStageLines}
              onChange={(e) => set("showStageLines", e.target.checked)}
            />
            <span>Dashed line at each stage boundary</span>
          </label>
          <label className="mg-check">
            <input type="checkbox" checked={v.showGrid} onChange={(e) => set("showGrid", e.target.checked)} />
            <span>Show gridlines</span>
          </label>
          <label className="mg-field">
            <span className="mg-field-label">Title</span>
            <input
              value={v.title}
              placeholder="e.g. A trolley on a track"
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <NumberField label="Width" suffix="mm" value={v.widthMm} onChange={(n) => set("widthMm", n)} min={80} max={220} step={5} />
          <NumberField label="Each graph" suffix="mm" value={v.panelMm} onChange={(n) => set("panelMm", n)} min={25} max={90} step={5} />
          <label className="mg-field">
            <span className="mg-field-label">Curve colour</span>
            <input type="color" value={v.curveColor} onChange={(e) => set("curveColor", e.target.value)} />
          </label>
          <p className="muted mg-note tail">
            Saved at 300 dpi, {formatNumber(v.widthMm)} mm wide on the page.
          </p>
        </div>
      </div>

      <div className="mg-preview">
        {layout.empty ? (
          <div className="mg-empty muted">
            <b>Nothing to draw yet</b>
            <p>Add a stage — and keep at least one graph switched on.</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mg-canvas" />
        )}
      </div>
    </div>
  );
}
