import { fmtDecimal, parseDecimal } from "../../lib/format";

/**
 * An assessment's weight, typed with a decimal comma or point. Saved as you
 * type whenever it reads as a number of 0 or more; leaving the box shows the
 * saved value again.
 */
export default function WeightInput({ value, onChange }: { value: number; onChange: (weight: number) => void }) {
  return (
    <input
      className="weight-input"
      inputMode="decimal"
      aria-label="Weight"
      defaultValue={fmtDecimal(value)}
      onChange={(e) => {
        const w = parseDecimal(e.target.value);
        if (w >= 0) onChange(w);
      }}
      onBlur={(e) => (e.target.value = fmtDecimal(value))}
    />
  );
}
