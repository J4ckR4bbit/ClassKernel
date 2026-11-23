// Reaction rates and collision theory, as the SAG (Section C of Paper 2) has
// them: a reaction happens only when particles collide effectively — with
// the correct orientation and with kinetic energy at least the activation
// energy — and the rate is the number of effective collisions per unit time.
//
// The model is a metal reacting with an acid (like magnesium in hydrochloric
// acid), seen as particles: the acid's particles move through the solution
// and hit the solid metal; an effective collision dissolves one metal atom,
// uses up one acid particle and gives a bubble of gas. Each collision stands
// for one metal atom reacting (in reality Mg + 2H⁺ → Mg²⁺ + H₂ takes two
// acid particles).
//
// Energies are in units of kT at 25 °C. The acid particles' kinetic energies
// follow the Maxwell–Boltzmann distribution (in three dimensions, as in the
// textbook graph), and collisions with the water around them keep it so —
// each particle's energy is drawn afresh now and then. The particles pass
// through one another: only their collisions with the metal matter here.
//
// The activation energy is scaled so the tail of the distribution is big
// enough to see on screen. Real activation energies are many times kT, so a
// real reaction is far more sensitive to temperature than this model is.

import { seededRandom } from "../shared/canvas";

export type Surface = "lump" | "pieces" | "powder";

export interface RateParams {
  /** °C */
  temperature: number;
  /** Acid concentration, mol·dm⁻³. */
  concentration: number;
  surface: Surface;
  catalyst: boolean;
}

export const DEFAULT_PARAMS: RateParams = { temperature: 25, concentration: 1, surface: "lump", catalyst: false };

/** Activation energy without and with the catalyst, in kT₂₅ units. */
export const EA = 3.5;
export const EA_CATALYSED = 2.2;

/** kT at this temperature, in units of kT at 25 °C. */
export function kT(celsius: number): number {
  return (celsius + 273) / 298;
}

export function activationEnergy(p: RateParams): number {
  return p.catalyst ? EA_CATALYSED : EA;
}

// ---------- the Maxwell–Boltzmann distribution ----------

/** erfc(x), x ≥ 0 (Abramowitz and Stegun 7.1.26, error below 1,5 × 10⁻⁷). */
export function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/** The fraction of particles with kinetic energy E, per unit energy: f(E) = 2√(E/π) (kT)^(−3/2) e^(−E/kT). */
export function mbDensity(E: number, t: number): number {
  if (E <= 0) return 0;
  return 2 * Math.sqrt(E / Math.PI) * Math.pow(t, -1.5) * Math.exp(-E / t);
}

/** The fraction of particles with kinetic energy at least E: the shaded area beyond Eₐ. */
export function fractionAbove(E: number, t: number): number {
  const x = E / t;
  return erfc(Math.sqrt(x)) + 2 * Math.sqrt(x / Math.PI) * Math.exp(-x);
}

/** A kinetic energy drawn from the distribution at kT = t: ½(vx² + vy² + vz²) with each v ~ N(0, t). */
export function sampleEnergy(rand: () => number, t: number): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    sum += z * z * t;
  }
  return sum / 2;
}

// ---------- the box ----------

export const BOX = { w: 640, h: 400 };
export const PARTICLE_R = 6;
export const ATOM_R = 9;
/** Screen speed (px·s⁻¹) for a particle of kinetic energy E: SPEED·√(2E). */
export const SPEED = 170;
/** How often a particle's energy is drawn afresh (collisions with the water), per second. */
const THERMAL_RATE = 2;
/** Acid particles per mol·dm⁻³. */
export const PER_MOLAR = 60;
/** A collision with the right energy reacts if the particle's reactive end faces the metal: within ±90°. */
const ORIENTATION_COS = 0;

export interface Particle {
  x: number;
  y: number;
  /** Direction of travel, unit vector. */
  dx: number;
  dy: number;
  ke: number;
  /** Which way its reactive end points, and how fast it turns. */
  angle: number;
  spin: number;
}

export interface Atom {
  x: number;
  y: number;
  alive: boolean;
}

export type HitKind = "effective" | "energy" | "orientation";

export interface Hit {
  x: number;
  y: number;
  kind: HitKind;
  /** Sim time it happened. */
  t: number;
}

export interface Bubble {
  x: number;
  y: number;
  t: number;
}

export interface Sim {
  params: RateParams;
  rand: () => number;
  t: number;
  particles: Particle[];
  atoms: Atom[];
  /** Spatial hash of the atoms: cell key → atom indices. */
  grid: Map<string, number[]>;
  /** The metal's bounding box, padded by a particle's reach: no need to test atoms outside it. */
  metalBox: { x0: number; y0: number; x1: number; y1: number };
  hits: Hit[];
  bubbles: Bubble[];
  /** Dissolved metal ions drifting off, for the picture. */
  ions: Bubble[];
  /** Totals: collisions with the metal, effective ones. */
  collisions: number;
  effective: number;
  /** (time, gas formed so far), every quarter second. */
  gas: Array<[number, number]>;
  startAcid: number;
  startMetal: number;
  done: boolean;
}

