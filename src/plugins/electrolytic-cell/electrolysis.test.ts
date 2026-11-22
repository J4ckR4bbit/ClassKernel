import { describe, expect, it } from "vitest";
import {
  ANODE_MASS,
  CHLORIDE_CONCENTRATED,
  F,
  MOLAR_MASS,
  PRESETS,
  Setup,
  VM,
  advance,
  analyse,
  concentrationOf,
  fileNameFor,
  freshProgress,
  netText,
  oxidationText,
  presetFor,
  productsOf,
  reductionText,
  talkingPoints,
  three,
  timeText,
} from "./electrolysis";

const presetSetup = (id: string): Setup => {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(id);
  return preset.setup;
};

/** The cell straight after switching on. */
const atStart = (setup: Setup) => analyse(setup, freshProgress(setup));

/** Run a set-up at `amperes` for `seconds`. */
const run = (setup: Setup, amperes: number, seconds: number) => advance(setup, freshProgress(setup), amperes, seconds);

const product = (setup: Setup, progress: ReturnType<typeof run>, formula: string) => {
  const found = productsOf(setup, progress).find((p) => p.formula === formula);
  if (!found) throw new Error(`No ${formula}`);
  return found;
};

describe("what forms at each electrode", () => {
  // The answers the papers expect, for every set-up the tool offers.
  const expected: Record<string, { cathode: string; anode: string; net: string; volts: number }> = {
    cucl2: { cathode: "Cu²⁺(aq) + 2e⁻ → Cu(s)", anode: "2Cl⁻(aq) → Cl₂(g) + 2e⁻", net: "Cu²⁺(aq) + 2Cl⁻(aq) → Cu(s) + Cl₂(g)", volts: 1.02 },
    "cuso4-c": { cathode: "Cu²⁺(aq) + 2e⁻ → Cu(s)", anode: "2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻", net: "2Cu²⁺(aq) + 2H₂O(l) → 2Cu(s) + O₂(g) + 4H⁺(aq)", volts: 0.89 },
    "cuso4-cu": { cathode: "Cu²⁺(aq) + 2e⁻ → Cu(s)", anode: "Cu(s) → Cu²⁺(aq) + 2e⁻", net: "No net reaction: copper is moved from the anode to the cathode.", volts: 0 },
    refining: { cathode: "Cu²⁺(aq) + 2e⁻ → Cu(s)", anode: "Cu(s) → Cu²⁺(aq) + 2e⁻", net: "No net reaction: copper is moved from the anode to the cathode.", volts: 0 },
    "plate-cu": { cathode: "Cu²⁺(aq) + 2e⁻ → Cu(s)", anode: "Cu(s) → Cu²⁺(aq) + 2e⁻", net: "No net reaction: copper is moved from the anode to the cathode.", volts: 0 },
    "plate-ag": { cathode: "Ag⁺(aq) + e⁻ → Ag(s)", anode: "Ag(s) → Ag⁺(aq) + e⁻", net: "No net reaction: silver is moved from the anode to the cathode.", volts: 0 },
    "plate-ni": { cathode: "Ni²⁺(aq) + 2e⁻ → Ni(s)", anode: "Ni(s) → Ni²⁺(aq) + 2e⁻", net: "No net reaction: nickel is moved from the anode to the cathode.", volts: 0 },
    brine: { cathode: "2H₂O(l) + 2e⁻ → H₂(g) + 2OH⁻(aq)", anode: "2Cl⁻(aq) → Cl₂(g) + 2e⁻", net: "2H₂O(l) + 2Cl⁻(aq) → H₂(g) + 2OH⁻(aq) + Cl₂(g)", volts: 2.19 },
    "nacl-dilute": { cathode: "2H₂O(l) + 2e⁻ → H₂(g) + 2OH⁻(aq)", anode: "2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻", net: "2H₂O(l) → 2H₂(g) + O₂(g)", volts: 2.06 },
    water: { cathode: "2H⁺(aq) + 2e⁻ → H₂(g)", anode: "2H₂O(l) → O₂(g) + 4H⁺(aq) + 4e⁻", net: "2H₂O(l) → 2H₂(g) + O₂(g)", volts: 1.23 },
    ki: { cathode: "2H₂O(l) + 2e⁻ → H₂(g) + 2OH⁻(aq)", anode: "2I⁻(aq) → I₂(aq) + 2e⁻", net: "2H₂O(l) + 2I⁻(aq) → H₂(g) + 2OH⁻(aq) + I₂(aq)", volts: 1.37 },
    "nacl-molten": { cathode: "Na⁺ + e⁻ → Na(l)", anode: "2Cl⁻ → Cl₂(g) + 2e⁻", net: "2Na⁺ + 2Cl⁻ → 2Na(l) + Cl₂(g)", volts: 4.07 },
    "pbbr2-molten": { cathode: "Pb²⁺ + 2e⁻ → Pb(l)", anode: "2Br⁻ → Br₂(g) + 2e⁻", net: "Pb²⁺ + 2Br⁻ → Pb(l) + Br₂(g)", volts: 1.2 },
  };

  it("covers every set-up", () => {
    expect(Object.keys(expected).sort()).toEqual(PRESETS.map((p) => p.id).sort());
  });

  for (const [id, want] of Object.entries(expected)) {
    it(id, () => {
      const setup = presetSetup(id);
      const a = atStart(setup);
      const molten = a.electrolyte.molten;
      expect(reductionText(a.cathode.couple, molten)).toBe(want.cathode);
      expect(oxidationText(a.anode.couple, molten)).toBe(want.anode);
      expect(netText(a)).toBe(want.net);
      expect(a.minVoltage).toBeCloseTo(want.volts, 2);
      expect(presetFor(setup)?.id).toBe(id);
    });
  }

  it("ranks the cathode's candidates by E°, highest first, with water in a solution", () => {
    const a = atStart(presetSetup("brine"));
    expect(a.cathodeList.map((c) => c.agent)).toEqual(["H₂O", "Na⁺"]);
    const melt = atStart(presetSetup("nacl-molten"));
    expect(melt.cathodeList.map((c) => c.agent)).toEqual(["Na⁺"]);
    expect(melt.anodeList.map((c) => c.agent)).toEqual(["Cl⁻"]);
  });

  it("gives Cl₂ from concentrated chloride and O₂ from dilute, at the threshold", () => {
    const at = (concentration: number) => atStart({ ...presetSetup("nacl-dilute"), concentration });
    expect(at(CHLORIDE_CONCENTRATED).anode.couple.id).toBe("Cl2");
    expect(at(CHLORIDE_CONCENTRATED).chlorideException).toBe(true);
    expect(at(CHLORIDE_CONCENTRATED * 0.99).anode.couple.id).toBe("H2O-ox");
    expect(at(CHLORIDE_CONCENTRATED * 0.99).chlorideDilute).toBe(true);
    // CuCl₂ counts its two chloride ions: 0,25 mol·dm⁻³ CuCl₂ is 0,5 mol·dm⁻³ Cl⁻.
    expect(atStart({ ...presetSetup("cucl2"), concentration: 0.25 }).anode.couple.id).toBe("Cl2");
  });

  it("oxidises an active anode before anything in the solution, and leaves an inert one alone", () => {
    expect(atStart({ ...presetSetup("cucl2"), anode: "cu" }).anode.agent).toBe("Cu (the anode)");
    expect(atStart({ ...presetSetup("cucl2"), anode: "pt" }).anode.agent).toBe("Cl⁻");
    // Silver (+0,80 V) is a weaker reducing agent than iodide (+0,54 V).
    expect(atStart({ ...presetSetup("ki"), anode: "ag" }).anode.agent).toBe("I⁻");
  });
});

