// Turning a canvas into a file a teacher can use.
//
// Everything a plugin draws is rendered at 300 dpi and tagged with its
// resolution, because a plain canvas PNG carries none: Word would drop it in at
// 96 dpi, three times too big, and a printed worksheet would come out the wrong
// size. Shared by every plugin that produces an image.

export const DPI = 300;
export const PX_PER_MM = DPI / 25.4; // ≈ 11.81 px per mm at 300 dpi

/**
 * Browsers stop drawing beyond roughly this many pixels on a side, and a canvas
 * that big would be hundreds of megabytes. Past it, report instead of drawing.
 */
export const MAX_CANVAS_PX = 16384;

/** Millimetres to device pixels at 300 dpi. */
export function mm(value: number): number {
  return value * PX_PER_MM;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk stating `dpi` straight after the PNG's IHDR. */
export function addDpiChunk(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunk = new Uint8Array(21); // 4 length + 4 type + 9 data + 4 crc
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); // x pixels per metre
  dv.setUint32(12, ppm); // y pixels per metre
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17))); // CRC covers type + data

  // 8-byte signature + 25-byte IHDR, then us, then the rest of the file.
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

/** The finished PNG for a canvas, tagged at 300 dpi. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The browser could not turn the drawing into a PNG");
  return addDpiChunk(new Uint8Array(await blob.arrayBuffer()), DPI);
}
