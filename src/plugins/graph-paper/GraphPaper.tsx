import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { savePluginFile } from "../host";
import { MAX_CANVAS_PX, canvasToPng } from "../png";
import { formatNumber } from "../numbers";
import {
  DEFAULT_GRAPH_PAPER,
  GraphPaperSettings,
  XAxisPosition,
  computeLayout,
  describeSize,
  drawOnCanvas,
  fileNameFor,
} from "./drawing";

/**
 * Number entry with big +/− buttons either side. The app is built for a touch
 * panel, where the native spinner arrows are far too small to hit.
 */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const decimals = step < 1 ? 2 : 0;
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(decimals))));
  const nudge = (dir: number) => onChange(clamp(value + dir * step));

  return (
    <label className={`gp-field ${disabled ? "disabled" : ""}`}>
      <span className="gp-field-label">
        {label}
        {suffix ? <span className="muted"> ({suffix})</span> : null}
      </span>
      <span className="gp-number">
        <button className="small" disabled={disabled} onClick={() => nudge(-1)} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          // A half-typed value is left alone while typing, then pulled into range.
          onBlur={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? clamp(n) : min);
          }}
        />
        <button className="small" disabled={disabled} onClick={() => nudge(1)} aria-label={`Increase ${label}`}>
          +
        </button>
      </span>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
  disabled,
  indent,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  return (
    <label className={`gp-check ${indent ? "indent" : ""} ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="gp-field">
      <span className="gp-field-label">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * Graph paper generator. Everything is set in millimetres and drawn at 300 dpi,
 * so the saved PNG prints — and lands in Word — at exactly the size shown.
 */
export default function GraphPaper() {
  const { showToast } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [v, setV] = useState<GraphPaperSettings>(DEFAULT_GRAPH_PAPER);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof GraphPaperSettings>(key: K, value: GraphPaperSettings[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const layout = useMemo(() => computeLayout(v), [v]);

  // Redraw after a short pause: a big sheet is millions of pixels, and holding
  // down a stepper shouldn't repaint every one of them on the way.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge) return;
    const timer = setTimeout(() => drawOnCanvas(canvas, v), 90);
    return () => clearTimeout(timer);
  }, [v, layout.tooLarge]);

  // Switching the y-axis line off takes its arrows with it, so the drawing and
  // the tick boxes can never disagree.
  const setYAxis = (on: boolean) =>
    setV((prev) => ({ ...prev, yAxisLine: on, ...(on ? {} : { yArrowTop: false, yArrowBottom: false }) }));
  const setXAxis = (on: boolean) =>
    setV((prev) => ({ ...prev, xAxisLine: on, ...(on ? {} : { xArrowRight: false }) }));

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      // Draw once more first: the preview may still be inside its redraw pause.
      drawOnCanvas(canvas, v);
      const bytes = await canvasToPng(canvas);
      const outcome = await savePluginFile({
        name: fileNameFor(v),
        extension: "png",
        label: "PNG image",
        bytes,
      });
      setStatus(outcome.message);
      if (outcome.ok) showToast(`Saved ${fileNameFor(v)}`);
    } catch (e) {
      console.error("Graph paper save failed", e);
      setStatus(`Could not save the file: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setV(DEFAULT_GRAPH_PAPER);
    setStatus("");
  };

  return (
    <div className="graph-paper">
      <div className="gp-controls">
        <div className="panel">
          <div className="row">
            <button className="primary grow" disabled={busy || layout.tooLarge} onClick={() => void save()}>
              {busy ? "Saving…" : "Save PNG…"}
            </button>
            <button onClick={reset}>Reset</button>
          </div>
          <div className="gp-size">{describeSize(v)}</div>
          {status && <div className="gp-status muted">{status}</div>}
          <p className="muted gp-note">
            Saved at 300 dpi, so it prints and inserts into Word at exactly the size above.
          </p>
        </div>

        <div className="panel">
          <h3>Grid</h3>
          <p className="muted gp-note">The big blocks, and the small squares inside each one.</p>
          <NumberField label="Blocks across" value={v.xMajor} onChange={(n) => set("xMajor", n)} min={1} max={50} step={1} />
          <NumberField label="Blocks up" value={v.yMajor} onChange={(n) => set("yMajor", n)} min={1} max={50} step={1} />
          <NumberField label="Minor squares across" value={v.xMinor} onChange={(n) => set("xMinor", n)} min={1} max={20} step={1} />
          <NumberField label="Minor squares up" value={v.yMinor} onChange={(n) => set("yMinor", n)} min={1} max={20} step={1} />
          <NumberField label="Block width" suffix="mm" value={v.xMm} onChange={(n) => set("xMm", n)} min={2} max={100} step={0.05} />
          <NumberField label="Block height" suffix="mm" value={v.yMm} onChange={(n) => set("yMm", n)} min={2} max={100} step={0.05} />
        </div>

        <div className="panel">
          <h3>Line weights</h3>
          <CheckField
            label="Automatic — weights scale with the block size"
            checked={v.autoWeights}
            onChange={(on) => set("autoWeights", on)}
          />
          <p className="muted gp-note">x is the vertical lines, y the horizontal ones.</p>
          <NumberField label="x major" suffix="mm" value={v.xMajorW} onChange={(n) => set("xMajorW", n)} min={0.05} max={5} step={0.05} disabled={v.autoWeights} />
          <NumberField label="x minor" suffix="mm" value={v.xMinorW} onChange={(n) => set("xMinorW", n)} min={0.05} max={5} step={0.05} disabled={v.autoWeights} />
          <NumberField label="y major" suffix="mm" value={v.yMajorW} onChange={(n) => set("yMajorW", n)} min={0.05} max={5} step={0.05} disabled={v.autoWeights} />
          <NumberField label="y minor" suffix="mm" value={v.yMinorW} onChange={(n) => set("yMinorW", n)} min={0.05} max={5} step={0.05} disabled={v.autoWeights} />
          <NumberField label="Axis lines" suffix="mm" value={v.axisW} onChange={(n) => set("axisW", n)} min={0.1} max={5} step={0.05} disabled={v.autoWeights} />
        </div>

        <div className="panel">
          <h3>Axes &amp; arrows</h3>
          <CheckField label="Dark line on the y-axis" checked={v.yAxisLine} onChange={setYAxis} />
          <CheckField label="Arrow at the top" checked={v.yArrowTop} onChange={(on) => set("yArrowTop", on)} disabled={!v.yAxisLine} indent />
          <CheckField label="Arrow at the bottom" checked={v.yArrowBottom} onChange={(on) => set("yArrowBottom", on)} disabled={!v.yAxisLine} indent />
          <CheckField label="Dark line on the x-axis" checked={v.xAxisLine} onChange={setXAxis} />
          <CheckField label="Arrow at the right" checked={v.xArrowRight} onChange={(on) => set("xArrowRight", on)} disabled={!v.xAxisLine} indent />
          <label className="gp-field">
            <span className="gp-field-label">x-axis position</span>
            <select value={v.xAxisPosition} onChange={(e) => set("xAxisPosition", e.target.value as XAxisPosition)}>
              <option value="bottom">Bottom — quadrant 1</option>
              <option value="middle">Middle — quadrants 1 &amp; 4</option>
            </select>
          </label>
          <NumberField label="Arrowhead size" suffix="mm" value={v.arrowSize} onChange={(n) => set("arrowSize", n)} min={0.5} max={30} step={0.05} />
        </div>

        <div className="panel">
          <h3>Tick marks</h3>
          <p className="muted gp-note">Ticks straddle the axis, half the length each side. The one at the origin is left out.</p>
          <CheckField label="Ticks on the x-axis" checked={v.xTicks} onChange={(on) => set("xTicks", on)} />
          <NumberField label="x-tick length" suffix="mm" value={v.xTickLen} onChange={(n) => set("xTickLen", n)} min={0.5} max={50} step={0.05} disabled={!v.xTicks} />
          <NumberField label="x-tick weight" suffix="mm" value={v.xTickW} onChange={(n) => set("xTickW", n)} min={0.05} max={5} step={0.05} disabled={!v.xTicks || v.autoWeights} />
          <CheckField label="Ticks on the y-axis" checked={v.yTicks} onChange={(on) => set("yTicks", on)} />
          <NumberField label="y-tick length" suffix="mm" value={v.yTickLen} onChange={(n) => set("yTickLen", n)} min={0.5} max={50} step={0.05} disabled={!v.yTicks} />
          <NumberField label="y-tick weight" suffix="mm" value={v.yTickW} onChange={(n) => set("yTickW", n)} min={0.05} max={5} step={0.05} disabled={!v.yTicks || v.autoWeights} />
        </div>

        <div className="panel">
          <h3>Colours</h3>
          <ColorField label="Major gridlines" value={v.majorColor} onChange={(c) => set("majorColor", c)} />
          <ColorField label="Minor gridlines" value={v.minorColor} onChange={(c) => set("minorColor", c)} />
          <ColorField label="x-axis line and arrow" value={v.xAxisColor} onChange={(c) => set("xAxisColor", c)} />
          <ColorField label="y-axis line and arrow" value={v.yAxisColor} onChange={(c) => set("yAxisColor", c)} />
          <ColorField label="Tick marks" value={v.tickColor} onChange={(c) => set("tickColor", c)} />
        </div>
      </div>

      <div className="gp-preview">
        {layout.tooLarge ? (
          <div className="gp-too-large muted">
            <b>Too big to draw</b>
            <p>
              That comes to {formatNumber(layout.width)} × {formatNumber(layout.height)} pixels at 300 dpi, past the{" "}
              {formatNumber(MAX_CANVAS_PX)} a page can hold. Use fewer increments or a smaller block size.
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="gp-canvas" />
        )}
      </div>
    </div>
  );
}
