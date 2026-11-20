// The circuit as data: the parts, the wires, and the editing operations on
// them. Pure functions on plain objects, so the editor's rules (what fits where,
// what a wire joins) are tested in Node without a canvas.
//
// Everything sits on a square grid. A part is two grid steps long, centred on a
// grid point, with a terminal one step either side of the centre; a wire is a
// set of single grid steps ("edges"). Two things are joined when they meet at a
// grid point, so a T or a crossing joins (and gets a junction dot), and a
// part's centre point is never a connection: a wire can't touch it, which is
// what lets a part dropped on a straight wire cut itself into it.

/** The grid: points run 1 … COLS − 1 across and 1 … ROWS − 1 down. */
export const COLS = 24;
export const ROWS = 16;

export type PartType = "cell" | "resistor" | "lamp" | "rheostat" | "ammeter" | "voltmeter" | "switch" | "fuse" | "diode";

/** Direction from terminal a to terminal b: 0 right, 1 down, 2 left, 3 up. */
export type Rot = 0 | 1 | 2 | 3;

export interface Pt {
  x: number;
  y: number;
}

export interface Part {
  id: string;
  type: PartType;
  /** The grid point at the part's centre. */
  x: number;
  y: number;
  rot: Rot;
  /** "R1", "A2", "S"… Digits after a letter are drawn as a subscript. */
  label: string;
  /** Cell: emf in V. Terminal a is negative (the short, thick plate), b positive. */
  emf: number;
  /** Cell: internal resistance in Ω. */
  r: number;
  /** Cell: how many cells the symbol draws (a battery of 2 or 3 looks like one on paper). */
  cells: number;
  /** Resistor and lamp: resistance in Ω. Rheostat: its setting now. */
  R: number;
  /** Rheostat: its largest resistance in Ω. */
  Rmax: number;
  /** Switch: closed. */
  closed: boolean;
  /** Fuse: the current in A above which it blows. */
  rating: number;
  /** Fuse: blown (stays blown until it is replaced). */
  blown: boolean;
  /** Print the value (12 Ω, emf = 6 V…) beside the symbol. */
  showValue: boolean;
  /** Put the label on the other side, and the value and reading opposite it. */
  flip: boolean;
}

export interface Circuit {
  parts: Part[];
  /** Grid edges carrying wire, as edge keys (see edgeKey). */
  wires: string[];
  /** The power (W) at which a lamp glows at full brightness. */
  glowAt: number;
}

export const EMPTY: Circuit = { parts: [], wires: [], glowAt: 1 };

/** What the palette and the property panel call each part, and its label prefix. */
export const PART_INFO: Record<PartType, { name: string; prefix: string; hint: string }> = {
  cell: { name: "Cell / battery", prefix: "", hint: "emf and internal resistance; the long plate is +" },
  resistor: { name: "Resistor", prefix: "R", hint: "a fixed resistance" },
  lamp: { name: "Lamp", prefix: "L", hint: "ohmic: its resistance stays the same" },
  rheostat: { name: "Rheostat", prefix: "", hint: "a variable resistor" },
  ammeter: { name: "Ammeter", prefix: "A", hint: "ideal: no resistance" },
  voltmeter: { name: "Voltmeter", prefix: "V", hint: "ideal: infinite resistance" },
  switch: { name: "Switch", prefix: "S", hint: "tap it to open or close it" },
  fuse: { name: "Fuse", prefix: "F", hint: "blows above its rating" },
  diode: { name: "Diode", prefix: "D", hint: "ideal: conducts only along the arrow" },
};

export const PART_TYPES = Object.keys(PART_INFO) as PartType[];

const DIRS: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function dir(rot: Rot): [number, number] {
  return DIRS[rot];
}

export function isHorizontal(rot: Rot): boolean {
  return rot % 2 === 0;
}

export const ptKey = (x: number, y: number) => `${x},${y}`;

export function parsePt(key: string): Pt {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

/** The key of the unit edge between two neighbouring points, the same either way round. */
export function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `${Math.min(x1, x2)},${y1},h`;
  return `${x1},${Math.min(y1, y2)},v`;
}

/** An edge's two points: the first is the one with the smaller x (h) or y (v). */
export function edgeEnds(key: string): [Pt, Pt] {
  const [xs, ys, o] = key.split(",");
  const x = Number(xs);
  const y = Number(ys);
  return o === "h" ? [{ x, y }, { x: x + 1, y }] : [{ x, y }, { x, y: y + 1 }];
}

