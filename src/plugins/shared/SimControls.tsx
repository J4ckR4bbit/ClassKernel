// Controls the simulations share: a number typed with the decimal comma (and
// optionally a slider under it), and text with subscripts written E_{K(max)}.
// Styles in sim-controls.css.

import { Fragment, ReactNode, useState } from "react";
import { formatNumber } from "../numbers";
import { subscriptRuns } from "./canvas";
import "./sim-controls.css";

/** "1,5", "1.5", "−2", " 3 " → a number; anything else → null. */
export function parseInput(text: string, allowNegative = false): number | null {
  const cleaned = text.replace(/[\s ]/g, "").replace(",", ".").replace("−", "-");
  const pattern = allowNegative ? /^-?(\d+\.?\d*|\.\d+)$/ : /^(\d+\.?\d*|\.\d+)$/;
  if (!pattern.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  slider = false,
  decimals = 3,
  allowNegative = false,
  onChange,
}: {
  label: ReactNode;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  slider?: boolean;
  decimals?: number;
  allowNegative?: boolean;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null ? null : parseInput(draft, allowNegative);
  const bad = draft !== null && (n === null || n < min || n > max);
  const name = typeof label === "string" ? label : "";
  return (
    <div className="sim-field">
      <div className="sim-field-head">
        <span className="sim-field-label">{label}</span>
        <span className="sim-number">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${name} in ${unit}`.trim()}
            aria-invalid={bad}
            className={bad ? "sim-bad" : ""}
            value={draft ?? formatNumber(value, decimals).replace(/^-/, "−")}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = parseInput(e.target.value, allowNegative);
              if (v !== null && v >= min && v <= max) onChange(v);
            }}
            onBlur={() => setDraft(null)}
          />
          <span className="muted sim-unit">{unit}</span>
        </span>
      </div>
      {slider && (
        <input type="range" aria-label={`${name} slider`} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      )}
    </div>
  );
}

/** Text with its `_x` / `_{xy}` runs as subscripts. */
export function Sub({ text }: { text: string }) {
  return (
    <>
      {subscriptRuns(text).map(([t, sub], i) => (sub ? <sub key={i}>{t}</sub> : <Fragment key={i}>{t}</Fragment>))}
    </>
  );
}

export interface MemoStep {
  head: string;
  lines: string[];
}

/** A memo: each step's heading beside its lines of working. */
export function Memo({ steps }: { steps: MemoStep[] }) {
  return (
    <dl className="sim-steps">
      {steps.map((st, k) => (
        <Fragment key={`${k}-${st.head}`}>
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
  );
}
