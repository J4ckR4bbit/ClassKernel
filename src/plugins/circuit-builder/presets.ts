// Example circuits: the shapes the IEB and the school's own papers keep using,
// from the G08 series circuit to the G12 internal-resistance and diode
// questions, with fresh values. Each is checked against its hand-worked
// answers in presets.test.ts, so the memo a teacher reads off is right.

import { Circuit, EMPTY, Part, PartType, Pt, Rot, addWire, defaultPart, stepsBetween } from "./circuit";
import { solve } from "./solve";

export interface Spec extends Partial<Omit<Part, "id" | "type" | "x" | "y" | "rot">> {
  t: PartType;
  at: [number, number];
  /** Vertical (terminal a at the top) — otherwise horizontal, terminal a on the left. */
  v?: boolean;
  /** Turned round: terminal a on the right (or at the bottom). A cell's + then faces left; a diode points left. */
  rev?: boolean;
}

export function build(specs: Spec[], paths: Array<Array<[number, number]>>, glowAt?: number): Circuit {
  let c: Circuit = { ...EMPTY, parts: [] };
  specs.forEach((s, i) => {
    const { t, at, v, rev, ...props } = s;
    const rot = ((v ? 1 : 0) + (rev ? 2 : 0)) as Rot;
    const part = { ...defaultPart(t, `p${i + 1}`, at[0], at[1], rot, ""), ...props };
    c = { ...c, parts: [...c.parts, part] };
  });
  for (const corners of paths) {
    const path: Pt[] = [{ x: corners[0][0], y: corners[0][1] }];
    for (let i = 1; i < corners.length; i++) path.push(...stepsBetween(path[path.length - 1], { x: corners[i][0], y: corners[i][1] }));
    c = addWire(c, path);
  }
  return { ...c, glowAt: glowAt ?? brightestLamp(c) };
}

/** The power of the brightest lamp as the circuit stands (1 W when none is lit): what "full glow" is set to. */
export function brightestLamp(c: Circuit): number {
  const s = solve(c);
  const most = Math.max(0, ...c.parts.filter((p) => p.type === "lamp").map((p) => s.parts[p.id]?.P ?? 0));
  return most > 1e-9 ? Number(most.toPrecision(3)) : 1;
}

export interface Preset {
  id: string;
  name: string;
  /** Who it is for and what it shows. */
  note: string;
  make: () => Circuit;
}