describe("Faraday's law", () => {
  it("works out the textbook CuCl₂ question: 2,00 A for 30 minutes", () => {
    const setup = presetSetup("cucl2");
    const done = run(setup, 2, 1800);
    expect(done.time).toBeCloseTo(1800, 6);
    expect(done.charge).toBeCloseTo(3600, 6);
    const ne = 3600 / F;
    const cu = product(setup, done, "Cu");
    expect(cu.role).toBe("cathode");
    expect(cu.moles).toBeCloseTo(ne / 2, 9);
    expect(cu.grams).toBeCloseTo((ne / 2) * 63.5, 6);
    expect(three(cu.grams)).toBe("1,18");
    const cl2 = product(setup, done, "Cl₂");
    expect(cl2.volume).toBeCloseTo((ne / 2) * VM, 9);
    expect(three(cl2.volume!)).toBe("0,418");
    expect(done.plated.Cu).toBeCloseTo(cu.grams, 9);
    // The solution has lost exactly that much Cu²⁺ and twice as much Cl⁻.
    const start = freshProgress(setup);
    expect(start.moles["Cu²⁺"] - done.moles["Cu²⁺"]).toBeCloseTo(ne / 2, 9);
    expect(start.moles["Cl⁻"] - done.moles["Cl⁻"]).toBeCloseTo(ne, 9);
  });

  it("gives the same answer however the run is chopped into frames", () => {
    const setup = presetSetup("cucl2");
    let p = freshProgress(setup);
    for (let i = 0; i < 1800; i++) p = advance(setup, p, 2, 1);
    expect(p.plated.Cu).toBeCloseTo(run(setup, 2, 1800).plated.Cu, 9);
  });

  it("collects hydrogen and oxygen 2 : 1 from acidified water, and the acid stays", () => {
    const setup = presetSetup("water");
    const done = run(setup, 0.5, 600);
    const h2 = product(setup, done, "H₂");
    const o2 = product(setup, done, "O₂");
    expect(h2.volume! / o2.volume!).toBeCloseTo(2, 9);
    expect(done.moles["H⁺"]).toBeCloseTo(freshProgress(setup).moles["H⁺"], 9);
  });

  it("moves copper from anode to cathode with copper electrodes, leaving [Cu²⁺] as it was", () => {
    const setup = presetSetup("cuso4-cu");
    const done = run(setup, 2, 3600);
    const lost = ANODE_MASS - done.anodeLeft;
    expect(done.plated.Cu).toBeCloseTo(lost, 9);
    expect(done.moles["Cu²⁺"]).toBeCloseTo(freshProgress(setup).moles["Cu²⁺"], 9);
    expect(product(setup, done, "Cu").role).toBe("cathode");
  });

  it("refines impure copper: zinc and iron go into solution, silver and gold fall as sludge, only copper plates", () => {
    const setup = presetSetup("refining");
    const done = run(setup, 2, 3600);
    const lost = ANODE_MASS - done.anodeLeft;
    expect(done.sludge.Ag).toBeCloseTo(0.015 * lost, 9);
    expect(done.sludge.Au).toBeCloseTo(0.005 * lost, 9);
    expect(done.moles["Zn²⁺"]).toBeCloseTo((0.02 * lost) / MOLAR_MASS.Zn, 9);
    expect(done.moles["Fe²⁺"]).toBeCloseTo((0.01 * lost) / MOLAR_MASS.Fe, 9);
    expect(Object.keys(done.plated)).toEqual(["Cu"]);
    // Some of the charge went to Zn and Fe, so a little more Cu²⁺ is used than made.
    expect(done.moles["Cu²⁺"]).toBeLessThan(freshProgress(setup).moles["Cu²⁺"]);
    // Every electron is accounted for.
    expect(done.plated.Cu / MOLAR_MASS.Cu * 2).toBeCloseTo(3600 * 2 / F, 9);
  });

  it("makes sodium hydroxide from brine: one OH⁻ for every electron", () => {
    const setup = presetSetup("brine");
    const done = run(setup, 2, 1800);
    expect(done.moles["OH⁻"]).toBeCloseTo(3600 / F, 9);
    expect(talkingPoints(setup, done, analyse(setup, done)).join(" ")).toContain("2NaCl(aq) + 2H₂O(l) → 2NaOH(aq) + H₂(g) + Cl₂(g)");
  });

  it("turns to hydrogen at the cathode once the Cu²⁺ is used up", () => {
    const setup: Setup = { ...presetSetup("cuso4-c"), concentration: 0.01 };
    const copper = 0.01 * 0.25;
    // Twice the charge the copper needs.
    const done = run(setup, 2, (4 * copper * F) / 2);
    expect(done.moles["Cu²⁺"]).toBeLessThan(1e-9);
    expect(done.plated.Cu).toBeCloseTo(copper * MOLAR_MASS.Cu, 6);
    expect(analyse(setup, done).cathode.couple.id).toBe("H");
    expect(product(setup, done, "H₂").moles).toBeCloseTo(copper, 6);
  });

  it("stops when an active anode has dissolved away, at the moment it does", () => {
    const setup = presetSetup("cuso4-cu");
    const gone = (ANODE_MASS / MOLAR_MASS.Cu) * 2 * F / 2; // seconds at 2 A
    const done = run(setup, 2, gone * 3);
    expect(done.stopped).toBe("anode-gone");
    expect(done.anodeLeft).toBeLessThan(1e-9);
    expect(done.time).toBeCloseTo(gone, 3);
    expect(advance(setup, done, 2, 60)).toBe(done);
  });

  it("dissolves a spoon put at the anode, and says so", () => {
    const setup: Setup = { ...presetSetup("plate-cu"), anode: "spoon", cathode: "cu" };
    const a = atStart(setup);
    expect(a.anode.agent).toBe("Fe (the anode)");
    expect(talkingPoints(setup, freshProgress(setup), a).join(" ")).toContain("To plate an object, make it the cathode");
  });

  it("never runs a melt short", () => {
    const setup = presetSetup("nacl-molten");
    const done = run(setup, 5, 36000);
    expect(analyse(setup, done).cathode.agent).toBe("Na⁺");
    expect(done.plated.Na).toBeCloseTo((5 * 36000 / F) * 23, 6);
  });

  it("keeps the concentrations it starts with", () => {
    const setup = presetSetup("cucl2");
    const start = freshProgress(setup);
    expect(concentrationOf(start, "Cu²⁺")).toBeCloseTo(1, 9);
    expect(concentrationOf(start, "Cl⁻")).toBeCloseTo(2, 9);
  });
});

describe("words and numbers", () => {
  it("writes times the way the board does", () => {
    expect(timeText(0)).toBe("0 min 00 s");
    expect(timeText(1800)).toBe("30 min 00 s");
    expect(timeText(1799.9999999)).toBe("30 min 00 s");
    expect(timeText(3905)).toBe("1 h 05 min 05 s");
  });

  it("gives three significant figures, keeping the trailing zeros", () => {
    expect(three(3600)).toBe("3 600");
    expect(three(0.037306)).toBe("0,0373");
    expect(three(2)).toBe("2,00");
    expect(three(0.5)).toBe("0,500");
  });

  it("names the saved picture after the cell", () => {
    expect(fileNameFor(presetSetup("refining"))).toBe("electrolysis_cuso4_cu_impure_cu.png");
  });
});
