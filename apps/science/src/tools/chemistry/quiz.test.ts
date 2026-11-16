import { describe, expect, it } from "vitest";
import { QUIZ_KINDS, makeQuestion } from "./quiz";

/** A small deterministic generator, so a run can be repeated. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("quiz questions", () => {
  it("always include the answer once among distinct options, for every kind and scope", () => {
    for (const { kind } of QUIZ_KINDS) {
      for (const scope of ["simplified", "all"] as const) {
        const random = seeded(kind.length * 7 + (scope === "all" ? 1 : 0));
        for (let i = 0; i < 40; i++) {
          const q = makeQuestion(kind, scope, random, 4);
          expect(q.options.length, `${kind}/${scope}`).toBe(4);
          expect(new Set(q.options).size, `${kind}/${scope}: ${q.options.join(" | ")}`).toBe(4);
          expect(q.options).toContain(q.answer);
          expect(q.prompt.length).toBeGreaterThan(0);
          expect(q.explanation.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it("asks the right things", () => {
    const random = seeded(3);
    const q = makeQuestion("symbol-to-name", "simplified", random);
    expect(q.prompt).toMatch(/^[A-Z][a-z]?$/);
    const ion = makeQuestion("name-to-ion", "simplified", random);
    expect(ion.answer).toMatch(/\((\d?[+−])\)$/);
    const mass = makeQuestion("molar-mass", "simplified", random);
    expect(mass.answer).toMatch(/g·mol⁻¹$/);
    const config = makeQuestion("configuration", "all", random);
    expect(config.answer).toMatch(/^1s/);
  });

  it("honours the number of options", () => {
    const random = seeded(9);
    expect(makeQuestion("ion-to-name", "all", random, 2).options.length).toBe(2);
    expect(makeQuestion("ion-to-name", "all", random, 6).options.length).toBe(6);
  });
});
