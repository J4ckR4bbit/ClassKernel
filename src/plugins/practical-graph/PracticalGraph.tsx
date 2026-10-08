import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { savePluginFile } from "../host";
import { canvasToPng } from "../png";
import { formatFixed, formatNumber, formatSigFigs } from "../numbers";
import {
  DEFAULT_PLOT,
  PlotSettings,
  Reading,
  computePlotLayout,
  drawPlot,
  fileNameFor,
  parseReadings,
} from "./plot";
import Icon from "../../components/Icon";

/** A row of the readings table, kept as text so half-typed numbers survive. */
interface Row {
  x: string;
  y: string;
}

const BLANK_ROWS: Row[] = Array.from({ length: 6 }, () => ({ x: "", y: "" }));

/** Text to number, allowing the decimal comma a South African learner types. */
function toNumber(text: string): number {
  return Number(text.trim().replace(",", "."));
}

function rowsToReadings(rows: Row[]): Reading[] {
  const out: Reading[] = [];
  for (const r of rows) {
    if (!r.x.trim() || !r.y.trim()) continue;
    const x = toNumber(r.x);
    const y = toNumber(r.y);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  width,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <label className="pg-field">
      <span className="pg-field-label">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        style={width ? { width } : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="pg-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/**
 * Practical graph plotter. Readings in, a plotted graph out — with the least-
 * squares line and, most of the point of the exercise, its gradient.
 */
export default function PracticalGraph() {
  const { showToast } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rows, setRows] = useState<Row[]>(BLANK_ROWS);
  const [v, setV] = useState<PlotSettings>(DEFAULT_PLOT);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof PlotSettings>(key: K, value: PlotSettings[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const readings = useMemo(() => rowsToReadings(rows), [rows]);
  const layout = useMemo(() => computePlotLayout(readings, v), [readings, v]);
  const fit = layout.fit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge) return;
    const timer = setTimeout(() => drawPlot(canvas, readings, v), 90);
    return () => clearTimeout(timer);
  }, [readings, v, layout.tooLarge]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => {
      const next = prev.map((r, j) => (j === i ? { ...r, ...patch } : r));
      // Always keep a spare row at the bottom to type into.
      const last = next[next.length - 1];
      if (last.x.trim() || last.y.trim()) next.push({ x: "", y: "" });
      return next;
    });

  const removeRow = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, j) => j !== i);
      return next.length ? next : [{ x: "", y: "" }];
    });

  // Paste a whole column pair straight from a spreadsheet.
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t;]/.test(text)) return; // a single value — let it paste normally
    const parsed = parseReadings(text);
    if (parsed.length === 0) return;
    e.preventDefault();
    setRows([...parsed.map((p) => ({ x: String(p.x), y: String(p.y) })), { x: "", y: "" }]);
    setStatus(`Read ${parsed.length} pairs from the clipboard`);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || layout.tooLarge || layout.empty) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      drawPlot(canvas, readings, v); // the preview may still be inside its pause
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
      console.error("Practical graph save failed", e);
      setStatus(`Could not save the file: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setRows(BLANK_ROWS);
    setStatus("");
  };

  const gradientUnit = v.yUnit && v.xUnit ? `${v.yUnit}/${v.xUnit}` : "";

  return (
    <div className="practical-graph">
      <div className="pg-controls">
        <div className="panel">
          <div className="row">
            <button className="primary grow" disabled={busy || layout.empty || layout.tooLarge} onClick={() => void save()}>
              {busy ? "Saving…" : "Save PNG…"}
            </button>
            <button onClick={clear}>Clear</button>
          </div>
          {status && <div className="pg-status muted">{status}</div>}
          <p className="muted pg-note">
            {layout.empty
              ? "Type or paste your readings below — two columns, x then y."
              : `${readings.length} readings · saved at 300 dpi, ${formatNumber(v.widthMm)} × ${formatNumber(v.heightMm)} mm on the page.`}
          </p>
        </div>

        <div className="panel">
          <h3>Readings</h3>
          <p className="muted pg-note">Paste two columns straight from a spreadsheet, or type them in.</p>
          <table className="data pg-table" onPaste={handlePaste}>
            <thead>
              <tr>
                <th>{v.xLabel || "x"}</th>
                <th>{v.yLabel || "y"}</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <input inputMode="decimal" value={r.x} onChange={(e) => setRow(i, { x: e.target.value })} />
                  </td>
                  <td>
                    <input inputMode="decimal" value={r.y} onChange={(e) => setRow(i, { y: e.target.value })} />
                  </td>
                  <td>
                    <button className="small icon-only danger" title="Remove this reading" aria-label="Remove this reading" onClick={() => removeRow(i)}>
                      <Icon name="close" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h3>The line</h3>
          <CheckField label="Draw the line of best fit" checked={v.showFit} onChange={(on) => set("showFit", on)} />
          <CheckField
            label="Force it through the origin"
            checked={v.throughOrigin}
            onChange={(on) => set("throughOrigin", on)}
          />
          <CheckField label="Print the gradient under the graph" checked={v.showStats} onChange={(on) => set("showStats", on)} />
          {fit ? (
            <dl className="pg-stats">
              <div>
                <dt>Gradient</dt>
                <dd>
                  {formatSigFigs(fit.gradient)} {gradientUnit}
                </dd>
              </div>
              <div>
                <dt>y-intercept</dt>
                <dd>
                  {fit.throughOrigin ? "0 (forced)" : `${formatSigFigs(fit.intercept)} ${v.yUnit}`}
                </dd>
              </div>
              <div>
                <dt
                  title={
                    fit.throughOrigin
                      ? "Measured about zero, the convention for a line forced through the origin — it reads higher than an ordinary R²."
                      : "How much of the spread the line accounts for."
                  }
                >
                  R²
                </dt>
                <dd>{formatFixed(fit.r2, 4)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted pg-note" style={{ marginBottom: 0 }}>
              {v.showFit ? "Two readings at different x values will give a line." : "The line is switched off."}
            </p>
          )}
        </div>

        <div className="panel">
          <h3>Labels</h3>
          <TextField label="Title" value={v.title} onChange={(t) => set("title", t)} placeholder="e.g. Force vs extension" />
          <TextField label="x-axis" value={v.xLabel} onChange={(t) => set("xLabel", t)} placeholder="e.g. Extension" />
          <TextField label="x unit" value={v.xUnit} onChange={(t) => set("xUnit", t)} placeholder="m" width={90} />
          <TextField label="y-axis" value={v.yLabel} onChange={(t) => set("yLabel", t)} placeholder="e.g. Force" />
          <TextField label="y unit" value={v.yUnit} onChange={(t) => set("yUnit", t)} placeholder="N" width={90} />
        </div>

        <div className="panel">
          <h3>The sheet</h3>
          <CheckField label="Start both axes at zero" checked={v.startAtZero} onChange={(on) => set("startAtZero", on)} />
          <CheckField label="Show gridlines" checked={v.showGrid} onChange={(on) => set("showGrid", on)} />
          <label className="pg-field">
            <span className="pg-field-label">Width (mm)</span>
            <input
              type="number"
              min={60}
              max={250}
              value={v.widthMm}
              style={{ width: 90 }}
              onChange={(e) => set("widthMm", Math.min(250, Math.max(60, Number(e.target.value) || 60)))}
            />
          </label>
          <label className="pg-field">
            <span className="pg-field-label">Height (mm)</span>
            <input
              type="number"
              min={50}
              max={250}
              value={v.heightMm}
              style={{ width: 90 }}
              onChange={(e) => set("heightMm", Math.min(250, Math.max(50, Number(e.target.value) || 50)))}
            />
          </label>
          <label className="pg-field">
            <span className="pg-field-label">Points</span>
            <input type="color" value={v.pointColor} onChange={(e) => set("pointColor", e.target.value)} />
          </label>
          <label className="pg-field">
            <span className="pg-field-label">Best-fit line</span>
            <input type="color" value={v.lineColor} onChange={(e) => set("lineColor", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="pg-preview">
        {layout.empty ? (
          <div className="pg-empty muted">
            <b>No readings yet</b>
            <p>Type a pair into the table, or paste two columns from a spreadsheet.</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="pg-canvas" />
        )}
      </div>
    </div>
  );
}
