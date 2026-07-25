import { describe, expect, it } from "vitest";
import { buildXlsx, columnLetter, crc32, escapeXml, sanitiseSheetName } from "./xlsx";

/**
 * Minimal zip reader for the tests: walks the central directory, checks each
 * entry's CRC and returns its text. If Excel can find the parts, so can this.
 */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End-of-central-directory record: fixed 22 bytes here (no zip comment).
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const method = view.getUint16(offset + 10, true);
    expect(method).toBe(0); // stored
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, decoder.decode(data));

    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("cell addressing", () => {
  it("maps indexes to column letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
    expect(columnLetter(701)).toBe("ZZ");
  });
});

describe("sheet names", () => {
  it("strips characters Excel rejects and trims to 31 chars", () => {
    const taken = new Set<string>();
    expect(sanitiseSheetName("Marks [7B]: term/1", taken)).toBe("Marks  7B   term 1");
    expect(sanitiseSheetName("x".repeat(50), taken)).toHaveLength(31);
  });

  it("de-duplicates instead of dropping a sheet", () => {
    const taken = new Set<string>();
    expect(sanitiseSheetName("Marks", taken)).toBe("Marks");
    expect(sanitiseSheetName("Marks", taken)).toBe("Marks~2");
    expect(sanitiseSheetName("Marks", taken)).toBe("Marks~3");
  });
});

describe("xml escaping", () => {
  it("escapes markup and drops illegal control characters", () => {
    expect(escapeXml('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
    expect(escapeXml("bell\u0007 text\u0000")).toBe("bell text");
    expect(escapeXml("keeps\ttabs\nand newlines")).toBe("keeps\ttabs\nand newlines");
  });
});

describe("buildXlsx", () => {
  const workbook = buildXlsx(
    [
      {
        name: "Marks",
        columns: ["Student", "Mark", "Percent"],
        rows: [
          ["Anna O'Brien", 18, 90],
          ["Zoë <Müller> & co", null, null],
        ],
      },
      { name: "Notes", columns: ["Note"], rows: [["line one"]] },
    ],
    new Date("2026-07-24T09:30:00Z"),
  );
  const parts = unzip(workbook);

  it("writes every part Excel needs", () => {
    expect([...parts.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
  });

  it("starts with the zip signature", () => {
    expect([...workbook.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("names both sheets in the workbook and relates them to their parts", () => {
    const wb = parts.get("xl/workbook.xml")!;
    expect(wb).toContain('name="Marks"');
    expect(wb).toContain('name="Notes"');
    const rels = parts.get("xl/_rels/workbook.xml.rels")!;
    expect(rels).toContain("worksheets/sheet1.xml");
    expect(rels).toContain("worksheets/sheet2.xml");
    expect(rels).toContain("styles.xml");
  });

  it("writes text as inline strings and numbers as numeric cells", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("<t xml:space=\"preserve\">Anna O'Brien</t>");
    expect(sheet).toContain('<c r="B2"><v>18</v></c>');
    expect(sheet).toContain('<c r="C2"><v>90</v></c>');
  });

  it("escapes values that would otherwise break the xml", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Zoë &lt;Müller&gt; &amp; co");
  });

  it("leaves empty cells out entirely rather than writing blanks", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).not.toContain('r="B3"');
    expect(sheet).not.toContain('r="C3"');
  });

  it("bolds and freezes the header row", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Student</t></is></c>');
    expect(sheet).toContain('state="frozen"');
  });

  it("falls back to a placeholder sheet when there is nothing to write", () => {
    const empty = unzip(buildXlsx([]));
    expect(empty.get("xl/workbook.xml")).toContain('name="Empty"');
  });
});