export const PRESETS: Preset[] = [
  {
    id: "series",
    name: "Series: two lamps, an ammeter and a voltmeter",
    note: "G08–G09. The current is the same everywhere in a series circuit; the voltmeter reads the lamp's share of the 3 V.",
    make: () =>
      build(
        [
          { t: "cell", at: [8, 3], emf: 3, cells: 2, showValue: true },
          { t: "switch", at: [12, 3], label: "S", closed: true },
          { t: "ammeter", at: [16, 6], v: true, label: "A" },
          { t: "lamp", at: [12, 10], label: "L1", R: 6 },
          { t: "lamp", at: [8, 10], label: "L2", R: 6 },
          { t: "voltmeter", at: [12, 12], label: "V" },
        ],
        [
          [[4, 3], [7, 3]],
          [[9, 3], [11, 3]],
          [[13, 3], [16, 3], [16, 5]],
          [[16, 7], [16, 10], [13, 10]],
          [[11, 10], [9, 10]],
          [[7, 10], [4, 10], [4, 3]],
          [[11, 10], [11, 12]],
          [[13, 10], [13, 12]],
        ],
      ),
  },
  {
    id: "series-parallel-lamps",
    name: "Lamps in series and parallel, with a switch",
    note: "G09. Identical lamps: lamp 1 carries the whole current and glows brightest; lamps 2 and 3 share it. Open S and lamp 2 goes out: lamps 1 and 3 are then in series and equally bright — lamp 1 dimmer than before, lamp 3 brighter.",
    make: () =>
      build(
        [
          { t: "cell", at: [8, 3], emf: 6, cells: 2, showValue: true },
          { t: "ammeter", at: [13, 3], label: "A" },
          { t: "lamp", at: [17, 5], v: true, label: "1", R: 4 },
          { t: "lamp", at: [11, 8], label: "3", R: 4 },
          { t: "lamp", at: [9, 11], label: "2", R: 4, flip: true },
          { t: "switch", at: [14, 11], label: "S", closed: true, flip: true },
        ],
        [
          [[7, 3], [4, 3], [4, 11], [8, 11]],
          [[9, 3], [12, 3]],
          [[14, 3], [17, 3], [17, 4]],
          [[17, 6], [17, 11], [15, 11]],
          [[17, 8], [12, 8]],
          [[10, 8], [4, 8]],
          [[10, 11], [13, 11]],
        ],
      ),
  },
  {
    id: "parallel-ammeters",
    name: "Resistors in parallel, with an ammeter in each branch",
    note: "G09–G10. The branch currents add up to the main current; each branch has the full 12 V across it.",
    make: () =>
      build(
        [
          { t: "cell", at: [8, 3], emf: 12, cells: 3, showValue: true },
          { t: "ammeter", at: [13, 3], label: "A1" },
          { t: "resistor", at: [10, 7], label: "R1", R: 4 },
          { t: "ammeter", at: [14, 7], label: "A2" },
          { t: "resistor", at: [10, 11], label: "R2", R: 6 },
          { t: "ammeter", at: [14, 11], label: "A3" },
          { t: "voltmeter", at: [10, 13], label: "V" },
        ],
        [
          [[7, 3], [4, 3], [4, 11], [9, 11]],
          [[9, 3], [12, 3]],
          [[14, 3], [17, 3], [17, 11], [15, 11]],
          [[4, 7], [9, 7]],
          [[11, 7], [13, 7]],
          [[15, 7], [17, 7]],
          [[11, 11], [13, 11]],
          [[9, 11], [9, 13]],
          [[11, 11], [11, 13]],
        ],
      ),
  },
  {
    id: "internal-resistance",
    name: "Internal resistance: emf, terminal voltage and lost volts",
    note: "G12. Closed, V1 reads the terminal voltage, less than the emf by Ir; open S and V1 reads the emf. R2 and R3 in parallel make 4 Ω.",
    make: () =>
      build(
        [
          { t: "cell", at: [8, 4], emf: 12, r: 1, cells: 2, showValue: true },
          { t: "voltmeter", at: [8, 2], label: "V1" },
          { t: "switch", at: [12, 4], label: "S", closed: true },
          { t: "ammeter", at: [16, 4], label: "A" },
          { t: "resistor", at: [19, 6], v: true, label: "R1", R: 3, flip: true },
          { t: "resistor", at: [14, 9], label: "R2", R: 6 },
          { t: "resistor", at: [14, 12], label: "R3", R: 12 },
          { t: "voltmeter", at: [14, 14], label: "V2" },
        ],
        [
          [[7, 4], [7, 2]],
          [[9, 4], [9, 2]],
          [[9, 4], [11, 4]],
          [[13, 4], [15, 4]],
          [[17, 4], [19, 4], [19, 5]],
          [[19, 7], [19, 12], [15, 12]],
          [[19, 9], [15, 9]],
          [[13, 9], [9, 9], [9, 12], [13, 12]],
          [[9, 12], [9, 14], [13, 14]],
          [[15, 14], [19, 14], [19, 12]],
          [[9, 9], [4, 9], [4, 4], [7, 4]],
        ],
      ),
  },
  {
    id: "two-switches",
    name: "Two switches: what changes when S2 closes?",
    note: "G11–G12. With S2 open the current is 1 A; close S2 and R3 joins R2 in parallel, the current rises to 1,5 A, V1 rises and V2 falls.",
    make: () =>
      build(
        [
          { t: "cell", at: [7, 3], emf: 12, r: 2, cells: 1, showValue: true },
          { t: "switch", at: [11, 3], label: "S1", closed: true },
          { t: "ammeter", at: [15, 3], label: "A" },
          { t: "resistor", at: [18, 6], v: true, label: "R1", R: 4 },
          { t: "voltmeter", at: [21, 6], v: true, label: "V1" },
          { t: "resistor", at: [13, 9], label: "R2", R: 6 },
          { t: "resistor", at: [11, 12], label: "R3", R: 3 },
          { t: "switch", at: [15, 12], label: "S2" },
          { t: "voltmeter", at: [13, 14], label: "V2" },
        ],
        [
          [[6, 3], [3, 3], [3, 9], [12, 9]],
          [[8, 3], [10, 3]],
          [[12, 3], [14, 3]],
          [[16, 3], [18, 3], [18, 5]],
          [[18, 5], [21, 5]],
          [[18, 7], [21, 7]],
          [[18, 7], [18, 12], [16, 12]],
          [[14, 9], [18, 9]],
          [[8, 9], [8, 12], [10, 12]],
          [[12, 12], [14, 12]],
          [[8, 12], [8, 14], [12, 14]],
          [[14, 14], [18, 14], [18, 12]],
        ],
      ),
  },
  {
    id: "rheostat",
    name: "A rheostat and a lamp",
    note: "G11. Slide the rheostat up and the current, the lamp's brightness and the lost volts fall, so the voltmeter across the cell rises.",
    make: () =>
      build(
        [
          { t: "cell", at: [9, 4], emf: 6, r: 1, cells: 1, showValue: true },
          { t: "voltmeter", at: [9, 2], label: "V" },
          { t: "ammeter", at: [16, 7], v: true, label: "A" },
          { t: "lamp", at: [12, 10], label: "L", R: 5, showValue: true },
          { t: "rheostat", at: [7, 10], R: 6, Rmax: 24 },
        ],
        [
          [[8, 4], [8, 2]],
          [[10, 4], [10, 2]],
          [[10, 4], [16, 4], [16, 6]],
          [[16, 8], [16, 10], [13, 10]],
          [[11, 10], [8, 10]],
          [[6, 10], [4, 10], [4, 4], [8, 4]],
        ],
      ),
  },
  {
    id: "diodes",
    name: "Diodes: which lamps light?",
    note: "G12. An ideal diode conducts only in the direction of its arrow. Lamp A's diode points along the current, so A lights; B's points against it. Turn the cell round and they swap.",
    make: () =>
      build(
        [
          { t: "cell", at: [10, 3], emf: 6, cells: 3, showValue: true },
          { t: "switch", at: [16, 5], v: true, label: "S", closed: true },
          { t: "diode", at: [8, 8], rev: true },
          { t: "lamp", at: [12, 8], label: "A", R: 6 },
          { t: "diode", at: [8, 11] },
          { t: "lamp", at: [12, 11], label: "B", R: 6, flip: true },
        ],
        [
          [[9, 3], [4, 3], [4, 11], [7, 11]],
          [[11, 3], [16, 3], [16, 4]],
          [[16, 6], [16, 11], [13, 11]],
          [[16, 8], [13, 8]],
          [[11, 8], [9, 8]],
          [[7, 8], [4, 8]],
          [[11, 11], [9, 11]],
        ],
      ),
  },
  {
    id: "fuse",
    name: "A fuse in the main line",
    note: "G08. Each lamp draws 1 A and the fuse is rated 2 A: two lamps are fine, close S3 for a third and the fuse blows. Tap a blown fuse to replace it.",
    make: () =>
      build(
        [
          { t: "cell", at: [7, 3], emf: 6, cells: 2, showValue: true },
          { t: "fuse", at: [12, 3], label: "F", rating: 2, showValue: true },
          { t: "lamp", at: [11, 6], label: "L1", R: 6 },
          { t: "lamp", at: [9, 9], label: "L2", R: 6 },
          { t: "switch", at: [14, 9], label: "S2", closed: true },
          { t: "lamp", at: [9, 12], label: "L3", R: 6, flip: true },
          { t: "switch", at: [14, 12], label: "S3", flip: true },
        ],
        [
          [[6, 3], [4, 3], [4, 12], [8, 12]],
          [[8, 3], [11, 3]],
          [[13, 3], [18, 3], [18, 12], [15, 12]],
          [[4, 6], [10, 6]],
          [[12, 6], [18, 6]],
          [[4, 9], [8, 9]],
          [[10, 9], [13, 9]],
          [[15, 9], [18, 9]],
          [[10, 12], [13, 12]],
        ],
      ),
  },
  {
    id: "meter-mistakes",
    name: "Meters connected the wrong way round",
    note: "Left: a voltmeter in series — no current flows, the lamp stays out and the voltmeter reads the emf. Right: an ammeter across a lamp shorts it out — the lamp goes out and only the resistor limits the current.",
    make: () =>
      build(
        [
          { t: "cell", at: [6, 4], emf: 6, cells: 2, showValue: true },
          { t: "lamp", at: [6, 10], label: "L1", R: 6, flip: true },
          { t: "voltmeter", at: [9, 7], v: true, label: "V" },
          { t: "cell", at: [16, 4], emf: 6, cells: 2, showValue: true },
          { t: "resistor", at: [19, 7], v: true, label: "R", R: 10, showValue: true },
          { t: "lamp", at: [16, 10], label: "L2", R: 6, flip: true },
          { t: "ammeter", at: [16, 12], label: "A" },
        ],
        [
          [[5, 4], [3, 4], [3, 10], [5, 10]],
          [[7, 4], [9, 4], [9, 6]],
          [[9, 8], [9, 10], [7, 10]],
          [[15, 4], [13, 4], [13, 10], [15, 10]],
          [[17, 4], [19, 4], [19, 6]],
          [[19, 8], [19, 10], [17, 10]],
          [[15, 10], [15, 12]],
          [[17, 10], [17, 12]],
        ],
        6,
      ),
  },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
