// Row-level merge for the CSVs that are keyed sets rather than documents.
//
// Both sides are parsed, rows are indexed by the file's natural key, and the
// union is written back out. Where the same key exists on both sides with
// different values, the side that was edited more recently wins that one row —
// so the worst case is one stale cell, never a lost lesson.

import { parseCsvTable, stringifyCsv, CsvRecord } from "../csv";

function keyOf(row: CsvRecord, key: string[]): string {
  // NUL cannot appear in a parsed CSV value, so it is a safe field separator.
  return key.map((k) => row[k] ?? "").join("\u0000");
}

/**
 * Union `mine` and `theirs` on `key`.
 *
 * `preferTheirs` decides who wins a same-key collision — pass true when their
 * file was modified more recently than ours.
 */
export function unionCsv(mine: string, theirs: string, key: string[], preferTheirs: boolean): string {
  const a = parseCsvTable(mine);
  const b = parseCsvTable(theirs);

  // Column order follows the winner, then any extra columns the other side has
  // (a file written by an older or newer app version).
  const primary = preferTheirs ? b : a;
  const secondary = preferTheirs ? a : b;
  const columns = primary.columns.length > 0 ? [...primary.columns] : [...secondary.columns];
  for (const c of secondary.columns) if (!columns.includes(c)) columns.push(c);
  // Neither side had even a header row; there is nothing to merge.
  if (columns.length === 0) return preferTheirs ? theirs : mine;

  // Insert the loser first so the winner's version of a shared key overwrites
  // it, while insertion order keeps rows stable for whoever reads the file.
  const merged = new Map<string, CsvRecord>();
  for (const row of secondary.rows) merged.set(keyOf(row, key), row);
  for (const row of primary.rows) merged.set(keyOf(row, key), row);

  const rows = [...merged.values()].map((row) => {
    const out: Record<string, string> = {};
    for (const c of columns) out[c] = row[c] ?? "";
    return out;
  });
  return stringifyCsv(rows, columns);
}
