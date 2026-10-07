import { describe, expect, it } from "vitest";
import {
  CLEAR_SECONDS,
  DEFAULT_OFFSET,
  DEFAULT_SETTINGS,
  LIMIT_MAX,
  QUIET_ALARM,
  TRIGGER_SECONDS,
  aWeightingDb,
  alarmStep,
  calibrationOffset,
  displayLevel,
  parseSettings,
  timeWeighted,
  weightedLevel,
  zoneFor,
  type AlarmState,
} from "./meter";

describe("A-weighting", () => {
  it("matches the IEC 61672 table to a tenth of a decibel", () => {
    expect(aWeightingDb(1000)).toBeCloseTo(0, 1);
    expect(aWeightingDb(100)).toBeCloseTo(-19.1, 1);
    expect(aWeightingDb(2500)).toBeCloseTo(1.3, 1);
    expect(aWeightingDb(31.5)).toBeCloseTo(-39.5, 1);
  });
});

describe("weightedLevel", () => {
  const sampleRate = 48000;
  const fftSize = 2048;
  const bins = fftSize / 2;
  const binOf = (f: number) => Math.round((f * fftSize) / sampleRate);
  const tone = (f: number, db: number) => {
    const s = new Float32Array(bins).fill(-Infinity);
    s[binOf(f)] = db;
    return s;
  };

  it("reads a 1 kHz tone at its own level", () => {
    expect(weightedLevel(tone(1000, -30), sampleRate, fftSize)).toBeCloseTo(-30, 0);
  });

  it("discounts low rumble the way the ear does", () => {
    const low = weightedLevel(tone(100, -30), sampleRate, fftSize);
    const mid = weightedLevel(tone(1000, -30), sampleRate, fftSize);
    expect(mid - low).toBeGreaterThan(15);
  });

  it("power-sums bins: two equal tones read 3 dB above one", () => {
    const one = tone(1000, -40);
    const two = Float32Array.from(one);
    two[binOf(1000) + 1] = -40;
    const f2 = ((binOf(1000) + 1) * sampleRate) / fftSize;
    const expected = 10 * Math.log10(10 ** ((-40 + aWeightingDb((binOf(1000) * sampleRate) / fftSize)) / 10) + 10 ** ((-40 + aWeightingDb(f2)) / 10));
    expect(weightedLevel(two, sampleRate, fftSize)).toBeCloseTo(expected, 6);
    expect(weightedLevel(two, sampleRate, fftSize) - weightedLevel(one, sampleRate, fftSize)).toBeCloseTo(3, 0);
  });

  it("returns −∞ for silence and ignores DC", () => {
    expect(weightedLevel(new Float32Array(bins).fill(-Infinity), sampleRate, fftSize)).toBe(-Infinity);
    const dc = new Float32Array(bins).fill(-Infinity);
    dc[0] = 0;
    expect(weightedLevel(dc, sampleRate, fftSize)).toBe(-Infinity);
  });
});

describe("time weighting", () => {
  it("starts at the first value and moves 63 % of the way (in power) after one time constant", () => {
    expect(timeWeighted(null, 50, 0.1)).toBe(50);
    const after = timeWeighted(40, 60, 1, 1);
    const expected = 10 * Math.log10(10 ** 4 + (1 - Math.exp(-1)) * (10 ** 6 - 10 ** 4));
    expect(after).toBeCloseTo(expected, 6);
  });

  it("settles on a steady level and decays rather than jumping on silence", () => {
    let v: number | null = 30;
    for (let i = 0; i < 100; i++) v = timeWeighted(v, 60, 0.1);
    expect(v).toBeCloseTo(60, 2);
    const decayed = timeWeighted(60, -Infinity, 0.1);
    expect(decayed).toBeLessThan(60);
    expect(Number.isFinite(decayed)).toBe(true);
  });
});

describe("display and calibration", () => {
  it("adds the default offset until calibrated", () => {
    expect(displayLevel(-40, null)).toBe(-40 + DEFAULT_OFFSET);
    expect(displayLevel(-Infinity, null)).toBe(0);
  });

  it("maps the current reading onto the meter's figure", () => {
    const offset = calibrationOffset(-38.5, 62);
    expect(displayLevel(-38.5, offset)).toBeCloseTo(62, 9);
    expect(displayLevel(-28.5, offset)).toBeCloseTo(72, 9);
  });
});

describe("zones", () => {
  it("is green below the warning band, amber within 5 dB, red only above the limit", () => {
    expect(zoneFor(55, 65)).toBe("quiet");
    expect(zoneFor(60.5, 65)).toBe("warn");
    expect(zoneFor(65, 65)).toBe("warn"); // at the limit is still within it
    expect(zoneFor(65.1, 65)).toBe("loud");
  });
});

describe("alarm", () => {
  const run = (s: AlarmState, level: number, seconds: number, dt = 0.1) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) s = alarmStep(s, level, 65, dt);
    return s;
  };

  it("ignores a spike shorter than the trigger time", () => {
    const s = run(QUIET_ALARM, 80, TRIGGER_SECONDS - 0.3);
    expect(s.active).toBe(false);
    expect(run(s, 50, 0.2).active).toBe(false);
    expect(run(s, 50, 0.2).count).toBe(0);
  });

  it("goes off after the trigger time over the limit, and counts once", () => {
    const s = run(QUIET_ALARM, 80, TRIGGER_SECONDS + 0.2);
    expect(s.active).toBe(true);
    expect(s.count).toBe(1);
    expect(run(s, 80, 5).count).toBe(1);
  });

  it("stays on through a brief dip and clears after the clear time under the limit", () => {
    let s = run(QUIET_ALARM, 80, 2);
    s = run(s, 50, CLEAR_SECONDS - 0.5);
    expect(s.active).toBe(true);
    s = run(s, 80, 0.3); // noise comes back: the clear timer restarts
    s = run(s, 50, CLEAR_SECONDS - 0.5);
    expect(s.active).toBe(true);
    s = run(s, 50, 1);
    expect(s.active).toBe(false);
  });

  it("keeps the session totals", () => {
    let s = run(QUIET_ALARM, 80, 3);
    s = run(s, 50, 3);
    s = run(s, 80, 2);
    expect(s.count).toBe(2);
    expect(s.secondsOver).toBeCloseTo(5, 6);
  });
});

describe("stored settings", () => {
  it("uses defaults when nothing or junk is stored", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"limit":"loud"}')).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps good values and pulls the limit into range", () => {
    expect(parseSettings('{"limit":58,"offset":97.5,"deviceId":"mic-2"}')).toEqual({
      limit: 58,
      offset: 97.5,
      deviceId: "mic-2",
    });
    expect(parseSettings('{"limit":500}').limit).toBe(LIMIT_MAX);
  });
});
