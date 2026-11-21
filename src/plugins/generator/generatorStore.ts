// The generator on the bench, kept outside the view so leaving the screen
// doesn't lose the set-up or the graphs drawn so far. This computer remembers
// the set-up and the display options (localStorage); nothing goes into the
// data folder.

import { create } from "zustand";
import { DEFAULT_PARAMS, GenParams, Sample, driveOmega, sample, startAngle } from "./generator";

export interface GenOptions {
  /** Show the induced current on the coil. */
  current: boolean;
  /** Show the normal to the coil and θ in the end-on view. */
  normal: boolean;
  /** Numbers on the graphs' axes. */
  values: boolean;
  /** Mark where the coil's plane is perpendicular or parallel to the field. */
  markers: boolean;
  /** Stop at the end of each sweep of the graphs (otherwise start a new one). */
  pauseAtEnd: boolean;
  /** Seconds across the graphs. */
  window: number;
}

const DEFAULT_OPTIONS: GenOptions = { current: true, normal: true, values: true, markers: true, pauseAtEnd: true, window: 2 };

const PARAMS_KEY = "classkernel.generator.params";
const OPTIONS_KEY = "classkernel.generator.options";

function load<T extends object>(key: string, fallback: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<T>;
    const out = { ...fallback };
    for (const k of Object.keys(fallback) as Array<keyof T>) {
      if (typeof saved[k] === typeof fallback[k] && (typeof saved[k] !== "number" || Number.isFinite(saved[k]))) out[k] = saved[k] as T[keyof T];
    }
    return out;
  } catch {
    return { ...fallback };
  }
}

function remember(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered on this computer; it still works until the app closes.
  }
}

export interface GenState {
  params: GenParams;
  /** The coil's angle (unwrapped), the time into this sweep, and the angular velocity now. */
  theta: number;
  t: number;
  omega: number;
  running: boolean;
  samples: Sample[];
  /** A sweep kept for comparison, and what it was. */
  held: Sample[] | null;
  heldLabel: string;
  options: GenOptions;

  setParams(patch: Partial<GenParams>): void;
  setOptions(patch: Partial<GenOptions>): void;
  /** Move the coil on: the new angle, time and angular velocity, and the samples taken on the way. */
  advance(theta: number, t: number, omega: number, samples: Sample[]): void;
  setRunning(running: boolean): void;
  /** Back to the start position, with clear graphs. */
  reset(): void;
  /** Start a new sweep of the graphs from where the coil is now. */
  newSweep(): void;
  hold(label: string): void;
  clearHeld(): void;
}

export const useGenerator = create<GenState>((set, get) => {
  const params = load(PARAMS_KEY, DEFAULT_PARAMS);
  const fresh = (p: GenParams) => {
    const theta = startAngle(p);
    return { theta, t: 0, omega: 0, running: false, samples: [sample(p, 0, theta, 0)] };
  };
  return {
    params,
    ...fresh(params),
    held: null,
    heldLabel: "",
    options: load(OPTIONS_KEY, DEFAULT_OPTIONS),

    setParams: (patch) => {
      const params = { ...get().params, ...patch };
      // A new starting position, or a different kind of generator, starts the graphs again.
      const restart = ("start" in patch && patch.start !== get().params.start) || ("kind" in patch && patch.kind !== get().params.kind);
      set({ params, ...(restart ? fresh(params) : {}) });
    },
    setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
    advance: (theta, t, omega, samples) => set({ theta, t, omega, samples: samples.length ? [...get().samples, ...samples] : get().samples }),
    setRunning: (running) => {
      const s = get();
      // Starting from the beginning of a sweep: its first point is already turning.
      if (running && s.t === 0) set({ running, omega: driveOmega(s.params), samples: [sample(s.params, 0, s.theta, driveOmega(s.params))] });
      else set({ running, omega: running ? s.omega : 0 });
    },
    reset: () => set(fresh(get().params)),
    newSweep: () => {
      const s = get();
      set({ t: 0, samples: [sample(s.params, 0, s.theta, s.omega)] });
    },
    hold: (label) => set({ held: get().samples, heldLabel: label }),
    clearHeld: () => set({ held: null, heldLabel: "" }),
  };
});

useGenerator.subscribe((s, before) => {
  if (s.params !== before.params) remember(PARAMS_KEY, s.params);
  if (s.options !== before.options) remember(OPTIONS_KEY, s.options);
});
