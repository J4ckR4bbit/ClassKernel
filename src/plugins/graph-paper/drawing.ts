// Graph paper drawing engine: settings in, pixels out.
//
// Everything is worked out in real-world millimetres and rendered at 300 dpi, so
// a saved PNG prints — and inserts into Word — at exactly the size shown on
// screen. Kept free of React and of the canvas element itself so the geometry
// can be tested without a browser.

export const DPI = 300;
export const PX_PER_MM = DPI / 25.4; // ≈ 11.81 px per mm at 300 dpi

// Automatic line weights are anchored to a 10 mm block and scale from there.
const MINOR_W = 2;
const MAJOR_W = 4;
const AXIS_W = 7;
const BASE_MM = 10;
/** Arrowhead width ÷ length — keeps the head's shape at any size. */
const ARROW_RATIO = 22 / 55;

/**
 * Browsers stop drawing beyond roughly this many pixels on a side, and a canvas
 * that big would be hundreds of megabytes. Past it we report instead of drawing.
 */
export const MAX_CANVAS_PX = 16384;

export type XAxisPosition = "bottom" | "middle";

export interface GraphPaperSettings {
  /** Major blocks across and up. */
  xMajor: number;
  yMajor: number;
  /** Minor squares inside each block. */
  xMinor: number;
  yMinor: number;
  /** Block size in millimetres. */
  xMm: number;
  yMm: number;

  /** Scale the line weights with the block size instead of setting them by hand. */
  autoWeights: boolean;
  /** Manual line weights, in millimetres. */
  xMajorW: number;
  xMinorW: number;
  yMajorW: number;
  yMinorW: number;
  axisW: number;

  yAxisLine: boolean;
  yArrowTop: boolean;
  yArrowBottom: boolean;
  xAxisLine: boolean;
  xArrowRight: boolean;
  xAxisPosition: XAxisPosition;
  /** Arrowhead length in millimetres. */
  arrowSize: number;

  xTicks: boolean;
  yTicks: boolean;
  xTickLen: number;
  xTickW: number;
  yTickLen: number;
  yTickW: number;

  majorColor: string;
  minorColor: string;
  xAxisColor: string;
  yAxisColor: string;
  tickColor: string;
}

export const DEFAULT_GRAPH_PAPER: GraphPaperSettings = {
  xMajor: 10,
  yMajor: 8,
  xMinor: 5,
  yMinor: 5,
  xMm: 10,
  yMm: 10,

  autoWeights: true,
  xMajorW: 0.35,
  xMinorW: 0.2,
  yMajorW: 0.35,
  yMinorW: 0.2,
  axisW: 0.6,

  yAxisLine: false,
  yArrowTop: false,
  yArrowBottom: false,
  xAxisLine: false,
  xArrowRight: false,
  xAxisPosition: "bottom",
  arrowSize: 4.7,

  xTicks: false,
  yTicks: false,
  xTickLen: 3,
  xTickW: 0.5,
  yTickLen: 3,
  yTickW: 0.5,

  majorColor: "#8ba4c7",
  minorColor: "#a8bedd",
  xAxisColor: "#1b2733",
  yAxisColor: "#1b2733",
  tickColor: "#1b2733",
};

/** Everything the painter needs, in device pixels. */
export interface GraphPaperLayout {
  /** Full canvas, grid plus the padding that arrows and ticks need. */
  width: number;
  height: number;
  /** The grid itself. */
  gridW: number;
  gridH: number;
  padLeft: number;
  padTop: number;
  /** Pixels per major block. */
  pxX: number;
  pxY: number;
  minorWv: number;
  minorWh: number;
  majorWv: number;
  majorWh: number;
  axisWx: number;
  axisWy: number;
  arrowLen: number;
  arrowHalf: number;
  xTickHalf: number;
  yTickHalf: number;
  xTickWpx: number;
  yTickWpx: number;
  /** Outer major gridlines are inset by half their width so they aren't clipped. */
  edgeV: number;
  edgeH: number;
  /** Axis positions, sitting exactly on those gridlines. */
  yAxisX: number;
  xAxisY: number;
  xAxisBottom: boolean;
  /** True when the drawing would exceed what a canvas can hold. */
  tooLarge: boolean;
}

