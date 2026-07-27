import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLOT,
  PlotSettings,
  Reading,
  axisCaption,
  computePlotLayout,
  describeFit,
  fileNameFor,
  fitLine,
  fitSegment,
  formatTick,
  niceScale,
  parseReadings,
  project,
  tickValues,
} from "./plot";

const plot = (patch: Partial<PlotSettings> = {}): PlotSettings => ({ ...DEFAULT_PLOT, ...patch });

describe("line of best fit", () => {
  it("recovers the gradient and intercept of a line the readings lie on", () => {
    // y = 3x + 2, exactly.
    const points: Reading[] = [1, 2, 3, 4].map((x) => ({ x, y: 3 * x + 2 }));
    const fit = fitLine(points)!;
    expect(fit.gradient).toBeCloseTo(3, 10);
    expect(fit.intercept).toBeCloseTo(2, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.n).toBe(4);
  });

  it("fits scattered readings by least squares", () => {
    // Worked by hand: Sxy = 6, Sxx = 10, Syy = 6 about (3, 4).
    const points: Reading[] = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ];
    const fit = fitLine(points)!;
    expect(fit.gradient).toBeCloseTo(0.6, 10); // 6/10
    expect(fit.intercept).toBeCloseTo(2.2, 10); // 4 − 0,6 × 3
    expect(fit.r2).toBeCloseTo(0.6, 10); // 6² / (10 × 6)
  });

  it("forces the line through the origin when the relationship is proportional", () => {
    const points: Reading[] = [
      { x: 1, y: 2.1 },
      { x: 2, y: 3.9 },
      { x: 3, y: 6.2 },
    ];
    const free = fitLine(points)!;
    const forced = fitLine(points, true)!;
    expect(forced.intercept).toBe(0);
    expect(forced.throughOrigin).toBe(true);
    // Σxy/Σx² for these readings.
    expect(forced.gradient).toBeCloseTo((1 * 2.1 + 2 * 3.9 + 3 * 6.2) / (1 + 4 + 9), 10);
    expect(free.intercept).not.toBe(0);
  });

  it("refuses a fit it can't make", () => {
    expect(fitLine([])).toBeNull();
    expect(fitLine([{ x: 1, y: 1 }])).toBeNull();
    // Every reading at the same x: a vertical line has no gradient.
    expect(
      fitLine([
        { x: 2, y: 1 },
        { x: 2, y: 5 },
      ]),
    ).toBeNull();
    // Half-entered rows are ignored rather than poisoning the fit.
    expect(fitLine([{ x: 1, y: 2 }, { x: Number.NaN, y: 3 }])).toBeNull();
  });
});