export function terminals(p: Pick<Part, "x" | "y" | "rot">): { a: Pt; b: Pt } {
  const [dx, dy] = dir(p.rot);
  return { a: { x: p.x - dx, y: p.y - dy }, b: { x: p.x + dx, y: p.y + dy } };
}

export function inGrid(pt: Pt): boolean {
  return pt.x >= 1 && pt.x <= COLS - 1 && pt.y >= 1 && pt.y <= ROWS - 1;
}

/** The value a new part starts with. */
export function defaultPart(type: PartType, id: string, x: number, y: number, rot: Rot, label: string): Part {
  return {
    id,
    type,
    x,
    y,
    rot,
    label,
    emf: 6,
    r: 0,
    cells: type === "cell" ? 2 : 1,
    R: type === "lamp" ? 4 : type === "rheostat" ? 10 : 10,
    Rmax: 20,
    closed: false,
    rating: 2,
    blown: false,
    showValue: type === "resistor" || type === "cell",
    flip: false,
  };
}

/** The next free label for a type: R1, R2… (empty for cells and rheostats, which papers rarely label). */
export function nextLabel(c: Circuit, type: PartType): string {
  const prefix = PART_INFO[type].prefix;
  if (!prefix) return "";
  const used = new Set(c.parts.filter((p) => p.type === type).map((p) => p.label));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

export function newId(c: Circuit): string {
  const used = new Set(c.parts.map((p) => p.id));
  for (let n = c.parts.length + 1; ; n++) if (!used.has(`p${n}`)) return `p${n}`;
}

/** Would this part sit inside the grid without overlapping another (ignoring the one with `ignoreId`)? */
export function fits(c: Circuit, part: Pick<Part, "x" | "y" | "rot">, ignoreId?: string): boolean {
  const t = terminals(part);
  if (!inGrid(t.a) || !inGrid(t.b)) return false;
  const centre = ptKey(part.x, part.y);
  const ends = [ptKey(t.a.x, t.a.y), ptKey(t.b.x, t.b.y)];
  for (const q of c.parts) {
    if (q.id === ignoreId) continue;
    const u = terminals(q);
    const qCentre = ptKey(q.x, q.y);
    // A centre is part of its part's body: nothing else may sit on it, and it may sit on nothing.
    if (centre === qCentre || centre === ptKey(u.a.x, u.a.y) || centre === ptKey(u.b.x, u.b.y)) return false;
    if (ends.includes(qCentre)) return false;
  }
  return true;
}

/** Every point some part uses as its centre. */
function centres(c: Circuit): Set<string> {
  return new Set(c.parts.map((p) => ptKey(p.x, p.y)));
}

function touches(key: string, points: Set<string>): boolean {
  const [p, q] = edgeEnds(key);
  return points.has(ptKey(p.x, p.y)) || points.has(ptKey(q.x, q.y));
}

/** Drop wire that runs into a part's centre (a part dropped on a wire cuts itself in). */
function clearUnderParts(c: Circuit): Circuit {
  const blocked = centres(c);
  const wires = c.wires.filter((w) => !touches(w, blocked));
  return wires.length === c.wires.length ? c : { ...c, wires };
}

export function addPart(c: Circuit, type: PartType, x: number, y: number, rot: Rot): { circuit: Circuit; id: string } | null {
  if (!fits(c, { x, y, rot })) return null;
  const id = newId(c);
  const part = defaultPart(type, id, x, y, rot, nextLabel(c, type));
  return { circuit: clearUnderParts({ ...c, parts: [...c.parts, part] }), id };
}

export function movePart(c: Circuit, id: string, x: number, y: number): Circuit | null {
  const part = c.parts.find((p) => p.id === id);
  if (!part) return null;
  if (part.x === x && part.y === y) return c;
  if (!fits(c, { x, y, rot: part.rot }, id)) return null;
  return clearUnderParts({ ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, x, y } : p)) });
}

/** A quarter-turn clockwise about the centre — the next one that fits. A half-turn swaps the terminals (a cell's polarity, a diode's direction). */
export function rotatePart(c: Circuit, id: string): Circuit | null {
  const part = c.parts.find((p) => p.id === id);
  if (!part) return null;
  for (let k = 1; k < 4; k++) {
    const rot = ((part.rot + k) % 4) as Rot;
    if (fits(c, { x: part.x, y: part.y, rot }, id)) {
      return clearUnderParts({ ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, rot } : p)) });
    }
  }
  return null;
}

