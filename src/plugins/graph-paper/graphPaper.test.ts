import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRAPH_PAPER,
  GraphPaperSettings,
  MAX_CANVAS_PX,
  PX_PER_MM,
  PaintContext,
  addDpiChunk,
  computeLayout,
  crc32,
  describeSize,
  fileNameFor,
  formatNumber,
  paint,
} from "./graphPaper";

const settings = (patch: Partial<GraphPaperSettings> = {}): GraphPaperSettings => ({
  ...DEFAULT_GRAPH_PAPER,
  ...patch,
});

describe("graph paper geometry", () => {
  it("sizes the grid from the millimetres asked for, at 300 dpi", () => {
    // 10 blocks of 10 mm across, 8 up: 100 mm × 80 mm.
    const layout = computeLayout(settings());
    expect(layout.gridW).toBe(Math.round(100 * PX_PER_MM));
    expect(layout.gridH).toBe(Math.round(80 * PX_PER_MM));
    // 100 mm at 300 dpi is 1181 px — what Word will lay out as 10 cm.
    expect(layout.gridW).toBe(1181);
  });

  it("adds no padding until something needs to sit outside the grid", () => {
    const plain = computeLayout(settings());
    expect(plain.width).toBe(plain.gridW);
    expect(plain.height).toBe(plain.gridH);

    // An arrow at the top of the y-axis needs room above the grid for its head.
    const arrow = computeLayout(settings({ yAxisLine: true, yArrowTop: true }));
    expect(arrow.padTop).toBeGreaterThan(Math.ceil(arrow.arrowLen));
    expect(arrow.height).toBe(arrow.gridH + arrow.padTop);
    // The arrow flags alone do nothing while the axis line is off.
    expect(computeLayout(settings({ yArrowTop: true })).padTop).toBe(0);
  });

  it("scales automatic weights with the block size, and takes manual ones in mm", () => {
    const small = computeLayout(settings({ xMm: 5, yMm: 5 }));
    const big = computeLayout(settings({ xMm: 20, yMm: 20 }));
    expect(big.majorWv).toBeGreaterThan(small.majorWv);
    // Never thinner than a pixel, or the line disappears.
    expect(computeLayout(settings({ xMm: 2, yMm: 2 })).minorWv).toBeGreaterThanOrEqual(1);

    const manual = computeLayout(settings({ autoWeights: false, xMajorW: 1, yMajorW: 0.5 }));
    expect(manual.majorWv).toBeCloseTo(PX_PER_MM, 5);
    expect(manual.majorWh).toBeCloseTo(PX_PER_MM / 2, 5);
  });

  it("puts the x-axis on the bottom gridline, or halfway up for two quadrants", () => {
    const bottom = computeLayout(settings({ xAxisLine: true }));
    expect(bottom.xAxisBottom).toBe(true);
    expect(bottom.xAxisY).toBe(bottom.gridH - bottom.edgeH);

    const middle = computeLayout(settings({ xAxisLine: true, xAxisPosition: "middle" }));
    expect(middle.xAxisY).toBeCloseTo(Math.round(4 * middle.pxY), 0); // 8 blocks up → row 4
  });

  it("flags a sheet too big for a canvas instead of trying to draw it", () => {
    expect(computeLayout(settings()).tooLarge).toBe(false);
    const huge = computeLayout(settings({ xMajor: 50, xMm: 100 })); // 5 m of paper
    expect(huge.width).toBeGreaterThan(MAX_CANVAS_PX);
    expect(huge.tooLarge).toBe(true);
  });
});

/** Records what a paint run asks for, standing in for a real 2D context. */
function recorder() {
  const lines: Array<{ from: [number, number]; to: [number, number]; color: string; width: number }> = [];
  let pending: [number, number] | null = null;
  const ctx: PaintContext & { lines: typeof lines; fills: number } = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lines,
    fills: 0,
    fillRect: () => {},
    translate: () => {},
    beginPath: () => {},
    moveTo: (x, y) => {
      pending = [x, y];
    },
    lineTo: (x, y) => {
      if (pending) lines.push({ from: pending, to: [x, y], color: String(ctx.strokeStyle), width: ctx.lineWidth });
      pending = [x, y];
    },
    closePath: () => {},
    stroke: () => {},
    fill: () => {
      ctx.fills++;
    },
  };
  return ctx;
}

describe("painting", () => {
  it("draws every gridline once, in the colour set for it", () => {
    const v = settings({ xMajor: 2, yMajor: 2, xMinor: 5, yMinor: 5 });
    const ctx = recorder();
    paint(ctx, v, computeLayout(v));

    const major = ctx.lines.filter((l) => l.color === v.majorColor);
    const minor = ctx.lines.filter((l) => l.color === v.minorColor);
    // 3 major lines each way; 5 minor steps per block leaves 4 inside each of 2 blocks.
    expect(major.length).toBe(6);
    expect(minor.length).toBe(16);
  });

  it("skips the tick where the axes cross and draws the rest", () => {
    const v = settings({ xMajor: 3, yMajor: 4, xTicks: true, yTicks: true, tickColor: "#ff0000" });
    const ctx = recorder();
    paint(ctx, v, computeLayout(v));
    const ticks = ctx.lines.filter((l) => l.color === "#ff0000");
    // x: 3 (the one on the y-axis is left out). y: 5 rows minus the origin = 4.
    expect(ticks.length).toBe(7);
  });

  it("fills one arrowhead per arrow asked for", () => {
    const none = recorder();
    paint(none, settings(), computeLayout(settings()));
    expect(none.fills).toBe(0);

    const v = settings({ yAxisLine: true, yArrowTop: true, xAxisLine: true, xArrowRight: true });
    const arrows = recorder();
    paint(arrows, v, computeLayout(v));
    expect(arrows.fills).toBe(2);
  });
});

describe("the saved PNG", () => {
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

  it("names the file after the grid, and says its printed size in mm and cm", () => {
    expect(fileNameFor(settings())).toBe("graph_paper_10x8.png");
    expect(describeSize(settings())).toBe("100 mm × 80 mm (10 cm × 8 cm)");
    expect(describeSize(settings({ xMm: 12.5 }))).toBe("125 mm × 80 mm (12,5 cm × 8 cm)");
  });

  it("writes numbers the South African way", () => {
    expect(formatNumber(1234)).toBe("1\u00a0234"); // grouped with a non-breaking space
    expect(formatNumber(12.5)).toBe("12,5");
    expect(formatNumber(0.05)).toBe("0,05");
  });
});
