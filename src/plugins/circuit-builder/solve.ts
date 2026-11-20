// Working out what every meter reads.
//
// The circuit is solved the way a simulator does it — nodal analysis — with
// the exam's ideal components:
//
// - Wires, ammeters, closed switches, intact fuses and conducting diodes have
//   no resistance, so the points they join are one electrical node. They are
//   merged first (union–find), which is what makes a wire across a lamp short
//   it out and an ammeter across a lamp take all the current.
// - Resistors, lamps (ohmic, as the IEB assumes) and rheostats are
//   conductances between nodes; a cell is its emf in series with its internal
//   resistance (a Norton source), or, with none, an exact voltage source. One
//   with no internal resistance and only wire across it is given a micro-ohm,
//   so the short circuit comes out as an enormous current instead of a matrix
//   that can't be solved — and is reported as one.
// - Voltmeters, open switches, blown fuses and blocking diodes carry nothing.
//
// The node voltages come from Gaussian elimination, one reference node per
// separate piece of circuit. The currents in the zero-resistance links (each
// wire step, each ammeter) then come from a second, smaller problem inside
// each merged node: the current that has to cross it, shared out over its
// links. A zero-resistance part with a bare wire across it carries nothing —
// the wire takes the current, the exam's "shorted out".
//
// Diodes are ideal: each is guessed on, the circuit solved, and any diode
// carrying current backwards (or blocking a forward voltage) is flipped until
// the guesses agree. Fuses blow one at a time, worst overload first, until
// none is over its rating.

import { Circuit, Part, edgeEnds, ptKey, terminals } from "./circuit";

/** What a cell with no internal resistance is given, so a short circuit stays solvable. */
export const IDEAL_R = 1e-6;
/** Above this a current is a short circuit, not a reading (only an ideal cell gets there). */
export const SHORT_CURRENT = 1e5;
const EPS = 1e-9;

export interface PartReading {
  /** Current through the part from terminal a to terminal b, in A (for a cell: from − to + inside it). */
  I: number;
  /** V(a) − V(b): the potential difference across the part, in V. */
  V: number;
  /** Power converted in the part, in W: I²R for a resistor or lamp; for a cell, what it delivers to the rest of the circuit. */
  P: number;
  /** Lamp: brightness as a fraction of full glow (P / glowAt), uncapped. */
  glow: number;
  /** Diode: conducting. */
  on: boolean;
  /** Voltmeter (or anything carrying no current): its two ends are in parts of the circuit with no connection at all. */
  floating: boolean;
}

export interface Solution {
  parts: Record<string, PartReading>;
  /** Current along each wire edge, positive in the direction of increasing x (h) or y (v). */
  wires: Record<string, number>;
  /** Fuses that blow in this circuit as it stands (on top of any already blown). */
  blown: string[];
  /** Cells with nothing but wire (or other zero-resistance parts) across them. */
  shorted: string[];
  /** False when the diodes never settled (it shouldn't happen; the last guess is shown). */
  settled: boolean;
}

/** Union–find over point indices. */
class Sets {
  parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/**
 * Solve A·x = b in place by Gaussian elimination with partial pivoting.
 * A is small (one row per node), so nothing cleverer is needed. A zero pivot
 * leaves that unknown at 0 rather than failing.
 */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    if (Math.abs(A[pivot][col]) < 1e-300) continue;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < n; row++) {
      const f = A[row][col] / A[col][col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    if (Math.abs(A[row][row]) < 1e-300) continue;
    let s = b[row];
    for (let k = row + 1; k < n; k++) s -= A[row][k] * x[k];
    x[row] = s / A[row][row];
  }
  return x;
}

/**
 * Currents along the edges of a graph of equal, zero-ish resistances that
 * carry away what each vertex pushes out into the rest of the circuit
 * (outflow): the edges' share of a merged node's current. Solved as potentials
 * on the graph's Laplacian, one connected piece at a time; on a tree (the
 * usual case) the answer is forced and exact. Flow is from an edge's first
 * vertex to its second.
 */
