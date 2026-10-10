// Numbers as South Africans write them: a decimal comma (8,5), a space between
// thousands (12 345) and a proper minus sign (−3). Used for every number the
// app shows; the .csv files keep plain dots so they stay machine-readable.

/** A number to `dp` decimals with a decimal comma: 1.25 → "1,3". */
export function fmtNum(n: number, dp = 0): string {
  const s = Math.abs(n).toFixed(dp).replace(".", ",");
  return n < 0 && Number(s.replace(",", ".")) !== 0 ? `−${s}` : s;
}

export function fmtPct(pct: number | null, dp = 0): string {
  return pct === null ? "—" : `${fmtNum(pct, dp)}%`;
}

/** Points with a sign: +3, −2, 0, and one decimal when it isn't whole (a median): −0,5. */
export function fmtSigned(n: number): string {
  const s = fmtNum(n, Number.isInteger(n) ? 0 : 1);
  return n > 0 ? `+${s}` : s;
}

/**
 * A mark or an average to at most `maxDp` decimals, without trailing zeros and
 * with thousands spaced: 8 → "8", 8.5 → "8,5", 10.25 → "10,25", 1234.5 → "1 234,5".
 */
export function fmtDecimal(n: number, maxDp = 2): string {
  const factor = 10 ** maxDp;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  const [whole, fraction] = String(rounded).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const s = fraction ? `${grouped},${fraction}` : grouped;
  return n < 0 && rounded !== 0 ? `−${s}` : s;
}

/** A typed number with a decimal comma or point ("8,5" or "8.5") → 8.5; NaN when it isn't one. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/[\s ]/g, "").replace(",", ".").replace("−", "-");
  return t === "" || /[,.].*[,.]/.test(t) ? NaN : Number(t);
}