describe("axis scales", () => {
  it("picks round steps of 1, 2 or 5", () => {
    expect(niceScale(0, 9.3, true).step).toBe(2);
    expect(niceScale(0, 0.47, true).step).toBe(0.1);
    expect(niceScale(0, 3100, true).step).toBe(500);
  });

  it("keeps every reading inside the axis", () => {
    const scale = niceScale(1.2, 8.7, false);
    expect(scale.min).toBeLessThanOrEqual(1.2);
    expect(scale.max).toBeGreaterThanOrEqual(8.7);
  });

  it("includes zero when asked, so proportionality can be read off", () => {
    expect(niceScale(4, 9, true).min).toBe(0);
    expect(niceScale(4, 9, false).min).toBeGreaterThan(0);
  });

  it("gives a flat run of readings something to sit in", () => {
    const scale = niceScale(5, 5, false);
    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it("lists tick values without floating-point dust", () => {
    expect(tickValues({ min: 0, max: 0.5, step: 0.1 })).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("labels ticks with just enough decimals for the step", () => {
    expect(formatTick(2, 1)).toBe("2");
    expect(formatTick(0.2, 0.1)).toBe("0,2");
    expect(formatTick(0.25, 0.05)).toBe("0,25");
  });
});

describe("layout", () => {
  const points: Reading[] = [
    { x: 0, y: 0 },
    { x: 2, y: 4 },
    { x: 4, y: 8 },
  ];

  it("sizes the sheet in millimetres at 300 dpi", () => {
    const layout = computePlotLayout(points, plot({ widthMm: 160, heightMm: 115 }));
    expect(layout.width).toBe(1890); // 160 mm
    expect(layout.height).toBe(1358); // 115 mm
    expect(layout.plotW).toBeGreaterThan(0);
    expect(layout.plotH).toBeGreaterThan(0);
  });

  it("leaves more room once there are captions to fit", () => {
    const bare = computePlotLayout(points, plot());
    const labelled = computePlotLayout(points, plot({ title: "Force vs extension", xLabel: "Extension", yLabel: "Force" }));
    expect(labelled.top).toBeGreaterThan(bare.top);
    expect(labelled.left).toBeGreaterThan(bare.left);
    expect(labelled.plotH).toBeLessThan(bare.plotH);
  });

  it("maps readings onto the sheet with y upwards", () => {
    const layout = computePlotLayout(points, plot());
    const origin = project(layout, { x: layout.xScale.min, y: layout.yScale.min });
    const far = project(layout, { x: layout.xScale.max, y: layout.yScale.max });
    expect(origin.x).toBeCloseTo(layout.left, 6);
    expect(origin.y).toBeCloseTo(layout.top + layout.plotH, 6);
    expect(far.x).toBeCloseTo(layout.left + layout.plotW, 6);
    // Bigger y is higher up the page, i.e. a smaller pixel value.
    expect(far.y).toBeLessThan(origin.y);
  });

  it("says when there is nothing to draw", () => {
    expect(computePlotLayout([], plot()).empty).toBe(true);
    expect(computePlotLayout(points, plot()).empty).toBe(false);
  });
});

describe("the fitted line on the page", () => {
  it("spans the axes when the line stays on the sheet", () => {
    const points: Reading[] = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const layout = computePlotLayout(points, plot());
    const segment = fitSegment(layout, layout.fit!)!;
    expect(segment[0].x).toBeCloseTo(layout.xScale.min, 6);
    expect(segment[1].x).toBeCloseTo(layout.xScale.max, 6);
  });

  it("clips the line to the axes rather than drawing off the sheet", () => {
    // A steep line: at the right-hand edge it is far above the top gridline.
    const points: Reading[] = [
      { x: 0, y: 0 },
      { x: 1, y: 100 },
    ];
    const layout = computePlotLayout(points, plot({ startAtZero: true }));
    const segment = fitSegment(layout, layout.fit!)!;
    for (const end of segment) {
      expect(end.y).toBeGreaterThanOrEqual(layout.yScale.min - 1e-9);
      expect(end.y).toBeLessThanOrEqual(layout.yScale.max + 1e-9);
    }
  });
});

describe("captions", () => {
  it("puts the unit in brackets after the quantity", () => {
    expect(axisCaption("Extension", "m")).toBe("Extension (m)");
    expect(axisCaption("Extension", "")).toBe("Extension");
    expect(axisCaption("", "m")).toBe("(m)");
    expect(axisCaption("", "")).toBe("");
  });

  it("quotes the gradient with the unit it comes out in", () => {
    const fit = fitLine([
      { x: 0, y: 0 },
      { x: 2, y: 5 },
    ])!;
    const line = describeFit(fit, plot({ xUnit: "m", yUnit: "N" }));
    expect(line).toContain("gradient = 2,5 N/m");
    expect(line).toContain("n = 2");
  });

  it("says so when the line was forced through the origin", () => {
    const fit = fitLine([{ x: 1, y: 2 }, { x: 2, y: 4.1 }], true)!;
    expect(describeFit(fit, plot())).toContain("through the origin");
  });

  it("names the file after the title", () => {
    expect(fileNameFor(plot({ title: "Force vs extension" }))).toBe("force_vs_extension.png");
    expect(fileNameFor(plot())).toBe("practical_graph.png");
  });
});

describe("pasted readings", () => {
  it("reads two columns from a spreadsheet", () => {
    expect(parseReadings("0.10\t2.5\n0.20\t4.9\n0.30\t7.6")).toEqual([
      { x: 0.1, y: 2.5 },
      { x: 0.2, y: 4.9 },
      { x: 0.3, y: 7.6 },
    ]);
  });

  it("takes spaces, semicolons or commas as the separator", () => {
    expect(parseReadings("1 2\n3 4")).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(parseReadings("1;2")).toEqual([{ x: 1, y: 2 }]);
    expect(parseReadings("1,2")).toEqual([{ x: 1, y: 2 }]);
  });

  it("reads a decimal comma when the comma isn't doing the splitting", () => {
    expect(parseReadings("0,10\t2,5")).toEqual([{ x: 0.1, y: 2.5 }]);
  });

  it("skips a header row and anything else that isn't a pair of numbers", () => {
    expect(parseReadings("Extension\tForce\n0.1\t2.5\n\nnonsense\n0.2\t5.0")).toEqual([
      { x: 0.1, y: 2.5 },
      { x: 0.2, y: 5 },
    ]);
  });
});
