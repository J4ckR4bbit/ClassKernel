import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PX, PX_PER_MM } from "../png";
import {
  DEFAULT_GRAPH_PAPER,
  GraphPaperSettings,
  PaintContext,
  computeLayout,
  describeSize,
  fileNameFor,
  paint,
} from "./drawing";

// The tests start from a bare sheet — no axes, arrows or ticks, automatic weights —
// and switch on only what each one is about. The shipped defaults are pinned below.
const PLAIN: Partial<GraphPaperSettings> = {
  autoWeights: true,
  yAxisLine: false,
  yArrowTop: false,
  yArrowBottom: false,
  xAxisLine: false,
  xArrowRight: false,
  xArrowLeft: false,
  xTicks: false,
  yTicks: false,
};

const settings = (patch: Partial<GraphPaperSettings> = {}): GraphPaperSettings => ({
  ...DEFAULT_GRAPH_PAPER,
  ...PLAIN,
  ...patch,
});

describe("graph paper defaults", () => {
  it("opens with fine manual weights, both axes, arrows and small ticks", () => {
    expect(DEFAULT_GRAPH_PAPER).toMatchObject({
      autoWeights: false,
      xMajorW: 0.2,
      xMinorW: 0.1,
      yMajorW: 0.2,
      yMinorW: 0.1,
      axisW: 0.3,
      yAxisLine: true,
      yArrowTop: true,
      yArrowBottom: false,
      xAxisLine: true,
      xArrowRight: true,
      xArrowLeft: false,
      quadrants: "first",
      arrowSize: 2,
      xTicks: true,
      xTickLen: 1,
      xTickW: 0.3,
      yTicks: true,
      yTickLen: 1,
      yTickW: 0.3,
    });
  });
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

  it("crosses the axes bottom-left for quadrant 1", () => {
    const first = computeLayout(settings({ xAxisLine: true, yAxisLine: true }));
    expect(first.xAxisBottom).toBe(true);
    expect(first.yAxisLeft).toBe(true);
    expect(first.xAxisY).toBe(first.gridH - first.edgeH);
    expect(first.yAxisX).toBe(first.edgeV);
  });

  it("moves the x-axis halfway up for quadrants 1 & 4, and the y-axis halfway across for 1 & 2", () => {
    const right = computeLayout(settings({ quadrants: "right" }));
    expect(right.xAxisY).toBe(Math.round(4 * right.pxY)); // 8 blocks up → row 4
    expect(right.yAxisX).toBe(right.edgeV);
    expect([right.xAxisBottom, right.yAxisLeft]).toEqual([false, true]);

    const top = computeLayout(settings({ quadrants: "top" }));
    expect(top.yAxisX).toBe(Math.round(5 * top.pxX)); // 10 blocks across → column 5
    expect(top.xAxisY).toBe(top.gridH - top.edgeH);
    expect([top.xAxisBottom, top.yAxisLeft]).toEqual([true, false]);
  });

  it("puts the origin in the middle for all four quadrants", () => {
    const all = computeLayout(settings({ quadrants: "all" }));
    expect(all.yAxisX).toBe(Math.round(5 * all.pxX));
    expect(all.xAxisY).toBe(Math.round(4 * all.pxY));
    expect([all.originI, all.originJ]).toEqual([5, 4]);
    expect([all.xAxisBottom, all.yAxisLeft]).toEqual([false, false]);
  });

  it("gives the spare block of an odd count to the positive side", () => {
    const odd = computeLayout(settings({ quadrants: "all", xMajor: 7, yMajor: 5 }));
    expect(odd.originI).toBe(3); // 3 blocks left of the y-axis, 4 to its right
    expect(odd.originJ).toBe(3); // 3 blocks above the x-axis, 2 below
  });

  it("makes room on the left for a left arrow, and nothing for a y-axis off the edge", () => {
    // A centred y-axis, its arrows and ticks all sit inside the grid.
    const centred = computeLayout(settings({ quadrants: "all", yAxisLine: true, yTicks: true }));
    expect(centred.padLeft).toBe(0);
    // The same axis on the left edge needs room for its line and ticks.
    expect(computeLayout(settings({ yAxisLine: true, yTicks: true })).padLeft).toBeGreaterThan(0);

    const left = computeLayout(settings({ quadrants: "all", xAxisLine: true, xArrowLeft: true }));
    expect(left.padLeft).toBeGreaterThan(Math.ceil(left.arrowLen));
    expect(left.width).toBe(left.gridW + left.padLeft);
    // The flag alone does nothing while the axis line is off.
    expect(computeLayout(settings({ xArrowLeft: true })).padLeft).toBe(0);
  });

  it("keeps an axis that lands on the edge padded, even when asked for the middle", () => {
    // One block each way: the 'middle' gridlines are the outer ones.
    const tiny = computeLayout(
      settings({ quadrants: "all", xMajor: 1, yMajor: 1, xAxisLine: true, xArrowRight: true, yAxisLine: true }),
    );
    expect(tiny.yAxisLeft).toBe(true);
    expect(tiny.xAxisBottom).toBe(true);
    expect(tiny.padLeft).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(tiny.gridH); // room below for the arrowhead
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

  it("ticks both sides of a centred origin, still leaving the origin out", () => {
    const v = settings({ quadrants: "all", xMajor: 4, yMajor: 4, xTicks: true, yTicks: true, tickColor: "#ff0000" });
    const layout = computeLayout(v);
    const ctx = recorder();
    paint(ctx, v, layout);
    const ticks = ctx.lines.filter((l) => l.color === "#ff0000");
    // 5 columns and 5 rows, each minus the one on the other axis.
    expect(ticks.length).toBe(8);
    const xTicks = ticks.filter((t) => t.from[0] === t.to[0]);
    expect(xTicks.map((t) => t.from[0])).not.toContain(Math.round(2 * layout.pxX) + 0.5);
    expect(xTicks.map((t) => t.from[0])).toContain(0.5); // the left edge gets one now
  });

  it("draws the axes where the layout puts them", () => {
    const v = settings({ quadrants: "all", xAxisLine: true, yAxisLine: true, xAxisColor: "#00ff00", yAxisColor: "#0000ff" });
    const layout = computeLayout(v);
    const ctx = recorder();
    paint(ctx, v, layout);
    const [x] = ctx.lines.filter((l) => l.color === "#00ff00");
    const [y] = ctx.lines.filter((l) => l.color === "#0000ff");
    expect(x.from[1]).toBe(layout.xAxisY);
    expect(x.to[1]).toBe(layout.xAxisY);
    expect(y.from[0]).toBe(layout.yAxisX);
    expect(y.to[0]).toBe(layout.yAxisX);
  });

  it("fills one arrowhead per arrow asked for", () => {
    const none = recorder();
    paint(none, settings(), computeLayout(settings()));
    expect(none.fills).toBe(0);

    const v = settings({ yAxisLine: true, yArrowTop: true, xAxisLine: true, xArrowRight: true });
    const arrows = recorder();
    paint(arrows, v, computeLayout(v));
    expect(arrows.fills).toBe(2);

    const four = settings({ ...v, quadrants: "all", yArrowBottom: true, xArrowLeft: true });
    const all = recorder();
    paint(all, four, computeLayout(four));
    expect(all.fills).toBe(4);
  });
});

describe("the saved sheet", () => {
  it("names the file after the grid, and says its printed size in mm and cm", () => {
    expect(fileNameFor(settings())).toBe("graph_paper_10x8.png");
    expect(describeSize(settings())).toBe("100 mm \u00d7 80 mm (10 cm \u00d7 8 cm)");
    expect(describeSize(settings({ xMm: 12.5 }))).toBe("125 mm \u00d7 80 mm (12,5 cm \u00d7 8 cm)");
  });
});