function shareFlows(vertexCount: number, edges: Array<[number, number]>, outflow: (v: number) => number): number[] {
  const flows = new Array<number>(edges.length).fill(0);
  if (!edges.length) return flows;
  const pieces = new Sets();
  for (let v = 0; v < vertexCount; v++) pieces.add();
  for (const [a, b] of edges) pieces.union(a, b);
  const members = new Map<number, number[]>();
  for (const [a, b] of edges)
    for (const v of [a, b]) {
      const root = pieces.find(v);
      if (!members.has(root)) members.set(root, []);
      if (!members.get(root)!.includes(v)) members.get(root)!.push(v);
    }
  const potential = new Array<number>(vertexCount).fill(0);
  for (const vertices of members.values()) {
    const local = new Map(vertices.map((v, i) => [v, i - 1])); // the first is the reference
    const m = vertices.length - 1;
    const L = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const rhs = vertices.slice(1).map((v) => -outflow(v));
    for (const [a, b] of edges) {
      const ia = local.get(a);
      const ib = local.get(b);
      if (ia === undefined || ib === undefined) continue;
      if (ia >= 0) L[ia][ia] += 1;
      if (ib >= 0) L[ib][ib] += 1;
      if (ia >= 0 && ib >= 0) {
        L[ia][ib] -= 1;
        L[ib][ia] -= 1;
      }
    }
    const phi = solveLinear(L, rhs);
    vertices.forEach((v, i) => (potential[v] = i > 0 ? phi[i - 1] : 0));
  }
  edges.forEach(([a, b], k) => (flows[k] = potential[a] - potential[b]));
  return flows;
}

type Role = "link" | "conductor" | "cell" | "open";

/** How a part behaves electrically, given which fuses are blown and which diodes conduct. */
function roleOf(p: Part, blown: Set<string>, diodeOn: Map<string, boolean>): Role {
  switch (p.type) {
    case "cell":
      return "cell";
    case "resistor":
    case "lamp":
      return p.R > EPS ? "conductor" : "link";
    case "rheostat":
      return Math.min(p.R, p.Rmax) > EPS ? "conductor" : "link";
    case "ammeter":
      return "link";
    case "voltmeter":
      return "open";
    case "switch":
      return p.closed ? "link" : "open";
    case "fuse":
      return blown.has(p.id) ? "open" : "link";
    case "diode":
      return diodeOn.get(p.id) ? "link" : "open";
  }
}

const resistanceOf = (p: Part) => (p.type === "rheostat" ? Math.min(p.R, p.Rmax) : p.R);

interface Static {
  readings: Record<string, PartReading>;
  wires: Record<string, number>;
  /** V(a) − V(b) for each part, whether or not it conducts. */
  across: Record<string, number>;
}

