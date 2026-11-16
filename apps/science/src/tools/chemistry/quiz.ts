// Quiz questions built from the reference's own data: elements, ions,
// configurations and molar masses. Pure functions over a random source, so
// the question maker can be tested.

import { molarMass } from "./bonds";
import { ELEMENTS, Element, inSimplifiedTable } from "./elements";
import { configuration, spdfNotation } from "./electrons";
import { POLYATOMIC_IONS, PolyatomicIon, chargeText } from "./ions";
import { SUBSTANCES } from "./substanceData";
import { formatNumber } from "@classkernel/ui/numbers";

export type QuizKind = "symbol-to-name" | "name-to-symbol" | "ion-to-name" | "name-to-ion" | "configuration" | "molar-mass" | "group-period";

export const QUIZ_KINDS: Array<{ kind: QuizKind; label: string; about: string }> = [
  { kind: "symbol-to-name", label: "Symbol → name", about: "Which element is this symbol?" },
  { kind: "name-to-symbol", label: "Name → symbol", about: "What is the symbol for this element?" },
  { kind: "group-period", label: "Group & period", about: "Where does this element sit?" },
  { kind: "configuration", label: "Electron configuration", about: "Which configuration belongs to this element?" },
  { kind: "ion-to-name", label: "Ion → name", about: "Name this polyatomic ion." },
  { kind: "name-to-ion", label: "Name → ion", about: "What is the formula and charge?" },
  { kind: "molar-mass", label: "Molar mass", about: "What is the molar mass, from the data sheet?" },
];

export type Scope = "simplified" | "all";

export interface Question {
  kind: QuizKind;
  prompt: string;
  /** A second line under the prompt, where it helps (the element's name in full). */
  hint?: string;
  options: string[];
  answer: string;
  /** Shown after the reveal. */
  explanation: string;
}

export type Random = () => number;

