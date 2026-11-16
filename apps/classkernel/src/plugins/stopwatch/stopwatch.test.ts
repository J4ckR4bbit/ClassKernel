import { describe, expect, it } from "vitest";
import { INITIAL, elapsed, formatStopwatch, lap, lapRows, pause, restart, start } from "./stopwatch";

describe("running and pausing", () => {
  it("counts from the moment it starts, and stands still while paused", () => {
    let s = start(INITIAL, 1_000);
    expect(elapsed(s, 3_500)).toBe(2_500);
    s = pause(s, 4_000);
    expect(s.running).toBe(false);
    expect(elapsed(s, 60_000)).toBe(3_000);
  });

  it("carries on from where it was paused when resumed", () => {
    let s = start(INITIAL, 0);
    s = pause(s, 2_000);
    s = start(s, 10_000);
    expect(elapsed(s, 10_750)).toBe(2_750);
  });

  it("ignores a second start or a second pause", () => {
    const running = start(INITIAL, 0);
    expect(start(running, 5_000)).toBe(running);
    const paused = pause(running, 1_000);
    expect(pause(paused, 9_000)).toBe(paused);
  });
});

describe("laps", () => {
  it("records the elapsed time at each press, only while running", () => {
    let s = start(INITIAL, 0);
    s = lap(s, 1_200);
    s = lap(s, 2_000);
    expect(s.laps).toEqual([1_200, 2_000]);
    s = pause(s, 3_000);
    expect(lap(s, 4_000)).toBe(s);
  });

  it("lists laps newest first with their splits", () => {
    expect(lapRows([1_200, 2_000])).toEqual([
      { number: 2, split: 800, total: 2_000, fastest: false, slowest: false },
      { number: 1, split: 1_200, total: 1_200, fastest: false, slowest: false },
    ]);
  });

  it("marks the fastest and slowest only from three laps on", () => {
    const rows = lapRows([1_000, 1_800, 3_100]); // splits 1000, 800, 1300
    expect(rows.find((r) => r.fastest)?.number).toBe(2);
    expect(rows.find((r) => r.slowest)?.number).toBe(3);
    // Three identical splits: none is faster or slower than another.
    expect(lapRows([1_000, 2_000, 3_000]).some((r) => r.fastest || r.slowest)).toBe(false);
  });
});

describe("restart", () => {
  it("goes back to zero and keeps going if it was running", () => {
    let s = start(INITIAL, 0);
    s = lap(s, 1_000);
    s = restart(s, 5_000);
    expect(s).toEqual({ running: true, startedAt: 5_000, accumulated: 0, laps: [] });
    expect(elapsed(s, 5_400)).toBe(400);
  });

  it("goes back to its starting state if it was paused", () => {
    const s = pause(lap(start(INITIAL, 0), 500), 2_000);
    expect(restart(s, 9_000)).toEqual(INITIAL);
  });
});

describe("display", () => {
  it("writes minutes, seconds and hundredths with a decimal comma", () => {
    expect(formatStopwatch(0)).toBe("00:00,00");
    expect(formatStopwatch(83_456)).toBe("01:23,45");
  });

  it("rounds hundredths down, never up", () => {
    expect(formatStopwatch(9_999)).toBe("00:09,99");
  });

  it("adds hours from an hour on", () => {
    expect(formatStopwatch(3_600_000)).toBe("1:00:00,00");
    expect(formatStopwatch(2 * 3_600_000 + 5 * 60_000 + 7_080)).toBe("2:05:07,08");
  });
});
