// Minimal .xlsx (OOXML SpreadsheetML) writer.
//
// The app ships no spreadsheet dependency — an .xlsx is just a zip of small XML
// parts, so the whole writer is ~200 lines here rather than a megabyte of
// library in the installer. Entries are stored uncompressed (method 0): the
// files are tiny, and Excel/LibreOffice/Google Sheets all open a stored zip.
//
// Strings are written as inline strings so there is no shared-string table to
// keep in sync; numbers are written as real numeric cells so they can be summed
// and pivoted in the spreadsheet.

export type CellValue = string | number | boolean | null | undefined;

export interface SheetSpec {
  /** Tab name. Sanitised and de-duplicated when the workbook is built. */
  name: string;
  columns: string[];
  rows: CellValue[][];
}

// ---------- xml helpers ----------

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Escape text for XML and drop control characters XML 1.0 cannot represent. */
export function escapeXml(value: string): string {
  return value
    // Tab, newline and carriage return are legal in XML 1.0; the rest of C0 is not.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 -> A, 25 -> Z, 26 -> AA … */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * Excel tab names: max 31 chars, none of []:*?/\, and unique within a workbook.
 * Duplicates get a ~2, ~3 … suffix rather than being silently dropped.
 */
export function sanitiseSheetName(name: string, taken: Set<string>): string {
  let base = (name || "Sheet").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = `~${n++}`;
    base = base.slice(0, 31 - suffix.length);
    candidate = base + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(ref: string, value: CellValue, headerStyle: boolean): string {
  const style = headerStyle ? ' s="1"' : "";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
  // xml:space="preserve" keeps leading/trailing spaces a teacher typed in a note.
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function rowXml(rowNumber: number, values: CellValue[], headerStyle: boolean): string {
  const cells = values.map((v, i) => cellXml(`${columnLetter(i)}${rowNumber}`, v, headerStyle)).join("");
  return `<row r="${rowNumber}">${cells}</row>`;
}

/** Rough auto-fit: widest value in the column, clamped to something readable. */
function columnWidths(sheet: SheetSpec): number[] {
  return sheet.columns.map((col, i) => {
    let widest = col.length;
    for (const row of sheet.rows) {
      const v = row[i];
      if (v === null || v === undefined) continue;
      const len = typeof v === "number" ? String(Math.round(v * 100) / 100).length : String(v).length;
      if (len > widest) widest = len;
    }
    return Math.min(48, Math.max(9, widest + 2));
  });
}

function sheetXml(sheet: SheetSpec): string {
  const widths = columnWidths(sheet);
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const lastCol = columnLetter(Math.max(0, sheet.columns.length - 1));
  const lastRow = sheet.rows.length + 1;
  const body = sheet.rows.map((r, i) => rowXml(i + 2, r, false)).join("");
  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    // Freeze the header row so long exports stay readable while scrolling.
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rowXml(1, sheet.columns, true)}${body}</sheetData>` +
    (sheet.columns.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : "") +
    "</worksheet>"
  );
}

function stylesXml(): string {
  return (
    XML_HEADER +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
    "</fonts>" +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

// ---------- zip container ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipFile {
  name: string;
  text: string;
}

/** Build a zip archive with every entry stored (no compression). */
function zip(files: ZipFile[], at: Date): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const data = encoder.encode(f.text);
    return { nameBytes: encoder.encode(f.name), data, crc: crc32(data) };
  });

  const dosTime = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
  const dosDate = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();

  const localSize = entries.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let offset = 0;
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // local file header
    view.setUint16(offset + 4, 20, true); // version needed
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.data.length, true);
    view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    out.set(e.nameBytes, offset + 30);
    out.set(e.data, offset + 30 + e.nameBytes.length);
    offset += 30 + e.nameBytes.length + e.data.length;
  }

  const centralStart = offset;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    view.setUint32(offset, 0x02014b50, true); // central directory header
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true); // stored
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.data.length, true);
    view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk number
    view.setUint16(offset + 36, 0, true); // internal attrs
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, offsets[i], true);
    out.set(e.nameBytes, offset + 46);
    offset += 46 + e.nameBytes.length;
  }

  view.setUint32(offset, 0x06054b50, true); // end of central directory
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // zip comment length

  return out;
}

// ---------- workbook ----------

/** Serialise sheets into a complete .xlsx workbook. */
export function buildXlsx(sheets: SheetSpec[], at: Date = new Date()): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Empty", columns: ["No data"], rows: [] }];
  const taken = new Set<string>();
  const named = list.map((s) => ({ ...s, name: sanitiseSheetName(s.name, taken) }));

  const contentTypes =
    XML_HEADER +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    named
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    "</Types>";

  const rootRels =
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";

  const workbook =
    XML_HEADER +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    named
      .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    "</sheets></workbook>";

  const workbookRels =
    XML_HEADER +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    named
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";

  const files: ZipFile[] = [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rootRels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRels },
    { name: "xl/styles.xml", text: stylesXml() },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];

  return zip(files, at);
}
