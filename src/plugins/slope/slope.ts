// A block on a slope: the forces on it, whether it moves, and how.
//
// The physics is the IEB's (SAG Section B): g = 9,8 m·s⁻²; weight resolved
// into Fg∥ = mg sin θ down the slope and Fg⊥ = mg cos θ into it; the normal
// force from perpendicular equilibrium; static friction up to μₛFN, holding the
// block whenever the other forces along the slope don't beat it, and kinetic
// friction μₖFN against the motion once it slides. A light inextensible string
// over a frictionless pulley at the top can tie the block to a hanging mass.
//
// Up the slope is positive throughout. Between changes in the friction (the
// block stopping, starting, the string being cut) the acceleration is
// constant, so the motion is stepped exactly, piece by piece, rather than
// approximated — a block pushed up the slope stops exactly where v² = u² + 2aΔx
// says it does.

export const G = 9.8;

export type Setup = "block" | "pulley";
export type ForceDir = "up" | "down";

export interface SlopeParams {
  setup: Setup;
  /** The block on the slope, kg. */
  mass: number;
  /** The hanging mass (pulley set-up), kg. */
  hangingMass: number;
  /** The slope's angle to the horizontal, degrees. */
  angle: number;
  frictionless: boolean;
  muS: number;
  muK: number;
  /** An applied force on the block (block set-up only), N. */
  force: number;
  /** Which way along the slope it pushes or pulls. */
  forceDir: ForceDir;
  /** Its angle to the slope, degrees: positive tilts it away from the surface (a pull), negative into it (a push). */
  forceAngle: number;
  /** The slope's length, m. */
  length: number;
  /** Where the block starts, m from the bottom. */
  start: number;
  /** Its velocity at the start, m·s⁻¹, up the slope positive. */
  v0: number;
}

export const DEFAULT_PARAMS: SlopeParams = {
  setup: "block",
  mass: 5,
  hangingMass: 3,
  angle: 30,
  frictionless: false,
  muS: 0.5,
  muK: 0.4,
  force: 0,
  forceDir: "up",
  forceAngle: 0,
  length: 4,
  start: 2,
  v0: 0,
};

/** The block's length along the slope, m, for keeping it on the slope. */
export const BLOCK_LENGTH = 0.5;

export interface Motion {
  /** Distance of the block's middle from the bottom of the slope, m. */
  x: number;
  /** Velocity, m·s⁻¹, up the slope positive. */
  v: number;
  t: number;
  /** The string has been cut (pulley set-up). */
  cut: boolean;
  /** The hanging mass: how far below the pulley it is, m, and how fast it is falling, m·s⁻¹. */
  hang: number;
  hangV: number;
  /** Why it stopped for good, if it has: reached the bottom, the top, the floor. */
  ended: string | null;
}

export type State = "rest" | "starting" | "up" | "down" | "lifted";