function pick<T>(items: T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `count` distinct distractors from `pool`, never equal to `answer`. */
function distractors(pool: string[], answer: string, count: number, random: Random): string[] {
  const candidates = [...new Set(pool.filter((p) => p !== answer))];
  return shuffle(candidates, random).slice(0, count);
}

function ionFormulaText(ion: PolyatomicIon): string {
  return `${ion.formula.replace(/[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+$/, "")} (${chargeText(ion.charge)})`;
}

const elementPool = (scope: Scope): Element[] => (scope === "all" ? ELEMENTS.filter((e) => e.z <= 92) : ELEMENTS.filter(inSimplifiedTable));
const ionPool = (scope: Scope): PolyatomicIon[] => (scope === "all" ? POLYATOMIC_IONS : POLYATOMIC_IONS.filter((i) => i.syllabus));

/** One question of the kind, with `optionCount` choices. */
export function makeQuestion(kind: QuizKind, scope: Scope, random: Random = Math.random, optionCount = 4): Question {
  const n = Math.max(2, Math.min(6, optionCount)) - 1;
  switch (kind) {
    case "symbol-to-name": {
      const pool = elementPool(scope);
      const e = pick(pool, random);
      // Distractors that look alike where possible: same first letter.
      const alike = pool.filter((x) => x.name[0] === e.name[0] && x.z !== e.z).map((x) => x.name);
      const rest = pool.map((x) => x.name);
      const wrong = [...distractors(alike, e.name, Math.min(2, n), random)];
      wrong.push(...distractors(rest.filter((x) => !wrong.includes(x)), e.name, n - wrong.length, random));
      return { kind, prompt: e.symbol, options: shuffle([e.name, ...wrong], random), answer: e.name, explanation: `${e.symbol} is ${e.name}, atomic number ${e.z}.` };
    }
    case "name-to-symbol": {
      const pool = elementPool(scope);
      const e = pick(pool, random);
      const alike = pool.filter((x) => x.symbol[0] === e.symbol[0] && x.z !== e.z).map((x) => x.symbol);
      const wrong = [...distractors(alike, e.symbol, Math.min(2, n), random)];
      wrong.push(...distractors(pool.map((x) => x.symbol).filter((x) => !wrong.includes(x)), e.symbol, n - wrong.length, random));
      return { kind, prompt: e.name, options: shuffle([e.symbol, ...wrong], random), answer: e.symbol, explanation: `${e.name} is ${e.symbol}, atomic number ${e.z}.` };
    }
    case "group-period": {
      const pool = elementPool(scope).filter((e) => e.group !== null);
      const e = pick(pool, random);
      const text = (x: Element) => `Group ${x.group}, period ${x.period}`;
      const near = pool.filter((x) => x.z !== e.z && (x.group === e.group || x.period === e.period)).map(text);
      const wrong = [...distractors(near, text(e), Math.min(2, n), random)];
      wrong.push(...distractors(pool.map(text).filter((x) => !wrong.includes(x)), text(e), n - wrong.length, random));
      return { kind, prompt: `${e.name} (${e.symbol})`, options: shuffle([text(e), ...wrong], random), answer: text(e), explanation: `${e.name} has ${e.z} electrons: ${spdfNotation(configuration(e.z))}, so it is in period ${e.period}, group ${e.group}.` };
    }
    case "configuration": {
      // Up to krypton: beyond that the strings get long for a board.
      const pool = elementPool(scope).filter((e) => e.z <= 36);
      const e = pick(pool, random);
      const text = (z: number) => spdfNotation(configuration(z));
      const neighbours = pool.filter((x) => Math.abs(x.z - e.z) <= 3 && x.z !== e.z).map((x) => text(x.z));
      const wrong = [...distractors(neighbours, text(e.z), Math.min(2, n), random)];
      wrong.push(...distractors(pool.map((x) => text(x.z)).filter((x) => !wrong.includes(x)), text(e.z), n - wrong.length, random));
      return { kind, prompt: `${e.name} (${e.symbol}), Z = ${e.z}`, options: shuffle([text(e.z), ...wrong], random), answer: text(e.z), explanation: `${e.z} electrons fill in the Aufbau order: ${text(e.z)}.` };
    }
    case "ion-to-name": {
      const pool = ionPool(scope);
      const ion = pick(pool, random);
      const wrong = distractors(pool.map((i) => i.name), ion.name, n, random);
      return { kind, prompt: ionFormulaText(ion), options: shuffle([ion.name, ...wrong], random), answer: ion.name, explanation: `${ionFormulaText(ion)} is ${ion.name.toLowerCase()}. ${ion.notes.split(". ")[0]}.` };
    }
    case "name-to-ion": {
      const pool = ionPool(scope);
      const ion = pick(pool, random);
      const wrong = distractors(pool.map(ionFormulaText), ionFormulaText(ion), n, random);
      return { kind, prompt: ion.name, options: shuffle([ionFormulaText(ion), ...wrong], random), answer: ionFormulaText(ion), explanation: `${ion.name} is ${ionFormulaText(ion)}.` };
    }
    case "molar-mass": {
      const pool = SUBSTANCES.filter((s) => (scope === "all" ? true : s.section === "inorganic" || s.group === "Alkanes" || s.group === "Alcohols"));
      const s = pick(pool, random);
      const m = molarMass(s.formula);
      const text = (x: number) => `${formatNumber(x, 1)} g·mol⁻¹`;
      // Wrong answers a learner actually gets: forgetting a subscript, doubling, off by a water.
      const candidates = new Set<number>([m + 1, m - 1, m * 2, m / 2, m + 16, m - 16, m + 18, m - 18, m + 2, m - 2].map((x) => Math.round(x * 10) / 10).filter((x) => x > 0 && x !== m));
      const wrong = distractors([...candidates].map(text), text(m), n, random);
      return { kind, prompt: s.formula, hint: s.name, options: shuffle([text(m), ...wrong], random), answer: text(m), explanation: `Add the data sheet's masses for ${s.formula}: ${text(m)}.` };
    }
  }
}
