// Two objects on a frictionless horizontal track: a collision (or an
// explosion that pushes them apart) in one dimension, as the SAG (Section C)
// has it — conservation of linear momentum, elastic and inelastic collisions,
// impulse and Newton's third law.
//
// Right is positive throughout this module; the view turns it round when the
// teacher chooses left as positive. A starts on the left, B on the right.
//
// The contact itself lasts Δt, with the force between them rising and falling
// as half a sine wave: F(τ) = F_max sin(πτ/Δt). Its area is the impulse,
// J = Δp, and its average Δp/Δt — the papers' F_net = Δp/Δt. The velocities
// change smoothly through the contact, keeping the total momentum constant at
// every instant.

export type Kind = "stick" | "elastic" | "given" | "explosion";

export interface CollParams {
  kind: Kind;
  /** kg */
  massA: number;
  massB: number;
  /** Velocities before, m·s⁻¹, right positive. In an explosion both start at uA. */
  uA: number;
  uB: number;
  /** A's velocity after, for "given" and "explosion", m·s⁻¹. */
  vAGiven: number;
  /** How long they are in contact, s. */
  contactTime: number;
}

export const DEFAULT_PARAMS: CollParams = { kind: "stick", massA: 2, massB: 3, uA: 4, uB: 1, vAGiven: -1, contactTime: 0.1 };

export interface Outcome {
  /** Do they meet at all? (A must be catching B.) */
  collides: boolean;
  vA: number;
  vB: number;
  /** False when the result can't happen: A would pass through B. */
  possible: boolean;
  /** Why not, or a warning (kinetic energy gained in a collision). */
  problem: string;
  pBefore: number;
  pAfter: number;
  ekBefore: number;
  ekAfter: number;
  /** Δp of each, kg·m·s⁻¹: equal and opposite. */
  dpA: number;
  dpB: number;
  /** The average force on each during the contact, N: F_net = Δp/Δt. */
  forceA: number;
  forceB: number;
  /** Elastic (Eₖ conserved, to 0,5 %), inelastic, or an explosion (Eₖ gained from stored energy). */
  verdict: "elastic" | "inelastic" | "explosion" | "none";
}

const ek = (m: number, v: number) => 0.5 * m * v * v;

/** Velocities before, as the kind of interaction has them (an explosion starts with both together). */
export function before(p: CollParams): { uA: number; uB: number } {
  return p.kind === "explosion" ? { uA: p.uA, uB: p.uA } : { uA: p.uA, uB: p.uB };
}

export function outcome(p: CollParams): Outcome {
  const { uA, uB } = before(p);
  const mA = p.massA;
  const mB = p.massB;
  const pBefore = mA * uA + mB * uB;
  const ekBefore = ek(mA, uA) + ek(mB, uB);
  const collides = p.kind === "explosion" || uA > uB + 1e-12;
  let vA = uA;
  let vB = uB;
  if (collides) {
    if (p.kind === "stick") vA = vB = pBefore / (mA + mB);
    else if (p.kind === "elastic") {
      vA = ((mA - mB) * uA + 2 * mB * uB) / (mA + mB);
      vB = ((mB - mA) * uB + 2 * mA * uA) / (mA + mB);
    } else {
      vA = p.vAGiven;
      vB = (pBefore - mA * vA) / mB;
    }
  }
  const ekAfter = ek(mA, vA) + ek(mB, vB);
  let possible = true;
  let problem = "";
  if (!collides) {
    problem = uA === uB ? "They move together at the same speed: A never reaches B." : "A is not catching B: they never collide.";
  } else if (vA > vB + 1e-9) {
    possible = false;
    problem =
      p.kind === "explosion"
        ? "Impossible: A would have to move right faster than B, through it. Pushed apart, A must end up moving left relative to B."
        : "Impossible: after the collision A would still be moving faster than B, passing through it.";
  } else if (p.kind !== "explosion" && ekAfter > ekBefore * (1 + 1e-6) + 1e-12) {
    problem = "Kinetic energy can't increase in a collision unless energy is released (an explosive or a spring): check A's velocity after.";
  }
  const dpA = mA * (vA - uA);
  const dpB = mB * (vB - uB);
  const dt = Math.max(1e-6, p.contactTime);
  let verdict: Outcome["verdict"] = "none";
  if (collides) {
    if (p.kind === "explosion" || ekAfter > ekBefore * 1.005) verdict = "explosion";
    else verdict = Math.abs(ekAfter - ekBefore) <= ekBefore * 0.005 ? "elastic" : "inelastic";
  }
  return { collides, vA, vB, possible, problem, pBefore, pAfter: mA * vA + mB * vB, ekBefore, ekAfter, dpA, dpB, forceA: dpA / dt, forceB: dpB / dt, verdict };
}

// ---------- the run ----------

/** Approach time before contact, s; the run carries on this long after it. */
export const APPROACH = 1.5;
export const AFTER = 2;

export interface Plan {
  /** Track length and an object's width (bumpers included), m — chosen so the motion fills the track. */
  track: number;
  width: number;
  /** When contact starts and how long it lasts, s. */
  tc: number;
  dt: number;
  xA0: number;
  xB0: number;
  /** When the run ends: AFTER seconds after the contact, or when one leaves the track. */
  tEnd: number;
  out: Outcome;
  uA: number;
  uB: number;
}

/** g(τ) = (1 − cos πτ/Δt)/2: how far through its change of velocity each object is, 0 to 1. */
function progress(tau: number, dt: number) {
  if (tau <= 0) return 0;
  if (tau >= dt) return 1;
  return (1 - Math.cos((Math.PI * tau) / dt)) / 2;
}

