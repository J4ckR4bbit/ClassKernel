// The slope on the bench, kept outside the view so leaving the screen doesn't
// lose the set-up or the run. This computer also remembers the set-up and the
// display options (localStorage); nothing goes into the data folder.

import { create } from "zustand";
import { LabelStyle, Sample } from "./drawing";
import { DEFAULT_PARAMS, Motion, SlopeParams, startMotion } from "./slope";

export type Speed = 0.25 | 0.5 | 1;

export interface SlopeOptions {
  labels: LabelStyle;
  /** Write each force's size beside it on the free-body diagrams. */
  sizes: boolean;
  /** Draw the forces on the block in the picture too. */
  forcesInPicture: boolean;
  velocity: boolean;
  /** Write the angle's value in the picture (or just θ). */
  angleValue: boolean;
  /** Hide the numbers and the memo for the class to work them out. */
  question: boolean;
}

const DEFAULT_OPTIONS: SlopeOptions = { labels: "symbols", sizes: true, forcesInPicture: false, velocity: true, angleValue: true, question: false };

const PARAMS_KEY = "classkernel.slope.params";
const OPTIONS_KEY = "classkernel.slope.options";

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

export interface SlopeState {
  params: SlopeParams;
  motion: Motion;
  running: boolean;
  tilting: boolean;
  speed: Speed;
  samples: Sample[];
  options: SlopeOptions;
  /** The example last loaded, for its note. */
  exampleId: string;

  /** Change the set-up. Where the block starts and how fast restart the run; the rest act at once. */
  setParams(patch: Partial<SlopeParams>): void;
  load(params: SlopeParams, exampleId: string): void;
  setMotion(motion: Motion, sample?: boolean): void;
  setRunning(running: boolean): void;
  setTilting(tilting: boolean): void;
  setSpeed(speed: Speed): void;
  setOptions(patch: Partial<SlopeOptions>): void;
  reset(): void;
}

const RESTART: Array<keyof SlopeParams> = ["setup", "start", "v0", "length"];

export const useSlope = create<SlopeState>((set, get) => {
  const params = load(PARAMS_KEY, DEFAULT_PARAMS);
  const fresh = (p: SlopeParams) => {
    const motion = startMotion(p);
    return { motion, samples: [{ t: 0, v: motion.v }], running: false, tilting: false };
  };
  return {
    params,
    ...fresh(params),
    speed: 1,
    options: load(OPTIONS_KEY, DEFAULT_OPTIONS),
    exampleId: "",

    setParams: (patch) => {
      const params = { ...get().params, ...patch };
      if (params.muK > params.muS && !("muK" in patch)) params.muK = params.muS;
      const restart = RESTART.some((k) => k in patch && patch[k] !== get().params[k]);
      set({ params, ...(restart ? fresh(params) : {}) });
    },
    load: (params, exampleId) => set({ params, exampleId, ...fresh(params) }),
    setMotion: (motion, sample = false) => {
      const samples = get().samples;
      set({ motion, samples: sample ? [...samples, { t: motion.t, v: motion.v }].slice(-2000) : samples });
    },
    setRunning: (running) => set({ running, tilting: running ? false : get().tilting }),
    setTilting: (tilting) => set({ tilting, running: tilting ? false : get().running }),
    setSpeed: (speed) => set({ speed }),
    setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
    reset: () => set(fresh(get().params)),
  };
});

useSlope.subscribe((s, before) => {
  if (s.params !== before.params) remember(PARAMS_KEY, s.params);
  if (s.options !== before.options) remember(OPTIONS_KEY, s.options);
});