export function computeLayout(v: GraphPaperSettings): GraphPaperLayout {
  const pxX = v.xMm * PX_PER_MM;
  const pxY = v.yMm * PX_PER_MM;
  const gridW = Math.round(v.xMajor * pxX);
  const gridH = Math.round(v.yMajor * pxY);

  // Automatic weights scale with the block size — vertical lines follow x,
  // horizontal lines follow y. Manual weights are millimetres, straight to px.
  const sx = v.xMm / BASE_MM;
  const sy = v.yMm / BASE_MM;
  const minorWv = v.autoWeights ? Math.max(1, MINOR_W * sx) : Math.max(1, v.xMinorW * PX_PER_MM);
  const minorWh = v.autoWeights ? Math.max(1, MINOR_W * sy) : Math.max(1, v.yMinorW * PX_PER_MM);
  const majorWv = v.autoWeights ? Math.max(1, MAJOR_W * sx) : Math.max(1, v.xMajorW * PX_PER_MM);
  const majorWh = v.autoWeights ? Math.max(1, MAJOR_W * sy) : Math.max(1, v.yMajorW * PX_PER_MM);
  const axisWy = v.autoWeights ? Math.max(1.5, AXIS_W * sx) : Math.max(1, v.axisW * PX_PER_MM);
  const axisWx = v.autoWeights ? Math.max(1.5, AXIS_W * sy) : Math.max(1, v.axisW * PX_PER_MM);

  const arrowLen = v.arrowSize * PX_PER_MM;
  const arrowHalf = arrowLen * ARROW_RATIO;

  // Tick lengths are distances; their weights follow the axis in automatic mode.
  const xTickHalf = (v.xTickLen * PX_PER_MM) / 2;
  const yTickHalf = (v.yTickLen * PX_PER_MM) / 2;
  const xTickWpx = v.autoWeights ? axisWx : Math.max(1, v.xTickW * PX_PER_MM);
  const yTickWpx = v.autoWeights ? axisWy : Math.max(1, v.yTickW * PX_PER_MM);

  const edgeV = Math.ceil(majorWv / 2);
  const edgeH = Math.ceil(majorWh / 2);
  const yAxisX = edgeV; // the i = 0 vertical major gridline
  const xAxisBottom = v.xAxisPosition === "bottom";
  const xAxisY = xAxisBottom
    ? gridH - edgeH // the last horizontal major gridline
    : Math.min(Math.max(Math.round(Math.round(v.yMajor / 2) * pxY), edgeH), gridH - edgeH);

  // Padding so axis lines, arrowheads and ticks sit outside the grid uncut.
  const padLeft = Math.max(
    v.yAxisLine ? Math.ceil(Math.max(arrowHalf, axisWy / 2)) + 2 : 0,
    v.yTicks ? Math.ceil(yTickHalf + yTickWpx / 2) + 2 : 0,
  );
  const padTop = Math.max(
    v.yAxisLine && v.yArrowTop ? Math.ceil(arrowLen) + 2 : 0,
    v.yTicks ? Math.ceil(yTickWpx / 2) + 1 : 0,
  );
  const padBottom = Math.max(
    v.yAxisLine && v.yArrowBottom ? Math.ceil(arrowLen) + 2 : 0,
    v.xAxisLine && xAxisBottom
      ? Math.ceil(v.xArrowRight ? Math.max(arrowHalf, axisWx / 2) : axisWx / 2) + 2
      : 0,
    v.xTicks && xAxisBottom ? Math.ceil(xTickHalf + xTickWpx / 2) + 2 : 0,
    v.yTicks ? Math.ceil(yTickWpx / 2) + 1 : 0,
  );
  const padRight = Math.max(
    v.xAxisLine && v.xArrowRight ? Math.ceil(arrowLen) + 2 : 0,
    v.xTicks ? Math.ceil(xTickWpx / 2) + 1 : 0,
  );

  const width = gridW + padLeft + padRight;
  const height = gridH + padTop + padBottom;

  return {
    width,
    height,
    gridW,
    gridH,
    padLeft,
    padTop,
    pxX,
    pxY,
    minorWv,
    minorWh,
    majorWv,
    majorWh,
    axisWx,
    axisWy,
    arrowLen,
    arrowHalf,
    xTickHalf,
    yTickHalf,
    xTickWpx,
    yTickWpx,
    edgeV,
    edgeH,
    yAxisX,
    xAxisY,
    xAxisBottom,
    tooLarge: width > MAX_CANVAS_PX || height > MAX_CANVAS_PX,
  };
}

/** The slice of a 2D context the painter uses (so tests can stand in for one). */
export interface PaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  translate(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
}

function arrowhead(
  ctx: PaintContext,
  tipX: number,
  tipY: number,
  dir: "up" | "down" | "right",
  len: number,
  half: number,
): void {
  ctx.beginPath();
  if (dir === "up") {
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - half, tipY + len);
    ctx.lineTo(tipX + half, tipY + len);
  } else if (dir === "down") {
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - half, tipY - len);
    ctx.lineTo(tipX + half, tipY - len);
  } else {
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - len, tipY - half);
    ctx.lineTo(tipX - len, tipY + half);
  }
  ctx.closePath();
  ctx.fill();
}

