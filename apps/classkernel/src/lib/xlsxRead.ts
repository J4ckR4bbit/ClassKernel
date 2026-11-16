// Minimal .xlsx reader, the other half of xlsx.ts: enough to read back a marks
// template after a teacher has filled it in. Excel, LibreOffice and Google
// Sheets all deflate their zip entries, which the platform's own
// DecompressionStream undoes (WebView2 and Node alike), so no library is needed.
//
// Every cell comes back as text (numbers as Excel stored them, "8.5"); the
// caller decides what each column means.

export interface ReadSheet {
  name: string;
  /** Row by row from the top, each cell as text ("" when empty). */
  rows: string[][];
}

// ---------- zip ----------

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits in the last 22 bytes plus any comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a spreadsheet (.xlsx) file");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("damaged spreadsheet file");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    out.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function entryText(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = e.localOffset + 30 + view.getUint16(e.localOffset + 26, true) + view.getUint16(e.localOffset + 28, true);
  const raw = bytes.subarray(start, start + e.compressedSize);
  if (e.method !== 0 && e.method !== 8) throw new Error("unsupported compression in the spreadsheet");
  return new TextDecoder().decode(e.method === 8 ? await inflateRaw(raw) : raw);
}

// ---------- xml ----------

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return ENTITIES[code] ?? m;
  });
}

/** The text of every <t> in a run of rich text, phonetic guides left out. */
function textRuns(xml: string): string {
  const plain = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of plain.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decodeXml(m[1] ?? "");
  return out;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

/** "B12" → column 1 (0-based). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let nextRow = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowAttr = attr(rowMatch[1], "r");
    const r = rowAttr ? Number(rowAttr) - 1 : nextRow;
    nextRow = r + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = attr(c[1], "t");
      const inner = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = v !== undefined ? (shared[Number(v)] ?? "") : "";
      else if (type === "inlineStr") value = textRuns(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      else if (v !== undefined) value = decodeXml(v);
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < r) rows.push([]);
    rows[r] = cells;
  }
  return rows;
}

// ---------- workbook ----------

/** Resolve a workbook relationship target ("worksheets/sheet1.xml" or "/xl/…") to its zip path. */
function partPath(target: string): string {
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

/** Every sheet in an .xlsx file, in tab order. */
export async function readXlsx(bytes: Uint8Array): Promise<ReadSheet[]> {
  const entries = zipEntries(bytes);
  const workbook = await entryText(bytes, entries, "xl/workbook.xml");
  if (workbook === null) throw new Error("not a spreadsheet (.xlsx) file");
  const rels = (await entryText(bytes, entries, "xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target);
  }
  const sharedXml = (await entryText(bytes, entries, "xl/sharedStrings.xml")) ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]));

  const sheets: ReadSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet${sheets.length + 1}`;
    const id = attr(m[0], "r:id");
    const target = id ? targets.get(id) : undefined;
    const xml = target ? await entryText(bytes, entries, partPath(target)) : null;
    sheets.push({ name, rows: xml ? sheetRows(xml, shared) : [] });
  }
  return sheets;
}
