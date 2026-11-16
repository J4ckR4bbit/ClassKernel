import { describe, expect, it } from "vitest";
import { calculate } from "./calc";

describe("calculate", () => {
  it("adds up a paper's marks, with a decimal comma or point", () => {
    expect(calculate("3+2+1,5")).toBe(6.5);
    expect(calculate("3 + 2 + 1.5")).toBe(6.5);
    expect(calculate("4")).toBe(4);
  });

  it("works out a percentage, multiplying before adding", () => {
    expect(calculate("34/50*100")).toBe(68);
    expect(calculate("34÷50×100")).toBe(68);
    expect(calculate("2+3x4")).toBe(14);
    expect(calculate("(2+3)*4")).toBe(20);
  });

  it("takes minus signs, including the typographic one", () => {
    expect(calculate("10-2,5")).toBe(7.5);
    expect(calculate("10−2,5")).toBe(7.5);
    expect(calculate("-3+5")).toBe(2);
    expect(calculate("2*-3")).toBe(-6);
  });

  it("reads spaces as thousands separators", () => {
    expect(calculate("1 250/2")).toBe(625);
  });

  it("clears binary noise from decimals", () => {
    expect(calculate("0,1+0,2")).toBe(0.3);
  });

  it("is null while the sum is unfinished or isn't one", () => {
    expect(calculate("")).toBeNull();
    expect(calculate("3+")).toBeNull();
    expect(calculate("(3+2")).toBeNull();
    expect(calculate("3+2)")).toBeNull();
    expect(calculate("3 apples")).toBeNull();
    expect(calculate("1,5,2")).toBeNull();
  });

  it("is null for a division by zero", () => {
    expect(calculate("5/0")).toBeNull();
  });
});
