import Papa from "papaparse";

// Thin wrappers around PapaParse so every CSV in the data folder is written
// the same way: header row always present, \r\n line endings (Excel-friendly),
// standard quoting.

export type CsvRecord = Record<string, string>;

export function parseCsv(text: string): CsvRecord[] {
  if (!text.trim()) return [];
  const result = Papa.parse<CsvRecord>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

export function stringifyCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string {
  if (rows.length === 0) {
    // PapaParse emits nothing for zero rows; always keep the header so the
    // file stays self-describing when opened in Excel.
    return Papa.unparse([columns]) + "\r\n";
  }
  return (
    Papa.unparse(
      rows.map((r) => {
        const out: Record<string, string | number> = {};
        for (const c of columns) out[c] = r[c] ?? "";
        return out;
      }),
      { columns, newline: "\r\n" },
    ) + "\r\n"
  );
}

export function num(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
