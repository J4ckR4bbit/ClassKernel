// The test timer's countdown, as plain functions over a state object so it can
// run outside any one screen (see ./timerStore.ts) and be tested in
// Node. Time always comes in as an argument; nothing here reads the clock.

export interface TimerPhase {
  label: string;
  seconds: number;
}

export interface TimerState {
  phases: TimerPhase[];
  phase: number;
  /** Seconds left in the current phase. */
  remaining: number;
  /** When the current phase ends (ms since epoch) while running. */
  deadline: number;
  running: boolean;
  finished: boolean;
}

/** What a tick asks the caller to do: nothing, a phase-change chime, or the end chime. */
export type TimerEvent = "none" | "phase" | "finish";

export function startTimer(phases: TimerPhase[], now: number): TimerState {
  return { phases, phase: 0, remaining: phases[0].seconds, deadline: now + phases[0].seconds * 1000, running: true, finished: false };
}

/** Advance to the time `now`, moving to the next phase or finishing when one runs out. */
export function tick(s: TimerState, now: number): { state: TimerState; event: TimerEvent } {
  if (!s.running) return { state: s, event: "none" };
  const rem = (s.deadline - now) / 1000;
  if (rem > 0) return { state: { ...s, remaining: rem }, event: "none" };
  if (s.phase < s.phases.length - 1) {
    const next = s.phases[s.phase + 1].seconds;
    return { state: { ...s, phase: s.phase + 1, remaining: next, deadline: now + next * 1000 }, event: "phase" };
  }
  return { state: { ...s, remaining: 0, running: false, finished: true }, event: "finish" };
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  if (!s.running) return s;
  return { ...s, running: false, remaining: Math.max(0, (s.deadline - now) / 1000) };
}

export function resumeTimer(s: TimerState, now: number): TimerState {
  if (s.running || s.finished || s.remaining <= 0) return s;
  return { ...s, running: true, deadline: now + s.remaining * 1000 };
}

export function addMinute(s: TimerState): TimerState {
  if (s.finished) return s;
  return { ...s, remaining: s.remaining + 60, deadline: s.deadline + (s.running ? 60000 : 0) };
}

/** Jump to the next phase, or end the timer from the last one. */
export function skipPhase(s: TimerState, now: number): TimerState {
  if (s.phase < s.phases.length - 1) {
    const next = s.phases[s.phase + 1].seconds;
    return { ...s, phase: s.phase + 1, remaining: next, deadline: now + next * 1000, finished: false };
  }
  return { ...s, remaining: 0, running: false, finished: true };
}

/** "mm:ss" (or "h:mm:ss") for a countdown, rounding up so 0:00 means done. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

// ---------- colour progression ----------
// As a phase runs down the graphic moves green → blue → orange → red.
export const COLOR_STOPS = ["#006600", "#1F497D", "#D6701C", "#CF1717"];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** elapsed 0 (full) → 1 (empty), interpolated across the four stops. */
export function phaseColor(elapsed: number): string {
  const e = Math.max(0, Math.min(1, elapsed));
  const segCount = COLOR_STOPS.length - 1;
  const seg = Math.min(segCount - 1, Math.floor(e * segCount));
  const localT = e * segCount - seg;
  return mix(COLOR_STOPS[seg], COLOR_STOPS[seg + 1], localT);
}