/** One solve with the diodes and fuses fixed. */
function solveFixed(c: Circuit, blown: Set<string>, diodeOn: Map<string, boolean>): Static {
  // Points, and the zero-resistance links that merge them into nodes.
  const index = new Map<string, number>();
  const sets = new Sets();
  const at = (x: number, y: number) => {
    const k = ptKey(x, y);
    let i = index.get(k);
    if (i === undefined) {
      i = sets.add();
      index.set(k, i);
    }
    return i;
  };
  const ends = c.parts.map((p) => {
    const t = terminals(p);
    return { a: at(t.a.x, t.a.y), b: at(t.b.x, t.b.y) };
  });
  const wireEnds = c.wires.map((w) => {
    const [p, q] = edgeEnds(w);
    return { a: at(p.x, p.y), b: at(q.x, q.y) };
  });
  const roles = c.parts.map((p) => roleOf(p, blown, diodeOn));
  for (const w of wireEnds) sets.union(w.a, w.b);
  c.parts.forEach((_, i) => roles[i] === "link" && sets.union(ends[i].a, ends[i].b));

  // Nodes, and the separate pieces of circuit (joined by anything that conducts).
  const nodeOf: number[] = [];
  const nodeIds = new Map<number, number>();
  for (let i = 0; i < sets.parent.length; i++) {
    const root = sets.find(i);
    if (!nodeIds.has(root)) nodeIds.set(root, nodeIds.size);
    nodeOf[i] = nodeIds.get(root)!;
  }
  const nodeCount = nodeIds.size;
  const pieces = new Sets();
  for (let i = 0; i < nodeCount; i++) pieces.add();
  c.parts.forEach((_, i) => {
    if (roles[i] === "conductor" || roles[i] === "cell") pieces.union(nodeOf[ends[i].a], nodeOf[ends[i].b]);
  });
  // One reference node (0 V) per piece; the rest are unknowns.
  const unknown = new Array<number>(nodeCount).fill(-1);
  let count = 0;
  const seenPiece = new Set<number>();
  for (let n = 0; n < nodeCount; n++) {
    const piece = pieces.find(n);
    if (seenPiece.has(piece)) unknown[n] = count++;
    else seenPiece.add(piece);
  }

  // A cell with no internal resistance is an exact voltage source (an extra
  // row: V+ − V− = emf, and its current as an extra unknown) — unless wire
  // joins its terminals, or it closes a loop of such cells (two in parallel):
  // the matrix would then have no solution, so every cell in that group gets
  // IDEAL_R instead, and shares the current as real cells would.
  const idealGroups = new Sets();
  for (let i = 0; i < nodeCount; i++) idealGroups.add();
  const idealCells = c.parts.flatMap((p, i) => (roles[i] === "cell" && p.r <= EPS ? [i] : []));
  for (const i of idealCells) idealGroups.union(nodeOf[ends[i].a], nodeOf[ends[i].b]);
  const groupNodes = new Map<number, number>();
  const groupCells = new Map<number, number>();
  for (let n = 0; n < nodeCount; n++) {
    const g = idealGroups.find(n);
    groupNodes.set(g, (groupNodes.get(g) ?? 0) + 1);
  }
  for (const i of idealCells) {
    const g = idealGroups.find(nodeOf[ends[i].a]);
    groupCells.set(g, (groupCells.get(g) ?? 0) + 1);
  }
  const sourceRow = new Map<number, number>(); // part index → its current's unknown
  for (const i of idealCells) {
    const g = idealGroups.find(nodeOf[ends[i].a]);
    if (groupCells.get(g)! <= groupNodes.get(g)! - 1) sourceRow.set(i, count + sourceRow.size);
  }
  const size = count + sourceRow.size;

  // Stamp the conductances, the cells' source currents and the exact sources.
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  const stampG = (a: number, b: number, g: number) => {
    const ia = unknown[a];
    const ib = unknown[b];
    if (ia >= 0) A[ia][ia] += g;
    if (ib >= 0) A[ib][ib] += g;
    if (ia >= 0 && ib >= 0) {
      A[ia][ib] -= g;
      A[ib][ia] -= g;
    }
  };
  const inject = (n: number, current: number) => {
    if (unknown[n] >= 0) rhs[unknown[n]] += current;
  };
  c.parts.forEach((p, i) => {
    const a = nodeOf[ends[i].a];
    const b = nodeOf[ends[i].b];
    if (roles[i] === "conductor") stampG(a, b, 1 / resistanceOf(p));
    else if (sourceRow.has(i)) {
      // Its current I (a → b inside the cell) leaves node a and arrives at node b; V(b) − V(a) = emf.
      const k = sourceRow.get(i)!;
      if (unknown[a] >= 0) {
        A[unknown[a]][k] += 1;
        A[k][unknown[a]] -= 1;
      }
      if (unknown[b] >= 0) {
        A[unknown[b]][k] -= 1;
        A[k][unknown[b]] += 1;
      }
      rhs[k] = p.emf;
    } else if (roles[i] === "cell") {
      const r = Math.max(p.r, IDEAL_R);
      stampG(a, b, 1 / r);
      // The emf drives p.emf / r from the − terminal (a) round to the + terminal (b).
      inject(b, p.emf / r);
      inject(a, -p.emf / r);
    }
  });
  const solved = solveLinear(A, rhs);
  const V = unknown.map((u) => (u >= 0 ? solved[u] : 0));

  // Each part's current, and what it pushes out of each point into the non-link parts.
  const readings: Record<string, PartReading> = {};
  const across: Record<string, number> = {};
  const outflow = new Array<number>(sets.parent.length).fill(0);
  c.parts.forEach((p, i) => {
    const a = nodeOf[ends[i].a];
    const b = nodeOf[ends[i].b];
    const floating = pieces.find(a) !== pieces.find(b);
    const v = floating ? 0 : V[a] - V[b];
    across[p.id] = v;
    let I = 0;
    let P = 0;
    if (roles[i] === "conductor") {
      I = v / resistanceOf(p);
      P = (v * v) / resistanceOf(p);
    } else if (roles[i] === "cell") {
      // v = V(a) − V(b) = −(terminal voltage)
      I = sourceRow.has(i) ? solved[sourceRow.get(i)!] : (p.emf + v) / Math.max(p.r, IDEAL_R);
      P = -v * I; // terminal voltage × current: what it delivers to the rest
    }
    if (roles[i] !== "link") {
      outflow[ends[i].a] += I;
      outflow[ends[i].b] -= I;
    }
    readings[p.id] = { I, V: v, P, glow: 0, on: p.type === "diode" ? !!diodeOn.get(p.id) : false, floating };
  });

  // Inside each node, in two steps so the arithmetic stays exact. First the
  // zero-resistance parts between the islands of plain wire: one with both
  // ends on the same island is shorted out by that wire and carries nothing.
  const islands = new Sets();
  for (let i = 0; i < sets.parent.length; i++) islands.add();
  for (const w of wireEnds) islands.union(w.a, w.b);
  const islandIds = new Map<number, number>();
  const islandOf = sets.parent.map((_, i) => {
    const root = islands.find(i);
    if (!islandIds.has(root)) islandIds.set(root, islandIds.size);
    return islandIds.get(root)!;
  });
  const islandOut = new Array<number>(islandIds.size).fill(0);
  outflow.forEach((f, pt) => (islandOut[islandOf[pt]] += f));
  const linkParts = c.parts.flatMap((p, i) =>
    roles[i] === "link" && islandOf[ends[i].a] !== islandOf[ends[i].b] ? [{ id: p.id, a: ends[i].a, b: ends[i].b }] : [],
  );
  c.parts.forEach((p, i) => roles[i] === "link" && (readings[p.id].I = 0));
  const linkFlows = shareFlows(
    islandIds.size,
    linkParts.map((l) => [islandOf[l.a], islandOf[l.b]]),
    (v) => islandOut[v],
  );
  // Then the wire steps within each island, carrying what the parts and those links push in and out.
  const pointOut = [...outflow];
  linkParts.forEach((l, k) => {
    readings[l.id].I = linkFlows[k];
    pointOut[l.a] += linkFlows[k];
    pointOut[l.b] -= linkFlows[k];
  });
  const wireFlows = shareFlows(
    sets.parent.length,
    wireEnds.map((w) => [w.a, w.b]),
    (v) => pointOut[v],
  );
  const wires: Record<string, number> = {};
  c.wires.forEach((w, i) => (wires[w] = wireFlows[i]));
  return { readings, wires, across };
}

