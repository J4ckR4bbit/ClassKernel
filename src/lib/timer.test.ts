import { describe, expect, it } from "vitest";
import { addMinute, formatCountdown, pauseTimer, resumeTimer, skipPhase, startTimer, tick } from "./timer";

const phases = [
  { label: "Reading time", seconds: 60 },
  { label: "Writing time", seconds: 120 },
];
const T0 = 1_000_000;

describe("test timer", () => {
  it("counts down from the deadline, not from ticks", () => {
    const s = startTimer(phases, T0);
    const { state, event } = tick(s, T0 + 15_500);
    expect(event).toBe("none");
    expect(state.remaining).toBeCloseTo(44.5, 6);
  });

  it("moves to the next phase with a chime, then finishes", () => {
    let s = startTimer(phases, T0);
    let r = tick(s, T0 + 60_000);
    expect(r.event).toBe("phase");
    expect(r.state.phase).toBe(1);
    expect(r.state.remaining).toBe(120);
    s = r.state;
    r = tick(s, T0 + 60_000 + 120_000);
    expect(r.event).toBe("finish");
    expect(r.state).toMatchObject({ running: false, finished: true, remaining: 0 });
  });

  it("holds still while paused and picks up where it left off", () => {
    let s = startTimer(phases, T0);
    s = pauseTimer(s, T0 + 10_000);
    expect(s.remaining).toBeCloseTo(50, 6);
    expect(tick(s, T0 + 500_000).state.remaining).toBeCloseTo(50, 6); // time passes, nothing moves
    s = resumeTimer(s, T0 + 500_000);
    expect(tick(s, T0 + 510_000).state.remaining).toBeCloseTo(40, 6);
  });

  it("adds a minute whether running or paused", () => {
    let s = startTimer(phases, T0);
    s = addMinute(s);
    expect(tick(s, T0 + 60_000).state.remaining).toBeCloseTo(60, 6);
    s = pauseTimer(s, T0 + 60_000);
    s = addMinute(s);
    expect(s.remaining).toBeCloseTo(120, 6);
  });

  it("skips to the next phase, and ends from the last", () => {
    let s = startTimer(phases, T0);
    s = skipPhase(s, T0 + 5_000);
    expect(s).toMatchObject({ phase: 1, remaining: 120 });
    s = skipPhase(s, T0 + 6_000);
    expect(s).toMatchObject({ finished: true, running: false, remaining: 0 });
    expect(addMinute(s)).toBe(s);
    expect(resumeTimer(s, T0)).toBe(s);
  });

  it("formats the countdown, rounding up", () => {
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(0.2)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(3725)).toBe("1:02:05");
  });
});
