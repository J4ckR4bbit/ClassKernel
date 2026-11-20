// Example set-ups: the slope questions the IEB papers keep asking (SAG Section
// B — a block on a rough slope, pushed up it, pulled at an angle, tied over a
// pulley to a hanging mass and the string cut, a surface tilted until the
// block slips), with fresh values. Each is checked against its hand-worked
// answer in examples.test.ts.

import { DEFAULT_PARAMS, G, SlopeParams } from "./slope";

export interface Example {
  id: string;
  name: string;
  note: string;
  params: SlopeParams;
}

const make = (patch: Partial<SlopeParams>): SlopeParams => ({ ...DEFAULT_PARAMS, ...patch });
const rad = (deg: number) => (deg * Math.PI) / 180;

export const EXAMPLES: Example[] = [
  {
    id: "rest",
    name: "At rest on a rough slope",
    note: "Static friction holds the block — and it is only as big as it needs to be: F_f = F_{g∥}, less than μₛF_N.",
    params: make({ mass: 6, angle: 25, muS: 0.6, muK: 0.5, start: 2.2 }),
  },
  {
    id: "slides",
    name: "Slides down a rough slope",
    note: "F_{g∥} beats μₛF_N, so it slides; kinetic friction μₖF_N then acts up the slope.",
    params: make({ mass: 3, angle: 35, muS: 0.5, muK: 0.35, start: 3.5 }),
  },
  {
    id: "frictionless",
    name: "A frictionless slope",
    note: "Only the weight's component along the slope acts: a = g sin θ, whatever the mass.",
    params: make({ mass: 2, angle: 30, frictionless: true, start: 3.5 }),
  },
  {
    id: "tilt",
    name: "Tilt it until it slips",
    note: "Press Tilt: the angle rises until static friction can't hold the block. It slips at tan θ = μₛ, whatever its mass.",
    params: make({ mass: 5, angle: 10, muS: 0.45, muK: 0.35, start: 2.5 }),
  },
  {
    id: "pushed-up",
    name: "Given a push up the slope",
    note: "Launched at 4 m·s⁻¹: weight and kinetic friction both act down the slope, so it slows, stops, and — μₛ being less than tan θ — slides back down, more slowly.",
    params: make({ mass: 2, angle: 30, muS: 0.3, muK: 0.2, start: 0.5, v0: 4 }),
  },
  {
    id: "pulled-angle",
    name: "Pulled up the slope at an angle",
    note: "F at 20° to the slope: its component across the slope lifts some weight off it, so F_N — and the friction — are less than mg cos θ.",
    params: make({ mass: 4, angle: 25, muS: 0.5, muK: 0.4, force: 40, forceAngle: 20, forceDir: "up", start: 0.8 }),
  },
  {
    id: "constant-velocity",
    name: "Pushed up at constant velocity",
    note: "F exactly balances F_{g∥} and kinetic friction: F_net = 0, so the block keeps moving at 1 m·s⁻¹ (Newton's first law).",
    params: make({
      mass: 5,
      angle: 20,
      muS: 0.4,
      muK: 0.3,
      force: Number((5 * G * (Math.sin(rad(20)) + 0.3 * Math.cos(rad(20)))).toFixed(6)),
      forceAngle: 0,
      forceDir: "up",
      start: 0.5,
      v0: 1,
    }),
  },
  {
    id: "pulley",
    name: "Pulled up by a hanging mass",
    note: "Treat each body on its own: m₂g − T = m₂a and T − F_{g∥} − F_f = m₁a; together they give a and T.",
    params: make({ setup: "pulley", mass: 2, hangingMass: 3, angle: 20, muS: 0.3, muK: 0.2, start: 1 }),
  },
  {
    id: "pulley-rest",
    name: "A hanging mass held by friction",
    note: "The hanging mass pulls harder than F_{g∥}, but not by more than μₛF_N: nothing moves, and T = m₂g.",
    params: make({ setup: "pulley", mass: 4, hangingMass: 2.5, angle: 30, muS: 0.4, muK: 0.3, start: 1.5 }),
  },
  {
    id: "cut",
    name: "Cut the string",
    note: "Run it, then press Cut the string: the block carries on up the slope, slowing at g sin θ + μₖg cos θ, while the hanging mass falls freely.",
    params: make({ setup: "pulley", mass: 2, hangingMass: 3, angle: 20, muS: 0.3, muK: 0.2, start: 0.6 }),
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