const CELL = 24;
const key = (cx: number, cy: number) => `${cx},${cy}`;

/** The metal's atoms: one lump, four pieces or a powder, the same number of atoms each way. */
export function metalAtoms(surface: Surface): Atom[] {
  const atoms: Atom[] = [];
  const d = ATOM_R * 2;
  const floor = BOX.h - ATOM_R;
  const block = (left: number, cols: number, rows: number) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) atoms.push({ x: left + ATOM_R + c * d, y: floor - r * d, alive: true });
  };
  if (surface === "lump") block((BOX.w - 12 * d) / 2, 12, 8);
  else if (surface === "pieces") {
    const w = 4 * d;
    const gap = (BOX.w - 6 * w) / 7;
    for (let i = 0; i < 6; i++) block(gap + i * (w + gap), 4, 4);
  } else {
    // A powder: 96 grains, each one atom, loosely spread over the bottom.
    const cols = 16;
    const step = 36;
    const left = (BOX.w - (cols - 1) * step) / 2;
    for (let r = 0; r < 6; r++) for (let c = 0; c < cols; c++) atoms.push({ x: left + c * step + (r % 2) * 10, y: floor - r * 30, alive: true });
  }
  return atoms;
}

/** Atoms the acid can reach: those with an open side (not buried in a lump). */
export function exposedAtoms(atoms: Atom[]): number {
  const alive = atoms.filter((a) => a.alive);
  const at = new Set(alive.map((a) => `${Math.round(a.x)},${Math.round(a.y)}`));
  const d = ATOM_R * 2;
  return alive.filter((a) => {
    const n = [
      [a.x - d, a.y],
      [a.x + d, a.y],
      [a.x, a.y - d],
    ];
    return n.some(([x, y]) => !at.has(`${Math.round(x)},${Math.round(y)}`));
  }).length;
}

function speedOf(p: Particle) {
  return SPEED * Math.sqrt(2 * Math.max(0, p.ke));
}

function rebuildGrid(sim: Sim) {
  sim.grid.clear();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  sim.atoms.forEach((a, i) => {
    if (!a.alive) return;
    const k = key(Math.floor(a.x / CELL), Math.floor(a.y / CELL));
    const list = sim.grid.get(k);
    if (list) list.push(i);
    else sim.grid.set(k, [i]);
    x0 = Math.min(x0, a.x);
    y0 = Math.min(y0, a.y);
    x1 = Math.max(x1, a.x);
    y1 = Math.max(y1, a.y);
  });
  const reach = ATOM_R + PARTICLE_R;
  sim.metalBox = { x0: x0 - reach, y0: y0 - reach, x1: x1 + reach, y1: y1 + reach };
}

export function createSim(params: RateParams, seed = 1): Sim {
  const rand = seededRandom(seed);
  const atoms = metalAtoms(params.surface);
  const sim: Sim = {
    params: { ...params },
    rand,
    t: 0,
    particles: [],
    atoms,
    grid: new Map(),
    metalBox: { x0: 0, y0: 0, x1: 0, y1: 0 },
    hits: [],
    bubbles: [],
    ions: [],
    collisions: 0,
    effective: 0,
    gas: [[0, 0]],
    startAcid: 0,
    startMetal: atoms.length,
    done: false,
  };
  rebuildGrid(sim);
  const n = Math.round(params.concentration * PER_MOLAR);
  const t = kT(params.temperature);
  // Particles start anywhere clear of the metal.
  while (sim.particles.length < n) {
    const x = PARTICLE_R + rand() * (BOX.w - 2 * PARTICLE_R);
    const y = PARTICLE_R + rand() * (BOX.h - 2 * PARTICLE_R);
    if (x > sim.metalBox.x0 && x < sim.metalBox.x1 && y > sim.metalBox.y0) continue;
    const a = rand() * Math.PI * 2;
    sim.particles.push({ x, y, dx: Math.cos(a), dy: Math.sin(a), ke: sampleEnergy(rand, t), angle: rand() * Math.PI * 2, spin: (rand() - 0.5) * 8 });
  }
  sim.startAcid = n;
  return sim;
}

/** Warm or cool the solution: every particle's kinetic energy scales with T. */
export function setTemperature(sim: Sim, celsius: number) {
  const ratio = kT(celsius) / kT(sim.params.temperature);
  for (const p of sim.particles) p.ke *= ratio;
  sim.params = { ...sim.params, temperature: celsius };
}

export function setCatalyst(sim: Sim, on: boolean) {
  sim.params = { ...sim.params, catalyst: on };
}

/** Atoms left. */
export function metalLeft(sim: Sim): number {
  return sim.atoms.filter((a) => a.alive).length;
}

