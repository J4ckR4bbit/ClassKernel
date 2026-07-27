import { describe, expect, it } from "vitest";
import { formatFixed, formatNumber, formatSigFigs, superscript } from "./numbers";

describe("classroom number formatting", () => {
  it("writes numbers the South African way", () => {
    expect(formatNumber(1234)).toBe("1 234"); // grouped with a non-breaking space
    expect(formatNumber(12.5)).toBe("12,5");
    expect(formatNumber(0.05)).toBe("0,05");
    expect(formatNumber(-3.456, 1)).toBe("-3,5");
  });

  it("quotes a measured value to three significant figures", () => {
    expect(formatSigFigs(9.80665)).toBe("9,81");
    expect(formatSigFigs(0.0123456)).toBe("0,0123");
    expect(formatSigFigs(1234.5)).toBe("1 230");
    // Trailing zeros a teacher wouldn't write are trimmed.
    expect(formatSigFigs(2)).toBe("2");
  });

  it("falls back to scientific notation once the exponent runs away", () => {
    expect(formatSigFigs(6.02e23)).toBe("6,02 × 10²³");
    expect(formatSigFigs(1.6e-19)).toBe("1,6 × 10⁻¹⁹");
    expect(formatSigFigs(Number.NaN)).toBe("—");
  });

  it("writes exponents as superscripts", () => {
    expect(superscript(-2)).toBe("⁻²");
    expect(superscript(10)).toBe("¹⁰");
  });
});

describe("fixed-decimal values", () => {
  it("keeps the trailing zeros, so a rounded R² doesn't read as exact", () => {
    expect(formatFixed(0.99997, 4)).toBe("1,0000");
    expect(formatFixed(0.9, 4)).toBe("0,9000");
    expect(formatFixed(1234.5, 1)).toBe("1 234,5");
    expect(formatFixed(Number.NaN, 2)).toBe("—");
  });
});
