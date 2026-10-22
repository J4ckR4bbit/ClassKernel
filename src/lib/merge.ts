// Joining two versions of a data file: the one in this computer's copy
// ("ours", changed while Google Drive was away) and the one in the data folder
// ("theirs", possibly changed on another computer meanwhile), against the
// version both started from ("base"). A 3-way merge: whatever only one side
// changed is kept; where both changed the same thing, this computer wins (the
// teacher's choice) and the clash is reported. Running it again on its own
// output changes nothing, so a join that was interrupted can simply re-run.

import Papa from "papaparse";
import { stringifyCsv } from "./csv";
import { MergeRule, mergeRuleFor, parseClassMd, serializeClassMd } from "./repo";
import type { ClassInfo } from "./types";

/** Something both sides changed differently; this computer's version was kept. */
export interface Clash {
  /** e.g. "attendance 2026-03-10, s-abc" or "the whole file". */
  what: string;
  ours: string;
  theirs: string;
}

export type MergeResult =
  | { status: "merged"; text: string; clashes: Clash[] }
  /** Not joined automatically: both versions are kept for the teacher to check. */
  | { status: "refused"; reason: string };

type Row = Record<string, string>;

interface Table {
  columns: string[];
  rows: Row[];
}

function parseTable(text: string): Table | string {
  if (!text.trim()) return { columns: [], rows: [] };
  const result = Papa.parse<Row>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  if (result.errors.length > 0) return result.errors[0].message;
  return { columns: result.meta.fields ?? [], rows: result.data };
}