/** Move the box on by dt seconds, in small steps. */
export function stepSim(sim: Sim, dt: number) {
  const h = 1 / 120;
  let left = dt;
  while (left > 1e-9 && !sim.done) {
    const step = Math.min(h, left);
    left -= step;
    substep(sim, step);
  }
  // Forget what has faded from the picture.
  sim.hits = sim.hits.filter((x) => sim.t - x.t < 0.5);
  sim.bubbles = sim.bubbles.filter((b) => b.y > -10 && sim.t - b.t < 4);
  sim.ions = sim.ions.filter((b) => sim.t - b.t < 1.6);
}

function substep(sim: Sim, h: number) {
  const { rand } = sim;
  const t = kT(sim.params.temperature);
  const ea = activationEnergy(sim.params);
  const reach = ATOM_R + PARTICLE_R;
  const mb = sim.metalBox;
  const keep: Particle[] = [];
  let changed = false;
  for (const p of sim.particles) {
    if (rand() < THERMAL_RATE * h) p.ke = sampleEnergy(rand, t);
    const v = speedOf(p);
    p.x += p.dx * v * h;
    p.y += p.dy * v * h;
    p.angle += p.spin * h;
    // The walls.
    if (p.x < PARTICLE_R) {
      p.x = PARTICLE_R;
      p.dx = Math.abs(p.dx);
    } else if (p.x > BOX.w - PARTICLE_R) {
      p.x = BOX.w - PARTICLE_R;
      p.dx = -Math.abs(p.dx);
    }
    if (p.y < PARTICLE_R) {
      p.y = PARTICLE_R;
      p.dy = Math.abs(p.dy);
    } else if (p.y > BOX.h - PARTICLE_R) {
      p.y = BOX.h - PARTICLE_R;
      p.dy = -Math.abs(p.dy);
    }
    // The metal.
    let used = false;
    if (p.x > mb.x0 && p.x < mb.x1 && p.y > mb.y0 && p.y < mb.y1) {
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      search: for (let i = cx - 1; i <= cx + 1; i++) {
        for (let j = cy - 1; j <= cy + 1; j++) {
          for (const idx of sim.grid.get(key(i, j)) ?? []) {
            const a = sim.atoms[idx];
            if (!a.alive) continue;
            const ddx = p.x - a.x;
            const ddy = p.y - a.y;
            const dist = Math.hypot(ddx, ddy);
            if (dist >= reach || dist === 0) continue;
            const nx = ddx / dist;
            const ny = ddy / dist;
            // Only count it moving in: a particle already leaving isn't colliding.
            if (p.dx * nx + p.dy * ny >= 0) continue;
            sim.collisions++;
            const facing = -(Math.cos(p.angle) * nx + Math.sin(p.angle) * ny) > ORIENTATION_COS;
            const enough = p.ke >= ea;
            if (enough && facing) {
              sim.effective++;
              a.alive = false;
              used = true;
              changed = true;
              sim.hits.push({ x: a.x + nx * ATOM_R, y: a.y + ny * ATOM_R, kind: "effective", t: sim.t });
              sim.bubbles.push({ x: a.x, y: a.y - ATOM_R, t: sim.t });
              sim.ions.push({ x: a.x, y: a.y, t: sim.t });
            } else {
              sim.hits.push({ x: a.x + nx * ATOM_R, y: a.y + ny * ATOM_R, kind: enough ? "orientation" : "energy", t: sim.t });
              // Bounce: reflect off the atom and step clear of it.
              const dot = p.dx * nx + p.dy * ny;
              p.dx -= 2 * dot * nx;
              p.dy -= 2 * dot * ny;
              p.x = a.x + nx * reach;
              p.y = a.y + ny * reach;
            }
            break search;
          }
        }
      }
    }
    if (!used) keep.push(p);
  }
  sim.particles = keep;
  if (changed) rebuildGrid(sim);
  for (const b of sim.bubbles) b.y -= 120 * h;
  for (const b of sim.ions) b.y -= 25 * h;
  const before = Math.floor(sim.t * 4);
  sim.t += h;
  if (Math.floor(sim.t * 4) > before) sim.gas.push([sim.t, sim.effective]);
  if (!sim.particles.length || !metalLeft(sim)) {
    sim.done = true;
    sim.gas.push([sim.t, sim.effective]);
  }
}

/** Effective collisions a second over the last `span` seconds of the run. */
export function recentRate(sim: Sim, span = 5): number {
  const g = sim.gas;
  if (g.length < 2) return 0;
  const [tNow, nNow] = g[g.length - 1];
  const from = Math.max(0, tNow - span);
  let k = g.length - 1;
  while (k > 0 && g[k - 1][0] >= from) k--;
  const [t0, n0] = g[k];
  return tNow > t0 ? (nNow - n0) / (tNow - t0) : 0;
}

/** Which reactant runs out first, and so how much gas there will be in the end. */
export function limiting(p: RateParams): { reagent: "acid" | "metal"; finalGas: number } {
  const acid = Math.round(p.concentration * PER_MOLAR);
  const metal = metalAtoms(p.surface).length;
  return acid <= metal ? { reagent: "acid", finalGas: acid } : { reagent: "metal", finalGas: metal };
}
