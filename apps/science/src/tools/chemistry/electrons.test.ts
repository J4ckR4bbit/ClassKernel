import { describe, expect, it } from "vitest";
import { configuration, orbitalBoxes, shells, shorthandNotation, spdfNotation, unpairedElectrons, valenceElectrons } from "./electrons";

const notation = (z: number) => spdfNotation(configuration(z));

describe("electron configurations", () => {
  it("follows the Aufbau order, written in filling order as the course does", () => {
    expect(notation(1)).toBe("1s¹");
    expect(notation(6)).toBe("1s² 2s² 2p²");
    expect(notation(11)).toBe("1s² 2s² 2p⁶ 3s¹");
    expect(notation(17)).toBe("1s² 2s² 2p⁶ 3s² 3p⁵");
    expect(notation(19)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹");
    expect(notation(26)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶");
    expect(notation(30)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰");
    expect(notation(35)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰ 4p⁵");
  });

  it("knows the exceptions: chromium, copper, silver, gold, palladium", () => {
    expect(notation(24)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹ 3d⁵");
    expect(notation(29)).toBe("1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹ 3d¹⁰");
    expect(shorthandNotation(47)).toBe("[Kr] 5s¹ 4d¹⁰");
    expect(shorthandNotation(46)).toBe("[Kr] 4d¹⁰");
    expect(shorthandNotation(79)).toBe("[Xe] 6s¹ 4f¹⁴ 5d¹⁰");
    expect(shorthandNotation(92)).toBe("[Rn] 7s² 5f³ 6d¹");
  });

  it("always adds up to the atomic number", () => {
    for (let z = 1; z <= 118; z++) {
      const total = configuration(z).reduce((s, o) => s + o.electrons, 0);
      expect(total, `Z = ${z}`).toBe(z);
    }
  });

  it("writes the noble-gas shorthand", () => {
    expect(shorthandNotation(1)).toBe("1s¹");
    expect(shorthandNotation(2)).toBe("1s²");
    expect(shorthandNotation(3)).toBe("[He] 2s¹");
    expect(shorthandNotation(11)).toBe("[Ne] 3s¹");
    expect(shorthandNotation(26)).toBe("[Ar] 4s² 3d⁶");
    expect(shorthandNotation(56)).toBe("[Xe] 6s²");
    expect(shorthandNotation(82)).toBe("[Xe] 6s² 4f¹⁴ 5d¹⁰ 6p²");
  });

  it("gives the shell populations for a Bohr diagram", () => {
    expect(shells(configuration(1))).toEqual([1]);
    expect(shells(configuration(8))).toEqual([2, 6]);
    expect(shells(configuration(19))).toEqual([2, 8, 8, 1]);
    expect(shells(configuration(20))).toEqual([2, 8, 8, 2]);
    expect(shells(configuration(26))).toEqual([2, 8, 14, 2]);
    expect(shells(configuration(35))).toEqual([2, 8, 18, 7]);
    expect(valenceElectrons(configuration(17))).toBe(7);
    expect(valenceElectrons(configuration(26))).toBe(2);
  });

  it("fills orbital boxes one at a time before pairing (Hund's rule)", () => {
    const nitrogen = orbitalBoxes(configuration(7));
    expect(nitrogen.map((s) => s.label)).toEqual(["1s", "2s", "2p"]);
    expect(nitrogen[2].boxes.map((b) => b.electrons)).toEqual([1, 1, 1]);
    const oxygen = orbitalBoxes(configuration(8));
    expect(oxygen[2].boxes.map((b) => b.electrons)).toEqual([2, 1, 1]);
    const iron = orbitalBoxes(configuration(26));
    expect(iron.map((s) => s.label)).toEqual(["1s", "2s", "2p", "3s", "3p", "4s", "3d"]);
    expect(iron[6].boxes.map((b) => b.electrons)).toEqual([2, 1, 1, 1, 1]);
    expect(unpairedElectrons(configuration(26))).toBe(4);
    expect(unpairedElectrons(configuration(24))).toBe(6);
    expect(unpairedElectrons(configuration(30))).toBe(0);
    // Potassium shows no 3d boxes unless empty ones are asked for.
    expect(orbitalBoxes(configuration(19)).map((s) => s.label)).toEqual(["1s", "2s", "2p", "3s", "3p", "4s"]);
    expect(orbitalBoxes(configuration(19), true).map((s) => s.label)).toEqual(["1s", "2s", "2p", "3s", "3p", "4s"]);
  });
});