export function removePart(c: Circuit, id: string): Circuit {
  return { ...c, parts: c.parts.filter((p) => p.id !== id) };
}

export function updatePart(c: Circuit, id: string, patch: Partial<Part>): Circuit {
  return { ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, ...patch, id: p.id, type: p.type } : p)) };
}

/**
 * Lay wire along a path of grid points, each the neighbour of the last. Steps
 * that would leave the grid or run into a part's centre are skipped.
 */
export function addWire(c: Circuit, path: Pt[]): Circuit {
  const blocked = centres(c);
  const wires = new Set(c.wires);
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1];
    const q = path[i];
    if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) !== 1 || !inGrid(p) || !inGrid(q)) continue;
    const key = edgeKey(p.x, p.y, q.x, q.y);
    if (!touches(key, blocked)) wires.add(key);
  }
  return wires.size === c.wires.length ? c : { ...c, wires: [...wires] };
}

export function removeWires(c: Circuit, keys: string[]): Circuit {
  const drop = new Set(keys);
  return { ...c, wires: c.wires.filter((w) => !drop.has(w)) };
}

/** How many wire edges and part terminals meet at each point. */
export function degrees(c: Circuit): Map<string, number> {
  const deg = new Map<string, number>();
  const bump = (p: Pt) => deg.set(ptKey(p.x, p.y), (deg.get(ptKey(p.x, p.y)) ?? 0) + 1);
  for (const w of c.wires) edgeEnds(w).forEach(bump);
  for (const p of c.parts) {
    const t = terminals(p);
    bump(t.a);
    bump(t.b);
  }
  return deg;
}

function terminalPoints(c: Circuit): Set<string> {
  const set = new Set<string>();
  for (const p of c.parts) {
    const t = terminals(p);
    set.add(ptKey(t.a.x, t.a.y));
    set.add(ptKey(t.b.x, t.b.y));
  }
  return set;
}

/**
 * The wire a tap means: the run of edges through `key` up to the next
 * junction, part terminal or loose end, round corners — one "wire" as it is
 * drawn on paper.
 */
export function wireRun(c: Circuit, key: string): string[] {
  if (!c.wires.includes(key)) return [];
  const wires = new Set(c.wires);
  const deg = degrees(c);
  const stops = terminalPoints(c);
  const run = new Set([key]);
  const queue = [...edgeEnds(key)];
  while (queue.length) {
    const p = queue.pop()!;
    const k = ptKey(p.x, p.y);
    if (stops.has(k) || deg.get(k) !== 2) continue;
    for (const [dx, dy] of DIRS) {
      const e = edgeKey(p.x, p.y, p.x + dx, p.y + dy);
      if (wires.has(e) && !run.has(e)) {
        run.add(e);
        queue.push(...edgeEnds(e).filter((q) => ptKey(q.x, q.y) !== k));
      }
    }
  }
  return [...run];
}

/** Wire ends and part terminals that connect to nothing — a circuit that can't be complete there. */
export function looseEnds(c: Circuit): Pt[] {
  const out: Pt[] = [];
  for (const [k, n] of degrees(c)) if (n === 1) out.push(parsePt(k));
  return out;
}

/** Points where three or more things meet: drawn with a junction dot. */
export function junctions(c: Circuit): Pt[] {
  const out: Pt[] = [];
  for (const [k, n] of degrees(c)) if (n >= 3) out.push(parsePt(k));
  return out;
}

