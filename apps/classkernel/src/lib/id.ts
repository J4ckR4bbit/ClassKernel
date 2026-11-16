import { dateInZone, nowInZone } from "./time";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Short random id, safe for filenames and CSV cells. */
export function newId(prefix = ""): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}-${s}` : s;
}

/** Today's date (YYYY-MM-DD) in the teacher's time zone (see time.ts). */
export function today(): string {
  return dateInZone(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Timestamp usable in folder names: 2026-07-10_143005 */
export function backupStamp(): string {
  const n = nowInZone();
  return `${n.date}_${n.hh}${n.mm}${n.ss}`;
}
