import { describe, expect, it } from "vitest";
import { fmtDecimal, parseDecimal } from "./format";

describe("fmtDecimal", () => {
  it("writes a decimal comma and drops trailing zeros", () => {
    expect(fmtDecimal(8)).toBe("8");
    expect(fmtDecimal(8.5)).toBe("8,5");
    expect(fmtDecimal(10.25)).toBe("10,25");
    expect(fmtDecimal(6.333333, 1)).toBe("6,3");
    expect(fmtDecimal(2.96, 1)).toBe("3");
  });

  it("spaces the thousands and uses a minus sign", () => {
    expect(fmtDecimal(1234.5)).toBe("1 234,5");
    expect(fmtDecimal(-2.5)).toBe("−2,5");
    expect(fmtDecimal(-0.001)).toBe("0");
  });
});

describe("parseDecimal", () => {
  it("reads a decimal comma or point", () => {
    expect(parseDecimal("8,5")).toBe(8.5);
    expect(parseDecimal("8.5")).toBe(8.5);
    expect(parseDecimal(" 12 ")).toBe(12);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("1 234,5")).toBe(1234.5);
  });

  it("is NaN for anything that isn't one number", () => {
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("1,2,3")).toBeNaN();
    expect(parseDecimal("1.234,5")).toBeNaN();
  });
});