/** The wire edge nearest a point in grid units, if within `reach`. */
export function wireAt(c: Circuit, gx: number, gy: number, reach: number): string | null {
  let best: string | null = null;
  let bestD = reach;
  for (const w of c.wires) {
    const [p, q] = edgeEnds(w);
    const d =
      p.y === q.y
        ? gx >= p.x && gx <= q.x
          ? Math.abs(gy - p.y)
          : Infinity
        : gy >= p.y && gy <= q.y
          ? Math.abs(gx - p.x)
          : Infinity;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** The part whose body is under a point in grid units (not its terminal ends). */
export function partAt(c: Circuit, gx: number, gy: number): Part | null {
  for (let i = c.parts.length - 1; i >= 0; i--) {
    const p = c.parts[i];
    const along = isHorizontal(p.rot) ? gx - p.x : gy - p.y;
    const across = isHorizontal(p.rot) ? gy - p.y : gx - p.x;
    if (Math.abs(along) <= 0.75 && Math.abs(across) <= 0.5) return p;
  }
  return null;
}

/** Points a wire can start from: part terminals and points on wire. */
export function connectionPoints(c: Circuit): Set<string> {
  return new Set(degrees(c).keys());
}

/**
 * The grid steps from one point to another, along the longer direction first
 * — how a dragged wire follows the pointer when it jumps more than one step.
 */
export function stepsBetween(from: Pt, to: Pt): Pt[] {
  const out: Pt[] = [];
  let { x, y } = from;
  const xFirst = Math.abs(to.x - x) >= Math.abs(to.y - y);
  const walkX = () => {
    while (x !== to.x) {
      x += Math.sign(to.x - x);
      out.push({ x, y });
    }
  };
  const walkY = () => {
    while (y !== to.y) {
      y += Math.sign(to.y - y);
      out.push({ x, y });
    }
  };
  if (xFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
  return out;
}

/** Digits after a letter are a subscript: "R12" → [["R", false], ["12", true]]. */
export function labelRuns(label: string): Array<[string, boolean]> {
  const runs: Array<[string, boolean]> = [];
  let i = 0;
  while (i < label.length) {
    const sub = /\d/.test(label[i]) && i > 0 && /[A-Za-zΑ-Ωα-ω]/.test(label[i - 1]);
    let j = i + 1;
    if (sub) while (j < label.length && /\d/.test(label[j])) j++;
    else while (j < label.length && !(/\d/.test(label[j]) && /[A-Za-zΑ-Ωα-ω]/.test(label[j - 1]))) j++;
    runs.push([label.slice(i, j), sub]);
    i = j;
  }
  return runs;
}

/** Shift the whole circuit by whole grid steps, if it still fits. */
export function shift(c: Circuit, dx: number, dy: number): Circuit | null {
  const parts = c.parts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  const wires = c.wires.map((w) => {
    const [p, q] = edgeEnds(w);
    return edgeKey(p.x + dx, p.y + dy, q.x + dx, q.y + dy);
  });
  const ok =
    parts.every((p) => {
      const t = terminals(p);
      return inGrid(t.a) && inGrid(t.b);
    }) && wires.every((w) => edgeEnds(w).every(inGrid));
  return ok ? { ...c, parts, wires } : null;
}

// ---------- files ----------

const FILE_KIND = "classkernel-circuit";

/** The circuit as a small JSON file a teacher can save and open again. */
export function toFile(c: Circuit): string {
  return JSON.stringify({ kind: FILE_KIND, version: 1, ...c }, null, 1);
}

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Read a circuit back from a file (or this computer's saved copy); null when it isn't one. */
export function fromFile(text: string | null): Circuit | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== FILE_KIND || !Array.isArray(d.parts) || !Array.isArray(d.wires)) return null;
  let c: Circuit = { parts: [], wires: [], glowAt: num(d.glowAt, 1, 1e-6, 1e6) };
  for (const raw of d.parts) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== "string" || !(r.type in PART_INFO)) continue;
    const type = r.type as PartType;
    const rot = Math.round(num(r.rot, 0, 0, 3)) as Rot;
    const x = Math.round(num(r.x, NaN));
    const y = Math.round(num(r.y, NaN));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !fits(c, { x, y, rot })) continue;
    const base = defaultPart(type, newId(c), x, y, rot, typeof r.label === "string" ? r.label.slice(0, 12) : "");
    c = {
      ...c,
      parts: [
        ...c.parts,
        {
          ...base,
          emf: num(r.emf, base.emf, 0, 1e4),
          r: num(r.r, base.r, 0, 1e6),
          cells: Math.round(num(r.cells, base.cells, 1, 4)),
          R: num(r.R, base.R, 0, 1e7),
          Rmax: num(r.Rmax, base.Rmax, 0, 1e7),
          closed: r.closed === true,
          rating: num(r.rating, base.rating, 1e-3, 1e4),
          blown: r.blown === true,
          showValue: typeof r.showValue === "boolean" ? r.showValue : base.showValue,
          flip: r.flip === true,
        },
      ],
    };
  }
  const wires = (d.wires as unknown[]).filter((w): w is string => typeof w === "string" && /^\d+,\d+,[hv]$/.test(w));
  c = { ...c, wires: [...new Set(wires)].filter((w) => edgeEnds(w).every(inGrid)) };
  return clearUnderParts(c);
}
