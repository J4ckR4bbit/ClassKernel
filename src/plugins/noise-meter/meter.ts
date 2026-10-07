// The sound-level maths behind the class noise meter, kept out of the React
// view so it can be checked in Node.
//
// A PC microphone reports levels relative to its own full scale, not true
// sound pressure. The meter A-weights the spectrum (the dB(A) scale noise
// limits are quoted in), smooths it with the "Slow" 1 s time weighting of a
// real sound-level meter, and adds a calibration offset: a default that gives
// plausible classroom numbers, or one the teacher sets once against a phone
// meter app or a real meter.

/** Added to the microphone's relative level when the meter hasn't been calibrated. */
export const DEFAULT_OFFSET = 95;
/** The lowest level reported, so a silent input doesn't read as −∞. */
export const FLOOR_DB = 0;
/** "Slow" time weighting from IEC 61672, in seconds. */
export const SLOW_TAU = 1;
/** Seconds over the limit before the alarm goes off — a dropped book shouldn't. */
export const TRIGGER_SECONDS = 1;
/** Seconds back under the limit before the alarm clears. */
export const CLEAR_SECONDS = 2;
/** The band below the limit shown as "getting close". */
export const WARN_BAND = 5;

/** A-weighting (IEC 61672) in dB at frequency f in Hz: 0 dB at 1 kHz. */
export function aWeightingDb(f: number): number {
  if (f <= 0) return -Infinity;
  const f2 = f * f;
  const ra =
    (12194 ** 2 * f2 * f2) /
    ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2.0;
}

/**
 * Overall A-weighted level (relative dB) from an analyser's frequency bins,
 * which are in dB as AnalyserNode.getFloatFrequencyData gives them. Bins
 * below 20 Hz (DC and rumble) are left out.
 */
export function weightedLevel(spectrumDb: ArrayLike<number>, sampleRate: number, fftSize: number): number {
  let power = 0;
  for (let k = 0; k < spectrumDb.length; k++) {
    const f = (k * sampleRate) / fftSize;
    const db = spectrumDb[k];
    if (f < 20 || !Number.isFinite(db)) continue;
    power += 10 ** ((db + aWeightingDb(f)) / 10);
  }
  return power > 0 ? 10 * Math.log10(power) : -Infinity;
}

/**
 * Exponential time weighting, applied to power (as a sound-level meter does)
 * rather than to the dB figure. `prev` null starts from the new value.
 */
export function timeWeighted(prev: number | null, next: number, dtSeconds: number, tau = SLOW_TAU): number {
  if (prev === null || !Number.isFinite(prev)) return next;
  if (!Number.isFinite(next)) next = prev - 60; // silence: decay rather than jump to −∞
  const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
  const p = 10 ** (prev / 10) + alpha * (10 ** (next / 10) - 10 ** (prev / 10));
  return 10 * Math.log10(Math.max(p, 1e-12));
}

/** The level to show: relative level plus calibration, never below the floor. */
export function displayLevel(relative: number, offset: number | null): number {
  if (!Number.isFinite(relative)) return FLOOR_DB;
  return Math.max(FLOOR_DB, relative + (offset ?? DEFAULT_OFFSET));
}

/** The offset that makes the current relative level read as the meter's reading. */
export function calibrationOffset(relative: number, meterReading: number): number {
  return meterReading - relative;
}

export type Zone = "quiet" | "warn" | "loud";

/** Green under the warning band, amber within 5 dB of the limit, red over it. */
export function zoneFor(level: number, limit: number): Zone {
  if (level > limit) return "loud";
  if (level > limit - WARN_BAND) return "warn";
  return "quiet";
}

export interface AlarmState {
  active: boolean;
  /** Seconds continuously over the limit (resets on any dip). */
  overFor: number;
  /** Seconds continuously at or under the limit. */
  underFor: number;
  /** Alarms raised this session. */
  count: number;
  /** Total seconds over the limit this session. */
  secondsOver: number;
}

export const QUIET_ALARM: AlarmState = { active: false, overFor: 0, underFor: 0, count: 0, secondsOver: 0 };

/**
 * Advance the alarm by dt seconds. It goes off after TRIGGER_SECONDS over the
 * limit and clears after CLEAR_SECONDS back under it, so brief spikes don't
 * set it off and brief dips don't silence it.
 */
export function alarmStep(s: AlarmState, level: number, limit: number, dt: number): AlarmState {
  const over = level > limit;
  const next: AlarmState = {
    ...s,
    secondsOver: s.secondsOver + (over ? dt : 0),
    overFor: over ? s.overFor + dt : 0,
    underFor: over ? 0 : s.underFor + dt,
  };
  if (!s.active && over && next.overFor >= TRIGGER_SECONDS) {
    next.active = true;
    next.count = s.count + 1;
  } else if (s.active && !over && next.underFor >= CLEAR_SECONDS) {
    next.active = false;
  }
  return next;
}

// ---------- settings (per PC, in localStorage) ----------

export interface MeterSettings {
  /** The level the class should stay below, dB(A). */
  limit: number;
  /** Calibration offset; null = not calibrated (DEFAULT_OFFSET applies). */
  offset: number | null;
  /** Chosen microphone; "" = the system default. */
  deviceId: string;
}

export const DEFAULT_SETTINGS: MeterSettings = { limit: 65, offset: null, deviceId: "" };
export const LIMIT_MIN = 30;
export const LIMIT_MAX = 110;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Parse stored settings, falling back to defaults for anything missing or odd. */
export function parseSettings(raw: string | null): MeterSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof MeterSettings, unknown>>;
    const limit = typeof v.limit === "number" && Number.isFinite(v.limit) ? Math.round(v.limit) : DEFAULT_SETTINGS.limit;
    const offset = typeof v.offset === "number" && Number.isFinite(v.offset) ? clamp(v.offset, 0, 200) : null;
    return {
      limit: clamp(limit, LIMIT_MIN, LIMIT_MAX),
      offset,
      deviceId: typeof v.deviceId === "string" ? v.deviceId : "",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
