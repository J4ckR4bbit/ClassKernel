// Numbers as a South African classroom writes them: comma for the decimal,
// space for the thousands. Shared by the plugins so a printed sheet matches the
// notation on the board.

/** e.g. 1234.5 → "1 234,5" (grouped with a non-breaking space). */
export function formatNumber(n: number, decimals = 2): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  const [whole, fraction] = String(rounded).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * Like formatNumber, but keeping the trailing zeros — for a value whose
 * precision is the point. R² of exactly 1 is suspicious; "1,0000" reads as the
 * rounded figure it is.
 */
export function formatFixed(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "—";
  const [whole, fraction] = n.toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * A measured value to `digits` significant figures — how a gradient or an
 * intercept is quoted in a practical write-up. Very large and very small
 * numbers come back in scientific notation (2,45 × 10³).
 */
export function formatSigFigs(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(n)));
  if (exponent >= 5 || exponent <= -3) {
    const mantissa = n / 10 ** exponent;
    return `${formatNumber(mantissa, digits - 1)} × 10${superscript(exponent)}`;
  }
  // Round to significant figures rather than decimal places — 1234,5 to three
  // figures is 1 230, not 1 235 — then trim the trailing zeros a teacher
  // wouldn't write.
  const decimals = Math.max(0, digits - 1 - exponent);
  return formatNumber(Number(n.toPrecision(digits)), decimals);
}

const SUPERSCRIPTS: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** "-3" → "⁻³", for exponents written inline. */
export function superscript(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPTS[c] ?? c)
    .join("");
}