/** Every force on the block (and the hanging mass) at one instant, and what they add up to. */
export interface Forces {
  /** Fg = mg on the block. */
  weight: number;
  /** Fg∥ = mg sin θ, down the slope. */
  weightPar: number;
  /** Fg⊥ = mg cos θ, into the slope. */
  weightPerp: number;
  /** The applied force's components: along the slope (+ up) and away from the surface (+). */
  forcePar: number;
  forcePerp: number;
  normal: number;
  /** μₛFN: the most static friction can give. */
  staticMax: number;
  /** μₖFN. */
  kinetic: number;
  /** Friction on the block, + up the slope. */
  friction: number;
  /** Friction is static (the block is at rest and stays there). */
  isStatic: boolean;
  /** Tension in the string (0 without one). */
  tension: number;
  /** Fg on the hanging mass (0 without one). */
  hangingWeight: number;
  /** Everything along the slope except friction, + up — what friction has to hold. */
  drive: number;
  /** Net force on the block, + up the slope, and its acceleration. */
  net: number;
  a: number;
  state: State;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const EPS_V = 1e-9;

export function muS(p: SlopeParams): number {
  return p.frictionless ? 0 : p.muS;
}

export function muK(p: SlopeParams): number {
  return p.frictionless ? 0 : p.muK;
}

/** Is the string there and pulling? */
export function tied(p: SlopeParams, m: Pick<Motion, "cut">): boolean {
  return p.setup === "pulley" && !m.cut;
}

/** The forces at a given velocity: friction static or kinetic, and the acceleration that follows. */
export function forces(p: SlopeParams, m: Pick<Motion, "v" | "cut">): Forces {
  const theta = rad(p.angle);
  const weight = p.mass * G;
  const weightPar = weight * Math.sin(theta);
  const weightPerp = weight * Math.cos(theta);
  const applied = p.setup === "block" ? p.force : 0;
  const alpha = rad(p.forceAngle);
  const forcePar = applied * Math.cos(alpha) * (p.forceDir === "up" ? 1 : -1);
  const forcePerp = applied * Math.sin(alpha);
  const string = tied(p, m);
  const hangingWeight = p.setup === "pulley" ? p.hangingMass * G : 0;
  const total = p.mass + (string ? p.hangingMass : 0);
  const pull = string ? hangingWeight : 0;
  const drive = forcePar - weightPar + pull;

  const base = { weight, weightPar, weightPerp, forcePar, forcePerp, hangingWeight, drive };
  const rawNormal = weightPerp - forcePerp;
  if (rawNormal < -1e-9) {
    // The applied force lifts the block off the slope: no contact, no friction; not modelled further.
    return { ...base, normal: 0, staticMax: 0, kinetic: 0, friction: 0, isStatic: false, tension: 0, net: 0, a: 0, state: "lifted" };
  }
  const normal = Math.max(0, rawNormal);
  const staticMax = muS(p) * normal;
  const kinetic = muK(p) * normal;

  let friction: number;
  let isStatic = false;
  let state: State;
  if (Math.abs(m.v) < EPS_V) {
    if (Math.abs(drive) <= staticMax * (1 + 1e-12) + 1e-12) {
      friction = -drive;
      isStatic = true;
      state = "rest";
    } else {
      friction = -Math.sign(drive) * kinetic;
      state = "starting";
    }
  } else {
    friction = -Math.sign(m.v) * kinetic;
    state = m.v > 0 ? "up" : "down";
  }
  const a = isStatic ? 0 : (drive + friction) / total;
  const tension = string ? p.hangingMass * (G - a) : 0;
  const net = isStatic ? 0 : p.mass * a;
  return { ...base, normal, staticMax, kinetic, friction, isStatic, tension, net, a, state };
}

export function startMotion(p: SlopeParams): Motion {
  return { x: clampStart(p), v: p.v0, t: 0, cut: false, hang: hangStart(p), hangV: p.v0, ended: null };
}

export function clampStart(p: SlopeParams): number {
  return Math.min(p.length - BLOCK_LENGTH / 2, Math.max(BLOCK_LENGTH / 2, p.start));
}

// The slope stands on a bench with the pulley at its top; the hanging mass
// hangs over the bench's edge to a floor FLOOR m below the bench top. Its depth
// below the pulley runs from HANG_MIN (up against the pulley) to hangMax (on
// the floor), starting at hangStart.
export const FLOOR = 1;
export const HANG_MIN = 0.25;
/** The hanging mass's height, m (it is drawn as a cube). */
export const HANG_BOX = 0.3;

export function hangMax(p: SlopeParams): number {
  return p.length * Math.sin(rad(p.angle)) + FLOOR - HANG_BOX;
}

export function hangStart(p: SlopeParams): number {
  return Math.max(HANG_MIN, Math.min(1.2, (HANG_MIN + hangMax(p)) / 2));
}

/** Where the hanging mass is: tied, it follows the block; cut loose, it has its own fall. */
export function hangDepth(p: SlopeParams, m: Motion): number {
  return tied(p, m) ? hangStart(p) + (m.x - clampStart(p)) : m.hang;
}

/** Cut the string: from now on the block moves on its own and the hanging mass falls freely. */
export function cutString(p: SlopeParams, m: Motion): Motion {
  return { ...m, cut: true, ended: null, hang: hangDepth(p, m), hangV: m.v };
}

/**
 * Move the motion on by dt seconds, exactly: with constant acceleration up
 * to the moment the velocity reaches zero (where the friction changes), then
 * again from rest. Stops for good at either end of the slope.
 */
export function step(p: SlopeParams, m: Motion, dt: number): Motion {
  let out = { ...m };
  // A cut-loose hanging mass falls freely to the floor.
  const bottom = hangMax(p);
  if (p.setup === "pulley" && out.cut && out.hang < bottom) {
    const hang = out.hang + out.hangV * dt + 0.5 * G * dt * dt;
    out = hang >= bottom ? { ...out, hang: bottom, hangV: 0 } : { ...out, hang, hangV: out.hangV + G * dt };
  }
  const x0 = clampStart(p);
  let left = dt;
  for (let guard = 0; guard < 8 && left > 1e-12 && !out.ended; guard++) {
    const f = forces(p, out);
    if (f.state === "lifted" || f.state === "rest") {
      out.t += left;
      break;
    }
    const v = out.v;
    const a = f.a;
    // Does the velocity reach zero in this step? (Only if a opposes v.)
    let span = left;
    let stops = false;
    if (Math.abs(v) > EPS_V && v * a < 0) {
      const tStop = -v / a;
      if (tStop < left) {
        span = tStop;
        stops = true;
      }
    }
    let x = out.x + v * span + 0.5 * a * span * span;
    let nv = stops ? 0 : v + a * span;
    // The ends of the slope, and while the string holds, the pulley and the floor for the hanging mass.
    const string = tied(p, out);
    const slopeLo = BLOCK_LENGTH / 2;
    const slopeHi = p.length - BLOCK_LENGTH / 2;
    const lo = string ? Math.max(slopeLo, x0 - (hangStart(p) - HANG_MIN)) : slopeLo;
    const hi = string ? Math.min(slopeHi, x0 + (bottom - hangStart(p))) : slopeHi;
    let ended: string | null = null;
    if (x <= lo && nv <= 0) {
      span = timeTo(out.x, v, a, lo, span);
      x = lo;
      nv = 0;
      ended = lo > slopeLo ? "The hanging mass reached the pulley." : "The block reached the bottom of the slope.";
    } else if (x >= hi && nv >= 0) {
      span = timeTo(out.x, v, a, hi, span);
      x = hi;
      nv = 0;
      ended = hi < slopeHi ? "The hanging mass reached the floor." : p.setup === "pulley" ? "The block reached the pulley." : "The block reached the top of the slope.";
    }
    out = { ...out, x, v: nv, t: out.t + span, ended: ended ?? out.ended };
    if (string) out = { ...out, hang: hangStart(p) + (x - x0), hangV: nv };
    left -= span;
  }
  return out;
}

/** When, within `span`, the position x0 + vt + ½at² reaches `target` (the first time). */
function timeTo(x0: number, v: number, a: number, target: number, span: number): number {
  const d = target - x0;
  if (Math.abs(a) < 1e-12) return Math.abs(v) > 1e-12 ? Math.min(span, Math.max(0, d / v)) : span;
  const disc = v * v + 2 * a * d;
  if (disc < 0) return span;
  const roots = [(-v + Math.sqrt(disc)) / a, (-v - Math.sqrt(disc)) / a].filter((t) => t >= -1e-12).sort((x, y) => x - y);
  return roots.length ? Math.min(span, Math.max(0, roots[0])) : span;
}

/**
 * The angle at which a block at rest starts to slip, tilting the slope up
 * from `from` degrees — tan θ = μₛ when nothing else acts. Null when it never
 * does before 89,9°.
 */
export function slipAngle(p: SlopeParams, from = 0): number | null {
  const holds = (deg: number) => forces({ ...p, angle: deg }, { v: 0, cut: false }).state === "rest";
  let lo = Math.max(0, from);
  if (!holds(lo)) return lo;
  const stepDeg = 0.25;
  for (let hi = lo + stepDeg; hi <= 89.9 + 1e-9; hi += stepDeg) {
    if (!holds(hi)) {
      // Bisect between the last angle that held and the first that didn't.
      let a = hi - stepDeg;
      let b = hi;
      for (let i = 0; i < 50; i++) {
        const mid = (a + b) / 2;
        if (holds(mid)) a = mid;
        else b = mid;
      }
      return b;
    }
    lo = hi;
  }
  return null;
}

/** Distance and time for a block moving against its acceleration to come to rest (null if it isn't slowing). */
export function stopping(v: number, a: number): { distance: number; time: number } | null {
  if (Math.abs(v) < EPS_V || v * a >= 0) return null;
  return { distance: (v * v) / (2 * Math.abs(a)), time: Math.abs(v / a) };
}

/** A short description of what the block is doing. */
export function stateText(f: Forces, m: Motion, p: SlopeParams): string {
  if (f.state === "lifted") return "Lifted off the slope: the applied force pulls it away from the surface";
  if (m.ended) return m.ended.replace(/\.$/, "");
  switch (f.state) {
    case "rest":
      return Math.abs(f.drive) < 1e-9
        ? "At rest: the forces along the slope balance without friction"
        : Math.abs(Math.abs(f.drive) - f.staticMax) < 1e-6 * Math.max(1, f.staticMax)
          ? "At rest, on the point of sliding: static friction is at its maximum"
          : "At rest: static friction holds it";
    case "starting":
      return f.drive < 0 ? "Starting to slide down the slope" : p.setup === "pulley" ? "Starting to move up the slope" : "Starting to slide up the slope";
    case "up":
      return f.a < -1e-9 ? "Moving up the slope, slowing down" : f.a > 1e-9 ? "Moving up the slope, speeding up" : "Moving up the slope at constant velocity";
    case "down":
      return f.a > 1e-9 ? "Sliding down the slope, slowing down" : f.a < -1e-9 ? "Sliding down the slope, speeding up" : "Sliding down the slope at constant velocity";
  }
}