/** Values compare the way the app reads them: trimmed, and 1.50 the same as 1.5. */
function norm(v: string | undefined): string {
  const t = (v ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? String(Number(t)) : t;
}

const sameRow = (a: Row | undefined, b: Row | undefined, columns: string[]) =>
  a === undefined || b === undefined ? a === b : columns.every((c) => norm(a[c]) === norm(b[c]));

const keyOf = (row: Row, key: string[]) => key.map((k) => norm(row[k])).join("\u0000");

function index(rows: Row[], key: string[]): Map<string, Row> {
  const m = new Map<string, Row>();
  // The first row for a key wins, as the app's own lookups do.
  for (const r of rows) if (!m.has(keyOf(r, key))) m.set(keyOf(r, key), r);
  return m;
}

/** The base table, or none (a file new on both sides starts from nothing). */
function tables(base: string | null, ours: string, theirs: string): [Table, Table, Table] | string {
  const parsed = [base ?? "", ours, theirs].map(parseTable);
  for (const [i, t] of parsed.entries()) {
    if (typeof t === "string") return `${["the starting", "this computer's", "the data folder's"][i]} version can't be read (${t})`;
  }
  const [b, o, t] = parsed as Table[];
  // An emptied file on Drive while rows existed looks like a half-synced or
  // damaged file, not a deliberate edit: leave it for the teacher.
  if (b.rows.length > 0 && t.rows.length === 0) return "the data folder's version is empty";
  return [b, o, t];
}

/** Columns to write: the rule's, then any extra ones either side has (a newer app's), theirs first. */
function outputColumns(ruleColumns: string[], o: Table, t: Table): string[] {
  const out = [...ruleColumns];
  for (const c of [...t.columns, ...o.columns]) if (!out.includes(c)) out.push(c);
  return out;
}

function describe(row: Row | undefined, columns: string[]): string {
  return row === undefined ? "(removed)" : columns.map((c) => row[c] ?? "").join(", ");
}

function mergeKeyed(rule: Extract<MergeRule, { kind: "keyed" }>, base: string | null, ours: string, theirs: string): MergeResult {
  const parsed = tables(base, ours, theirs);
  if (typeof parsed === "string") return { status: "refused", reason: parsed };
  const [b, o, t] = parsed;
  const compared = rule.columns.filter((c) => !rule.ignore?.includes(c));
  const [bi, oi, ti] = [b, o, t].map((x) => index(x.rows, rule.key));
  const clashes: Clash[] = [];
  const out: Row[] = [];
  const decide = (k: string): Row | undefined => {
    const [br, or, tr] = [bi.get(k), oi.get(k), ti.get(k)];
    if (sameRow(or, br, compared)) return tr;
    if (sameRow(tr, br, compared)) return or;
    if (!sameRow(or, tr, compared)) {
      clashes.push({ what: rule.key.map((c) => (or ?? tr)?.[c] ?? "").join(", "), ours: describe(or, compared), theirs: describe(tr, compared) });
    }
    return or;
  };
  // The data folder's order first, then rows only this computer has.
  const keys = [...ti.keys(), ...[...oi.keys()].filter((k) => !ti.has(k))];
  for (const k of keys) {
    const row = decide(k);
    if (row) out.push(row);
  }
  return { status: "merged", text: stringifyCsv(out, outputColumns(rule.columns, o, t)), clashes };
}

function mergeGrouped(rule: Extract<MergeRule, { kind: "grouped" }>, base: string | null, ours: string, theirs: string): MergeResult {
  const parsed = tables(base, ours, theirs);
  if (typeof parsed === "string") return { status: "refused", reason: parsed };
  const [b, o, t] = parsed;
  const groups = (x: Table) => {
    const m = new Map<string, Row[]>();
    for (const r of x.rows) {
      const g = keyOf(r, rule.group);
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return m;
  };
  const sig = (rows: Row[] | undefined) =>
    rows === undefined ? undefined : JSON.stringify(rows.map((r) => rule.columns.map((c) => norm(r[c]))));
  const [bg, og, tg] = [b, o, t].map(groups);
  const clashes: Clash[] = [];
  const out: Row[] = [];
  const keys = [...tg.keys(), ...[...og.keys()].filter((k) => !tg.has(k))];
  for (const k of keys) {
    const [bs, os, ts] = [sig(bg.get(k)), sig(og.get(k)), sig(tg.get(k))];
    let rows: Row[] | undefined;
    if (os === bs) rows = tg.get(k);
    else if (ts === bs) rows = og.get(k);
    else {
      rows = og.get(k);
      if (os !== ts) {
        const first = (og.get(k) ?? tg.get(k))?.[0];
        clashes.push({
          what: rule.group.map((c) => first?.[c] ?? "").join(", "),
          ours: og.has(k) ? `${og.get(k)!.length} rows` : "(removed)",
          theirs: tg.has(k) ? `${tg.get(k)!.length} rows` : "(removed)",
        });
      }
    }
    if (rows) out.push(...rows);
  }
  return { status: "merged", text: stringifyCsv(out, outputColumns(rule.columns, o, t)), clashes };
}

const sameText = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : a.replace(/\r\n/g, "\n").trimEnd() === b.replace(/\r\n/g, "\n").trimEnd();

function mergeWhole(base: string | null, ours: string, theirs: string): MergeResult {
  if (sameText(ours, base) || sameText(ours, theirs)) return { status: "merged", text: theirs, clashes: [] };
  if (sameText(theirs, base)) return { status: "merged", text: ours, clashes: [] };
  return { status: "merged", text: ours, clashes: [{ what: "the whole file", ours: "this computer's version", theirs: "the data folder's version" }] };
}

const CLASS_FIELDS: Array<keyof ClassInfo> = ["year", "subject", "room", "archived", "color", "notes"];

function mergeClassMd(rel: string, base: string | null, ours: string, theirs: string): MergeResult {
  const name = rel.split("/")[1] ?? "";
  const [b, o, t] = [base ?? "", ours, theirs].map((x) => parseClassMd(name, x));
  const merged: ClassInfo = { ...t };
  const clashes: Clash[] = [];
  for (const f of CLASS_FIELDS) {
    const [bv, ov, tv] = [String(b[f]), String(o[f]), String(t[f])];
    if (ov === bv) continue;
    (merged as unknown as Record<string, unknown>)[f] = o[f];
    if (tv !== bv && tv !== ov) clashes.push({ what: `class ${f}`, ours: ov, theirs: tv });
  }
  return { status: "merged", text: serializeClassMd(merged), clashes };
}

/**
 * Join a file's three versions. `rel` is its path in the data folder (forward
 * slashes), which picks the rule; `base` is null when the file didn't exist
 * when the two copies parted.
 */
export function mergeFile(rel: string, base: string | null, ours: string, theirs: string): MergeResult {
  const rule = mergeRuleFor(rel);
  switch (rule.kind) {
    case "keyed":
      return mergeKeyed(rule, base, ours, theirs);
    case "grouped":
      return mergeGrouped(rule, base, ours, theirs);
    case "classMd":
      return mergeClassMd(rel, base, ours, theirs);
    case "whole":
      return mergeWhole(base, ours, theirs);
  }
}
