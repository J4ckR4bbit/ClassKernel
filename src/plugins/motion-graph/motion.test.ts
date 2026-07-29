import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOTION,
  Journey,
  MotionSettings,
  accelerationAt,
  analyse,
  computeMotionLayout,
  describeStage,
  distanceTravelled,
  fileNameFor,
  positionAt,
  project,
  rangeOf,
  series,
  summarise,
  totalTime,
  velocityAt,
} from "./motion";

const motion = (patch: Partial<MotionSettings> = {}): MotionSettings => ({ ...DEFAULT_MOTION, ...patch });

/** At rest 2 s, then uniformly up to 8 m·s⁻¹ over 4 s, then steady for 3 s. */
const journey: Journey = {
  startVelocity: 0,
  startPosition: 0,
  stages: [
    { seconds: 2, endVelocity: 0 },
    { seconds: 4, endVelocity: 8 },
    { seconds: 3, endVelocity: 8 },
  ],
};

describe("working out a journey", () => {
  it("derives the acceleration each stage needs to reach its end velocity", () => {
    const [rest, speedUp, steady] = analyse(journey);
    expect(rest.a).toBe(0);
    expect(speedUp.a).toBe(2); // 8 m·s⁻¹ gained over 4 s
    expect(steady.a).toBe(0);
    expect(totalTime(analyse(journey))).toBe(9);
  });

  it("carries position and velocity across the joins without a gap", () => {
    const states = analyse(journey);
    for (let i = 1; i < states.length; i++) {
      expect(states[i].x0).toBeCloseTo(states[i - 1].x1, 10);
      expect(states[i].u).toBeCloseTo(states[i - 1].v, 10);
      expect(states[i].start).toBeCloseTo(states[i - 1].end, 10);
    }
    // s = ut + ½at² over the accelerating stage: ½ × 2 × 4² = 16 m.
    expect(states[1].x1 - states[1].x0).toBeCloseTo(16, 10);
    // Then 8 m·s⁻¹ for 3 s.
    expect(states[2].x1).toBeCloseTo(16 + 24, 10);
  });

  it("drops a stage that lasts no time at all", () => {
    const states = analyse({ ...journey, stages: [{ seconds: 0, endVelocity: 5 }, { seconds: 2, endVelocity: 4 }] });
    expect(states).toHaveLength(1);
    expect(states[0].u).toBe(0);
  });

  it("finds where the object turns round inside a stage", () => {
    // Rolling backwards up a hill: +6 m·s⁻¹ down to −6 m·s⁻¹ over 6 s.
    const states = analyse({ startVelocity: 6, startPosition: 0, stages: [{ seconds: 6, endVelocity: -6 }] });
    expect(states[0].a).toBe(-2);
    expect(states[0].turningTime).toBeCloseTo(3, 10); // u + at = 0
    // Furthest point: 6 × 3 − ½ × 2 × 9 = 9 m, and it comes back to 0.
    expect(positionAt(states, 3)).toBeCloseTo(9, 10);
    expect(states[0].x1).toBeCloseTo(0, 10);
  });

  it("counts distance as the path travelled, not the displacement", () => {
    const states = analyse({ startVelocity: 6, startPosition: 0, stages: [{ seconds: 6, endVelocity: -6 }] });
    expect(states[0].x1 - states[0].x0).toBeCloseTo(0, 10); // back where it started
    expect(distanceTravelled(states)).toBeCloseTo(18, 10); // 9 m out and 9 m back
  });
});

describe("the three graphs agree with each other", () => {
  const states = analyse(journey);

  it("has velocity as the gradient of the position graph", () => {
    for (const t of [1, 3, 5, 7, 8.5]) {
      const h = 1e-6;
      const numerical = (positionAt(states, t + h) - positionAt(states, t - h)) / (2 * h);
      expect(numerical).toBeCloseTo(velocityAt(states, t), 6);
    }
  });

  it("has acceleration as the gradient of the velocity graph", () => {
    for (const t of [1, 3, 5, 7]) {
      const h = 1e-6;
      const numerical = (velocityAt(states, t + h) - velocityAt(states, t - h)) / (2 * h);
      expect(numerical).toBeCloseTo(accelerationAt(states, t), 5);
    }
  });

  it("has the area under the velocity graph as the change in position", () => {
    // Trapezium rule over the whole journey.
    const steps = 20000;
    const dt = totalTime(states) / steps;
    let area = 0;
    for (let i = 0; i < steps; i++) {
      area += ((velocityAt(states, i * dt) + velocityAt(states, (i + 1) * dt)) / 2) * dt;
    }
    expect(area).toBeCloseTo(states[states.length - 1].x1 - states[0].x0, 4);
  });
});