/** Paint one sheet onto a context already sized to `layout`. */
export function paint(ctx: PaintContext, v: GraphPaperSettings, layout: GraphPaperLayout): void {
  const { gridW: w, gridH: h } = layout;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.translate(layout.padLeft, layout.padTop); // from here on, grid coordinates

  const minorStepX = layout.pxX / v.xMinor;
  const minorStepY = layout.pxY / v.yMinor;

  // Minor gridlines: vertical first (their weight follows x), then horizontal.
  ctx.strokeStyle = v.minorColor;
  ctx.lineWidth = layout.minorWv;
  ctx.beginPath();
  for (let i = 0; i <= v.xMajor * v.xMinor; i++) {
    if (i % v.xMinor === 0) continue; // a major line goes here instead
    const px = Math.round(i * minorStepX) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  ctx.stroke();

  ctx.lineWidth = layout.minorWh;
  ctx.beginPath();
  for (let j = 0; j <= v.yMajor * v.yMinor; j++) {
    if (j % v.yMinor === 0) continue;
    const py = Math.round(j * minorStepY) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();

  // Major gridlines, the outermost ones nudged inside the canvas.
  ctx.strokeStyle = v.majorColor;
  ctx.lineWidth = layout.majorWv;
  ctx.beginPath();
  for (let i = 0; i <= v.xMajor; i++) {
    const px = Math.min(Math.max(Math.round(i * layout.pxX), layout.edgeV), w - layout.edgeV);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  ctx.stroke();

  ctx.lineWidth = layout.majorWh;
  ctx.beginPath();
  for (let j = 0; j <= v.yMajor; j++) {
    const py = Math.min(Math.max(Math.round(j * layout.pxY), layout.edgeH), h - layout.edgeH);
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();

  // Axis lines and their arrowheads (each axis carries its own colour).
  if (v.yAxisLine) {
    ctx.strokeStyle = v.yAxisColor;
    ctx.fillStyle = v.yAxisColor;
    ctx.lineWidth = layout.axisWy;
    ctx.beginPath();
    ctx.moveTo(layout.yAxisX, 0);
    ctx.lineTo(layout.yAxisX, h);
    ctx.stroke();
    if (v.yArrowTop) arrowhead(ctx, layout.yAxisX, -layout.arrowLen, "up", layout.arrowLen, layout.arrowHalf);
    if (v.yArrowBottom) {
      arrowhead(ctx, layout.yAxisX, h + layout.arrowLen, "down", layout.arrowLen, layout.arrowHalf);
    }
  }

  if (v.xAxisLine) {
    ctx.strokeStyle = v.xAxisColor;
    ctx.fillStyle = v.xAxisColor;
    ctx.lineWidth = layout.axisWx;
    ctx.beginPath();
    ctx.moveTo(0, layout.xAxisY);
    ctx.lineTo(w, layout.xAxisY);
    ctx.stroke();
    if (v.xArrowRight) {
      arrowhead(ctx, w + layout.arrowLen, layout.xAxisY, "right", layout.arrowLen, layout.arrowHalf);
    }
  }

  // Ticks straddle their axis, and the one at the origin is left out.
  ctx.strokeStyle = v.tickColor;

  if (v.xTicks) {
    ctx.lineWidth = layout.xTickWpx;
    ctx.beginPath();
    for (let i = 1; i <= v.xMajor; i++) {
      // i = 0 would sit on the y-axis, so start at 1
      const cx = Math.round(i * layout.pxX) + 0.5;
      ctx.moveTo(cx, layout.xAxisY - layout.xTickHalf);
      ctx.lineTo(cx, layout.xAxisY + layout.xTickHalf);
    }
    ctx.stroke();
  }

  if (v.yTicks) {
    const originJ = layout.xAxisBottom ? v.yMajor : Math.round(v.yMajor / 2);
    ctx.lineWidth = layout.yTickWpx;
    ctx.beginPath();
    for (let j = 0; j <= v.yMajor; j++) {
      if (j === originJ) continue; // where the x-axis crosses
      const cy = Math.round(j * layout.pxY) + 0.5;
      ctx.moveTo(layout.yAxisX - layout.yTickHalf, cy);
      ctx.lineTo(layout.yAxisX + layout.yTickHalf, cy);
    }
    ctx.stroke();
  }
}

/** Size the canvas from the settings and draw. Returns the layout used. */
export function drawOnCanvas(canvas: HTMLCanvasElement, v: GraphPaperSettings): GraphPaperLayout {
  const layout = computeLayout(v);
  if (layout.tooLarge) return layout;
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, v, layout);
  return layout;
}

// ---------- PNG dpi tagging ----------
// Canvas PNGs carry no resolution, so Word drops them in at 96 dpi — three times
// too big. A pHYs chunk stating 300 dpi makes the file land at its true size.

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

/** Numbers the South African way: comma for the decimal, space for thousands. */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [whole, decimals] = String(rounded).split(".");
  // Non-breaking, so "1 200 mm" never wraps between the digits.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return decimals ? `${grouped},${decimals}` : grouped;
}

/** "100 mm × 80 mm (10 cm × 8 cm)" for the size readout. */
export function describeSize(v: GraphPaperSettings): string {
  const w = v.xMajor * v.xMm;
  const h = v.yMajor * v.yMm;
  return `${formatNumber(w)} mm × ${formatNumber(h)} mm (${formatNumber(w / 10)} cm × ${formatNumber(h / 10)} cm)`;
}

/** File name for a saved sheet, e.g. graph_paper_10x8.png. */
export function fileNameFor(v: GraphPaperSettings): string {
  return `graph_paper_${v.xMajor}x${v.yMajor}.png`;
}