/** Clean rounding noise to exact zeros, so an idle meter reads 0,00 and not −0,00. */
function tidy(n: number, scale: number): number {
  return Math.abs(n) < 1e-9 * Math.max(1, scale) ? 0 : n;
}

/** Solve the circuit as it stands: every part's current, voltage and power, and every wire's current. */
export function solve(c: Circuit): Solution {
  const blown = new Set(c.parts.filter((p) => p.type === "fuse" && p.blown).map((p) => p.id));
  const newlyBlown: string[] = [];
  const diodes = c.parts.filter((p) => p.type === "diode");
  let result: Static | null = null;
  let settled = true;

  for (let round = 0; round <= c.parts.length; round++) {
    // Diodes: start each guessed on and flip the worst disagreement until none is left.
    const diodeOn = new Map(diodes.map((d) => [d.id, true]));
    settled = false;
    for (let tries = 0; tries < 4 * diodes.length + 8; tries++) {
      result = solveFixed(c, blown, diodeOn);
      let worst: string | null = null;
      let worstBy = EPS;
      for (const d of diodes) {
        const by = diodeOn.get(d.id) ? -result.readings[d.id].I : result.across[d.id];
        if (by > worstBy) {
          worstBy = by;
          worst = d.id;
        }
      }
      if (!worst) {
        settled = true;
        break;
      }
      diodeOn.set(worst, !diodeOn.get(worst));
    }
    // Fuses: blow the most overloaded, then look again.
    let worstFuse: string | null = null;
    let worstRatio = 1 + 1e-9;
    for (const f of c.parts) {
      if (f.type !== "fuse" || blown.has(f.id)) continue;
      const ratio = Math.abs(result!.readings[f.id].I) / Math.max(f.rating, 1e-9);
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstFuse = f.id;
      }
    }
    if (!worstFuse) break;
    blown.add(worstFuse);
    newlyBlown.push(worstFuse);
  }

  const readings: Record<string, PartReading> = result?.readings ?? {};
  const wires: Record<string, number> = result?.wires ?? {};
  const scale = Math.max(1, ...c.parts.map((p) => (p.type === "cell" ? p.emf : 0)));
  const shorted: string[] = [];
  for (const p of c.parts) {
    const r = readings[p.id];
    if (!r) continue;
    r.I = tidy(r.I, 1);
    r.V = tidy(r.V, scale);
    r.P = tidy(r.P, 1);
    if (p.type === "lamp") r.glow = c.glowAt > 0 ? r.P / c.glowAt : 0;
    // A cell is short-circuited when nothing but zero-resistance links joins its terminals.
    // Or when it drives a current only a short could (two cells with no internal resistance fighting in parallel).
    if (p.type === "cell" && p.emf > 0 && Math.abs(r.I) > 0 && (Math.abs(r.V) < 1e-6 * p.emf || Math.abs(r.I) >= SHORT_CURRENT)) shorted.push(p.id);
  }
  for (const k of Object.keys(wires)) wires[k] = tidy(wires[k], 1);
  return { parts: readings, wires, blown: newlyBlown, shorted, settled };
}

/** What a meter shows: the size of its current or voltage (digital meters in an exam read positive). */
export function meterValue(p: Part, r: PartReading | undefined): number {
  if (!r) return 0;
  return p.type === "ammeter" ? Math.abs(r.I) : Math.abs(r.V);
}

/** The cell's own figures for the memo: terminal voltage, lost volts and the external resistance it sees. */
export function cellFigures(p: Part, r: PartReading) {
  const terminal = -r.V;
  const lost = p.emf - terminal;
  return {
    current: r.I,
    terminal,
    lost,
    external: Math.abs(r.I) > EPS ? terminal / r.I : Infinity,
    total: p.emf * r.I,
  };
}