/** ∫g dτ from 0 to τ: the extra distance moved during the contact, per unit change of velocity. */
function progressArea(tau: number, dt: number) {
  if (tau <= 0) return 0;
  if (tau >= dt) return tau - dt / 2;
  return tau / 2 - (dt / (2 * Math.PI)) * Math.sin((Math.PI * tau) / dt);
}

export function plan(p: CollParams): Plan {
  const out = outcome(p);
  const { uA, uB } = before(p);
  const vmax = Math.max(0.2, Math.abs(uA), Math.abs(uB), ...(out.possible ? [Math.abs(out.vA), Math.abs(out.vB)] : []));
  const tc = p.kind === "explosion" ? 0.6 : APPROACH;
  // Contact at the middle of the track; the faster object's approach fills most of one half.
  const track = Math.max(2.4, (2 * vmax * APPROACH + 0.4) / 0.8);
  const width = track * 0.1;
  const mid = track / 2;
  const xA0 = mid - width / 2 - uA * tc;
  const xB0 = mid + width / 2 - uB * tc;
  const dt = Math.max(1e-4, p.contactTime);
  const base: Plan = { track, width, tc, dt, xA0, xB0, tEnd: tc + dt + AFTER, out, uA, uB };
  // End early if one leaves the track.
  let tEnd = base.tEnd;
  for (let t = 0; t <= base.tEnd; t += 0.01) {
    const s = stateAt(base, t);
    if (s.xA - width / 2 < -1e-9 || s.xB + width / 2 > track + 1e-9 || s.xA + width / 2 > track || s.xB - width / 2 < 0) {
      tEnd = Math.max(0.05, t);
      break;
    }
  }
  return { ...base, tEnd };
}

export interface RunState {
  t: number;
  xA: number;
  xB: number;
  vA: number;
  vB: number;
  /** The force on A and on B now, N. */
  fA: number;
  fB: number;
  phase: "before" | "contact" | "after";
}

/** Where everything is at time t. Without a collision (or an impossible one) they just carry on. */
export function stateAt(pl: Plan, t: number): RunState {
  const { out, uA, uB, tc, dt } = pl;
  const hit = out.collides && out.possible;
  if (!hit || t <= tc) {
    return { t, xA: pl.xA0 + uA * t, xB: pl.xB0 + uB * t, vA: uA, vB: uB, fA: 0, fB: 0, phase: hit ? "before" : "after" };
  }
  const tau = t - tc;
  const g = progress(tau, dt);
  const area = progressArea(tau, dt);
  const dvA = out.vA - uA;
  const dvB = out.vB - uB;
  const shape = tau < dt ? (Math.PI / (2 * dt)) * Math.sin((Math.PI * tau) / dt) : 0;
  return {
    t,
    xA: pl.xA0 + uA * tc + uA * tau + dvA * area,
    xB: pl.xB0 + uB * tc + uB * tau + dvB * area,
    vA: uA + dvA * g,
    vB: uB + dvB * g,
    fA: out.dpA * shape,
    fB: out.dpB * shape,
    phase: tau < dt ? "contact" : "after",
  };
}

/** The force on an object during the contact, N, τ seconds after it starts: F_max sin(πτ/Δt), F_max = (π/2)(Δp/Δt). */
export function forceAt(dp: number, dt: number, tau: number): number {
  if (tau <= 0 || tau >= dt) return 0;
  return (Math.PI / 2) * (dp / dt) * Math.sin((Math.PI * tau) / dt);
}

/** How much the bumpers are squeezed, m: positive while the objects overlap their contact point. */
export function squeeze(pl: Plan, s: RunState): number {
  return Math.max(0, s.xA + pl.width / 2 - (s.xB - pl.width / 2));
}

export interface Example {
  id: string;
  name: string;
  params: CollParams;
}

export const EXAMPLES: Example[] = [
  { id: "catch-stick", name: "A catches B; they stick together", params: { kind: "stick", massA: 2, massB: 3, uA: 4, uB: 1, vAGiven: 0, contactTime: 0.1 } },
  { id: "head-on-stick", name: "Head-on; they stick together", params: { kind: "stick", massA: 1.5, massB: 2, uA: 3, uB: -2, vAGiven: 0, contactTime: 0.1 } },
  { id: "elastic-equal", name: "Elastic, equal masses: they swap velocities", params: { kind: "elastic", massA: 1, massB: 1, uA: 2, uB: 0, vAGiven: 0, contactTime: 0.05 } },
  { id: "elastic-bounce", name: "Elastic: a light ball bounces off a heavy one", params: { kind: "elastic", massA: 0.5, massB: 2, uA: 4, uB: 0, vAGiven: 0, contactTime: 0.02 } },
  { id: "given-bounce", name: "A bounces back at 1 m·s⁻¹: find B's velocity", params: { kind: "given", massA: 0.4, massB: 1.2, uA: 5, uB: 0, vAGiven: -1, contactTime: 0.08 } },
  { id: "explosion", name: "A spring pushes two trolleys apart", params: { kind: "explosion", massA: 1, massB: 2, uA: 0, uB: 0, vAGiven: -2, contactTime: 0.2 } },
  { id: "car-truck", name: "A car runs into a truck; they lock together", params: { kind: "stick", massA: 1200, massB: 3000, uA: 15, uB: 5, vAGiven: 0, contactTime: 0.2 } },
];
