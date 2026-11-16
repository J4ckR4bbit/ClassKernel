// Generates the app icons (PNGs + multi-size .ico) with no native tooling —
// pixels are rendered in JS and PNG-encoded with Node's built-in zlib.
// ClassKernel: green rounded tile, whiteboard bar up top, 2x3 grid of white desks.
// ClassKernel Science (science.png / science.ico, its window and shortcuts):
// a blue tile with a white conical flask, green liquid in it.
// Usage: node scripts/gen-icons.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(OUT, { recursive: true });

// ---------- tiny PNG encoder ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- renderer ----------

// Signed-distance coverage of a rounded rectangle, supersampled 3x3 per pixel.
function roundRectCoverage(px, py, x, y, w, h, r) {
  let hit = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const qx = px + (sx + 0.5) / 3;
      const qy = py + (sy + 0.5) / 3;
      const dx = Math.max(x + r - qx, 0, qx - (x + w - r));
      const dy = Math.max(y + r - qy, 0, qy - (y + h - r));
      if (dx * dx + dy * dy <= r * r && qx >= x && qx <= x + w && qy >= y && qy <= y + h) hit++;
    }
  }
  return hit / 9;
}

// Coverage of a polygon (points in pixels), supersampled 3x3 per pixel.
function polygonCoverage(px, py, points) {
  let hit = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const qx = px + (sx + 0.5) / 3;
      const qy = py + (sy + 0.5) / 3;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > qy !== yj > qy && qx < ((xj - xi) * (qy - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) hit++;
    }
  }
  return hit / 9;
}

/** Paint shapes (rounded rects, or polygons) over a transparent square, in order. */
function paint(size, shapes) {
  const img = Buffer.alloc(size * size * 4); // transparent
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cr = 0, cg = 0, cb = 0, ca = 0;
      for (const shape of shapes) {
        const [R, G, B, A] = shape.colour;
        const cov = shape.points
          ? polygonCoverage(x, y, shape.points.map(([u, v]) => [u * size, v * size]))
          : roundRectCoverage(x, y, shape.x * size, shape.y * size, shape.w * size, shape.h * size, shape.r * size);
        if (cov <= 0) continue;
        const a = (A / 255) * cov;
        cr = R * a + cr * (1 - a);
        cg = G * a + cg * (1 - a);
        cb = B * a + cb * (1 - a);
        ca = a + ca * (1 - a);
      }
      const i = (y * size + x) * 4;
      img[i] = Math.round(cr);
      img[i + 1] = Math.round(cg);
      img[i + 2] = Math.round(cb);
      img[i + 3] = Math.round(ca * 255);
    }
  }
  return encodePng(img, size, size);
}

function renderScience(size) {
  const white = [255, 255, 255, 255];
  return paint(size, [
    { x: 0.02, y: 0.02, w: 0.96, h: 0.96, r: 0.2, colour: [43, 95, 138, 255] }, // tile #2b5f8a
    { x: 0.36, y: 0.14, w: 0.28, h: 0.07, r: 0.03, colour: white }, // rim
    { x: 0.42, y: 0.18, w: 0.16, h: 0.26, r: 0.0, colour: white }, // neck
    // the flask's body, then the liquid in its lower part
    { points: [[0.42, 0.42], [0.58, 0.42], [0.82, 0.8], [0.78, 0.86], [0.22, 0.86], [0.18, 0.8]], colour: white },
    { points: [[0.334, 0.6], [0.666, 0.6], [0.77, 0.78], [0.74, 0.81], [0.26, 0.81], [0.23, 0.78]], colour: [175, 242, 196, 255] },
  ]);
}

function render(size) {
  const img = Buffer.alloc(size * size * 4); // transparent
  const shapes = [
    // [x, y, w, h, r, [R, G, B, A]] in unit space
    [0.02, 0.02, 0.96, 0.96, 0.2, [44, 110, 73, 255]], // tile #2c6e49
    [0.2, 0.13, 0.6, 0.1, 0.03, [255, 255, 255, 230]], // whiteboard
    ...[0, 1, 2].flatMap((col) =>
      [0, 1].map((row) => [0.15 + col * 0.25, 0.36 + row * 0.25, 0.2, 0.17, 0.04, [255, 255, 255, 255]]),
    ),
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cr = 0, cg = 0, cb = 0, ca = 0;
      for (const [sx, sy, sw, sh, r, [R, G, B, A]] of shapes) {
        const cov = roundRectCoverage(x, y, sx * size, sy * size, sw * size, sh * size, r * size);
        if (cov <= 0) continue;
        const a = (A / 255) * cov;
        cr = R * a + cr * (1 - a);
        cg = G * a + cg * (1 - a);
        cb = B * a + cb * (1 - a);
        ca = a + ca * (1 - a);
      }
      const i = (y * size + x) * 4;
      img[i] = Math.round(cr);
      img[i + 1] = Math.round(cg);
      img[i + 2] = Math.round(cb);
      img[i + 3] = Math.round(ca * 255);
    }
  }
  return encodePng(img, size, size);
}

// ---------- ICO (PNG-compressed entries, Vista+) ----------

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(entries.length, 4);
  const dirs = [];
  const blobs = [];
  let offset = 6 + entries.length * 16;
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size;
    dir[1] = size >= 256 ? 0 : size;
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(dir);
    blobs.push(png);
  }
  return Buffer.concat([header, ...dirs, ...blobs]);
}

// ---------- write everything ----------

const sizes = [16, 32, 48, 128, 256, 512];
const pngs = Object.fromEntries(sizes.map((s) => [s, render(s)]));

writeFileSync(join(OUT, "32x32.png"), pngs[32]);
writeFileSync(join(OUT, "128x128.png"), pngs[128]);
writeFileSync(join(OUT, "128x128@2x.png"), pngs[256]);
writeFileSync(join(OUT, "icon.png"), pngs[512]);
writeFileSync(
  join(OUT, "icon.ico"),
  encodeIco([16, 32, 48, 256].map((size) => ({ size, png: pngs[size] }))),
);

const science = Object.fromEntries([16, 32, 48, 256].map((s) => [s, renderScience(s)]));
writeFileSync(join(OUT, "science.png"), science[256]);
writeFileSync(
  join(OUT, "science.ico"),
  encodeIco([16, 32, 48, 256].map((size) => ({ size, png: science[size] }))),
);
console.log(`Icons written to ${OUT}`);