describe("what gets drawn", () => {
  const states = analyse(journey);

  it("draws velocity as one unbroken stroke", () => {
    const strokes = series(states, "velocity");
    expect(strokes).toHaveLength(1);
    expect(strokes[0][0]).toEqual({ t: 0, y: 0 });
    expect(strokes[0][strokes[0].length - 1]).toEqual({ t: 9, y: 8 });
  });

  it("draws acceleration as separate steps, so the jumps aren't joined up", () => {
    const strokes = series(states, "acceleration");
    expect(strokes).toHaveLength(3);
    for (const stroke of strokes) {
      expect(stroke).toHaveLength(2);
      expect(stroke[0].y).toBe(stroke[1].y); // flat within a stage
    }
    expect(strokes[1][0].y).toBe(2);
  });

  it("samples the position curve where it bends, and keeps it straight where it doesn't", () => {
    const straight = series(analyse({ startVelocity: 4, startPosition: 0, stages: [{ seconds: 5, endVelocity: 4 }] }), "position");
    expect(straight[0]).toHaveLength(2); // constant velocity needs two points

    const curved = series(analyse({ startVelocity: 0, startPosition: 0, stages: [{ seconds: 5, endVelocity: 10 }] }), "position");
    expect(curved[0].length).toBeGreaterThan(10);
    // A parabola: halfway in time is a quarter of the way in distance.
    const mid = curved[0][Math.floor(curved[0].length / 2)];
    expect(mid.y).toBeLessThan(curved[0][curved[0].length - 1].y / 2);
  });

  it("gives every axis room for zero, and for a turning point", () => {
    expect(rangeOf(states, "velocity")).toEqual([0, 8]);
    expect(rangeOf(states, "acceleration")).toEqual([0, 2]);
    const there = analyse({ startVelocity: 6, startPosition: 0, stages: [{ seconds: 6, endVelocity: -6 }] });
    // The furthest point is inside the stage, not at either end.
    expect(rangeOf(there, "position")[1]).toBeCloseTo(9, 10);
  });
});

describe("the figure", () => {
  const states = analyse(journey);

  it("stacks a panel per graph and drops the ones switched off", () => {
    expect(computeMotionLayout(states, motion()).panels).toHaveLength(3);
    const one = computeMotionLayout(states, motion({ position: "off", acceleration: "off" }));
    expect(one.panels).toHaveLength(1);
    expect(one.panels[0].quantity).toBe("velocity");
    expect(one.height).toBeLessThan(computeMotionLayout(states, motion()).height);
  });

  it("keeps a blank panel's axes but leaves its curve out", () => {
    const layout = computeMotionLayout(states, motion({ position: "blank" }));
    const [x, v] = layout.panels;
    expect(x.drawn).toBe(false);
    expect(x.ticks.length).toBeGreaterThan(1); // the axis is still there to draw on
    expect(v.drawn).toBe(true);
  });

  it("gives every panel the same time axis, so they line up down the page", () => {
    const layout = computeMotionLayout(states, motion());
    const at5 = layout.panels.map((p) => project(layout, p, { t: 5, y: 0 }).x);
    expect(new Set(at5.map((x) => x.toFixed(6))).size).toBe(1);
    expect(layout.timeScale.max).toBeGreaterThanOrEqual(9);
  });

  it("marks the stage boundaries for the dashed guides", () => {
    expect(computeMotionLayout(states, motion()).stageTimes).toEqual([2, 6, 9]);
  });

  it("says when there is nothing to draw", () => {
    expect(computeMotionLayout([], motion()).empty).toBe(true);
    expect(computeMotionLayout(states, motion({ position: "off", velocity: "off", acceleration: "off" })).empty).toBe(true);
  });
});

describe("words for the numbers", () => {
  it("describes each stage the way a teacher would say it", () => {
    const [rest, speedUp, steady] = analyse(journey);
    expect(describeStage(rest)).toBe("At rest for 2 s");
    expect(describeStage(speedUp)).toBe("Speeds up from 0 to 8 m·s⁻¹ in 4 s (a = 2 m·s⁻²)");
    expect(describeStage(steady)).toBe("Constant 8 m·s⁻¹ for 3 s");
    const slowing = analyse({ startVelocity: 10, startPosition: 0, stages: [{ seconds: 5, endVelocity: 0 }] })[0];
    expect(describeStage(slowing)).toContain("Slows down from 10 to 0 m·s⁻¹");
  });

  it("summarises the journey", () => {
    const line = summarise(analyse(journey));
    expect(line).toContain("9 s");
    expect(line).toContain("displacement 40 m");
    expect(line).toContain("average speed 4,44 m·s⁻¹");
  });

  it("names the file after the title", () => {
    expect(fileNameFor(motion({ title: "A trolley on a track" }))).toBe("a_trolley_on_a_track.png");
    expect(fileNameFor(motion())).toBe("motion_graphs.png");
  });
});
