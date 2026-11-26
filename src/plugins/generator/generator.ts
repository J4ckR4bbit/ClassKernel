// A generator's coil turning in a magnetic field: the flux through it, how
// fast that flux changes, and the emf it induces.
//
// The physics is the SAG's (Section F): Φ = BA cos θ, with θ the angle
// between B and the normal to the coil; Faraday's law, emf = −N ΔΦ/Δt; slip
// rings for an AC generator and a split-ring commutator for a DC one. The
// rate of change of flux is worked from the coil's angle and its angular
// velocity, ΔΦ/Δt = −BAω sin θ, so the graphs are smooth even when the coil is
// turned by hand.
//
// Coordinates: B points from N (left) to S (right), along +x; the axis of
// rotation is along z, towards the viewer at the slip-ring end; θ is measured
// anticlockwise as seen from that end, so turning the coil clockwise (as the
// papers usually do) makes θ decrease.

export type Kind = "ac" | "dc";
export type StartPlane = "perpendicular" | "parallel";

export interface GenParams {
  kind: Kind;
  turns: number;
  /** Magnetic flux density, T. */
  field: number;
  /** Area of the coil, m². */
  area: number;
  /** Turning speed when driven, revolutions a second. */
  speed: number;
  /** Turned clockwise as seen from the slip-ring (or commutator) end. */
  clockwise: boolean;
  /** How the coil's plane lies relative to the field when it starts. */
  start: StartPlane;
}

export const DEFAULT_PARAMS: GenParams = {
  kind: "ac",
  turns: 100,
  field: 0.5,
  area: 0.02,
  speed: 1,
  clockwise: true,
  start: "parallel",
};

const TAU = 2 * Math.PI;

/** θ at the start: the normal along B (plane perpendicular to the field) is 0; the plane along the field is 90°. */
export function startAngle(p: GenParams): number {
  return p.start === "perpendicular" ? 0 : Math.PI / 2;
}

/** Angular velocity when driven, rad·s⁻¹ (negative for clockwise). */
export function driveOmega(p: GenParams): number {
  return TAU * p.speed * (p.clockwise ? -1 : 1);
}

/** Φ = BA cos θ, in Wb (for one turn). */
export function flux(p: GenParams, theta: number): number {
  return p.field * p.area * Math.cos(theta);
}

/** ΔΦ/Δt = −BAω sin θ, in Wb·s⁻¹. */
export function fluxRate(p: GenParams, theta: number, omega: number): number {
  return -p.field * p.area * omega * Math.sin(theta);
}

/** The coil's own emf, emf = −N ΔΦ/Δt = NBAω sin θ, in V. Positive drives current towards the rings along side P. */
export function coilEmf(p: GenParams, theta: number, omega: number): number {
  return -p.turns * fluxRate(p, theta, omega);
}

/**
 * Which way the brushes see the coil: +1 when brush X is joined to coil side
 * A's end, −1 when to side Q's. Slip rings never swap. The commutator's two
 * halves sit beside their own sides and the brushes press on either side of
 * it, so the connection swaps each time the coil's plane passes perpendicular
 * to the field — exactly when the emf is zero.
 */
export function connection(p: GenParams, theta: number): number {
  if (p.kind === "ac") return 1;
  return Math.sin(theta) > 0 ? -1 : 1;
}

/** The emf across the terminals X and Y, in V: alternating with slip rings, one way only with the commutator. */
export function outputEmf(p: GenParams, theta: number, omega: number): number {
  return coilEmf(p, theta, omega) * connection(p, theta);
}

/** The largest emf at a steady turning speed: NBAω. */
export function peakEmf(p: GenParams, omega = driveOmega(p)): number {
  return p.turns * p.field * p.area * Math.abs(omega);
}

/** The angle in [0, 2π). */
export function wrap(theta: number): number {
  return ((theta % TAU) + TAU) % TAU;
}

/** θ in degrees, 0–360. */
export function degrees(theta: number): number {
  return (wrap(theta) * 180) / Math.PI;
}

/** The change in angle from a to b taking the short way round, for following a hand on the crank. */
export function angleStep(from: number, to: number): number {
  let d = wrap(to) - wrap(from);
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export type Position = "perpendicular" | "parallel" | "between";

/** Where the coil's plane is: perpendicular to the field (within 3°), parallel to it, or between. */
export function position(theta: number): Position {
  const deg = degrees(theta);
  const near = (target: number) => Math.min(Math.abs(deg - target), 360 - Math.abs(deg - target)) < 3;
  if (near(0) || near(180)) return "perpendicular";
  if (near(90) || near(270)) return "parallel";
  return "between";
}

export interface Sample {
  t: number;
  theta: number;
  flux: number;
  rate: number;
  emf: number;
}

export function sample(p: GenParams, t: number, theta: number, omega: number): Sample {
  return { t, theta, flux: flux(p, theta), rate: fluxRate(p, theta, omega), emf: outputEmf(p, theta, omega) };
}

/**
 * Drive the coil on steadily from (t, θ) for dt seconds, returning the samples
 * along the way at least every `every` seconds, so the graphs stay smooth
 * when a frame is long or the coil fast.
 */
export function drive(p: GenParams, t: number, theta: number, dt: number, every = 1 / 240): { theta: number; samples: Sample[] } {
  const omega = driveOmega(p);
  const steps = Math.max(1, Math.ceil(dt / every));
  const samples: Sample[] = [];
  for (let i = 1; i <= steps; i++) {
    const tt = t + (dt * i) / steps;
    samples.push(sample(p, tt, theta + omega * (tt - t), omega));
  }
  return { theta: theta + omega * dt, samples };
}

/**
 * How far the coil has turned since θ0, in degrees, counted in the direction it
 * is meant to turn (clockwise or not): the "angle of rotation" the papers
 * graph the emf against, 0° at the starting position. Turned the other way,
 * it goes negative.
 */
export function turned(clockwise: boolean, theta0: number, theta: number): number {
  return ((theta0 - theta) * (clockwise ? 1 : -1) * 180) / Math.PI;
}

export interface Crossing {
  t: number;
  /** The coil's angle there. */
  theta: number;
  kind: "perpendicular" | "parallel";
}

/** Where in a run of samples the coil passed perpendicular (Φ largest) or parallel (Φ = 0) to the field. */
export function crossings(samples: Sample[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    // Perpendicular where sin θ changes sign; parallel where cos θ does.
    for (const [kind, f] of [
      ["perpendicular", Math.sin],
      ["parallel", Math.cos],
    ] as const) {
      const fa = f(a.theta);
      const fb = f(b.theta);
      if (fa === 0 && i === 1) out.push({ t: a.t, theta: a.theta, kind });
      if ((fa < 0 && fb >= 0) || (fa > 0 && fb <= 0)) {
        const k = Math.abs(fa) / (Math.abs(fa) + Math.abs(fb) || 1);
        out.push({ t: a.t + (b.t - a.t) * k, theta: a.theta + (b.theta - a.theta) * k, kind });
      }
    }
  }
  return out.sort((x, y) => x.t - y.t);
}
