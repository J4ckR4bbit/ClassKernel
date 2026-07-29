import { describe, expect, it } from "vitest";
import { PX_PER_MM, addDpiChunk, crc32, mm } from "./png";

describe("PNG resolution tagging", () => {
  it("tags the file at 300 dpi so Word inserts it at its true size", () => {
    // A stand-in PNG: 8-byte signature, a 25-byte IHDR, then some payload.
    const png = new Uint8Array(33 + 10);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0xaa, 0xbb, 0xcc], 33);

    const out = addDpiChunk(png, 300);
    expect(out.length).toBe(png.length + 21);
    // Everything before and after the new chunk survives untouched.
    expect([...out.subarray(0, 33)]).toEqual([...png.subarray(0, 33)]);
    expect([...out.subarray(54)]).toEqual([...png.subarray(33)]);

    const chunk = out.subarray(33, 54);
    const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    expect(dv.getUint32(0)).toBe(9); // data length
    expect(String.fromCharCode(...chunk.subarray(4, 8))).toBe("pHYs");
    expect(dv.getUint32(8)).toBe(11811); // 300 dpi in pixels per metre
    expect(dv.getUint32(12)).toBe(11811);
    expect(chunk[16]).toBe(1); // unit: metre
    expect(dv.getUint32(17)).toBe(crc32(chunk.subarray(4, 17)));
  });

  it("converts millimetres to pixels at 300 dpi", () => {
    expect(Math.round(mm(100))).toBe(1181); // 10 cm across
    expect(mm(1)).toBeCloseTo(PX_PER_MM, 10);
  });
});
