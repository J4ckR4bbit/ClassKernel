// The stopwatch's state and sums, kept out of the component so they can be
// tested in Node. Nothing here reads the clock: every change takes the time
// it happened, so the elapsed time is always worked out from timestamps
// rather than counted up tick by tick, and can't drift if the screen stalls.

export interface StopwatchState {
  running: boolean;
  /** Date.now() when it was last started or resumed; meaningful only while running. */
  startedAt: number;
  /** Milliseconds banked before the current run (0 at the start). */
  accumulated: number;
  /** Elapsed time at each lap press, in milliseconds, oldest first. */
  laps: number[];
}

export const INITIAL: StopwatchState = { running: false, startedAt: 0, accumulated: 0, laps: [] };

/** Milliseconds on the stopwatch at `now`. */
export function elapsed(s: StopwatchState, now: number): number {
  return s.accumulated + (s.running ? Math.max(0, now - s.startedAt) : 0);
}

/** Start from zero, or resume after a pause. */
export function start(s: StopwatchState, now: number): StopwatchState {
  return s.running ? s : { ...s, running: true, startedAt: now };
}

export function pause(s: StopwatchState, now: number): StopwatchState {
  return s.running ? { ...s, running: false, accumulated: elapsed(s, now) } : s;
}

/** Mark a lap. Only while running: a lap on a stopped watch would just repeat the last one. */
export function lap(s: StopwatchState, now: number): StopwatchState {
  return s.running ? { ...s, laps: [...s.laps, elapsed(s, now)] } : s;
}

/**
 * Back to zero with the laps cleared. A running stopwatch carries straight on
 * from zero, so a teacher can restart a timing without a second press; a
 * paused one goes back to its starting state.
 */
export function restart(s: StopwatchState, now: number): StopwatchState {
  return s.running ? { running: true, startedAt: now, accumulated: 0, laps: [] } : INITIAL;
}

export interface LapRow {
  /** 1 for the first lap. */
  number: number;
  /** This lap's own length. */
  split: number;
  /** Elapsed time when the lap was marked. */
  total: number;
  fastest: boolean;
  slowest: boolean;
}

/**
 * The lap table, newest first as on a phone stopwatch. Fastest and slowest are
 * only marked from three laps on: with two, one is always "fastest" and the
 * other "slowest", which says nothing.
 */
export function lapRows(laps: number[]): LapRow[] {
  const splits = laps.map((t, i) => t - (i === 0 ? 0 : laps[i - 1]));
  const mark = splits.length >= 3;
  const min = Math.min(...splits);
  const max = Math.max(...splits);
  return splits
    .map((split, i) => ({
      number: i + 1,
      split,
      total: laps[i],
      fastest: mark && split === min && min !== max,
      slowest: mark && split === max && min !== max,
    }))
    .reverse();
}

/**
 * "mm:ss,cc" under an hour and "h:mm:ss,cc" from an hour on — a decimal comma,
 * like the rest of the app. Hundredths are rounded down, as on any stopwatch,
 * so the display never shows a hundredth that hasn't happened yet.
 */
export function formatStopwatch(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const hundredths = cs % 100;
  const totalSeconds = Math.floor(cs / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  const main = hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return `${main},${pad(hundredths)}`;
}
