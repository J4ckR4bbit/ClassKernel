// The reaction in the beaker, kept outside the view so leaving the screen
// doesn't lose the run. This computer remembers the conditions and the
// display options (localStorage); nothing goes into the data folder.

import { create } from "zustand";
import type { Held } from "./drawing";
import { DEFAULT_PARAMS, RateParams, Sim, createSim, setCatalyst, setTemperature } from "./rates";

export type Speed = 1 | 2 | 4 | 8;

export interface RateOptions {
  speed: Speed;
  /** Bars of the box's own particles under the Maxwell–Boltzmann curve. */
  histogram: boolean;
  values: boolean;
  question: boolean;
}

const DEFAULT_OPTIONS: RateOptions = { speed: 4, histogram: true, values: true, question: false };

const PARAMS_KEY = "classkernel.reactionRates.params";
const OPTIONS_KEY = "classkernel.reactionRates.options";

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

export interface RateState {
  params: RateParams;
  options: RateOptions;
  /** The run: a mutable simulation the view steps on each frame. */
  sim: Sim;
  seed: number;
  running: boolean;
  /** A run kept dashed to compare with, and its conditions. */
  held: Held | null;
  /** Bumped as the run goes on, so the readouts re-render. */
  version: number;

  setParams(patch: Partial<RateParams>): void;
  setOptions(patch: Partial<RateOptions>): void;
  setRunning(running: boolean): void;
  /** A fresh run in the same conditions. */
  reset(): void;
  hold(label: string): void;
  clearHeld(): void;
  bump(): void;
}

export const useRates = create<RateState>((set, get) => {
  const params = load(PARAMS_KEY, DEFAULT_PARAMS);
  return {
    params,
    options: load(OPTIONS_KEY, DEFAULT_OPTIONS),
    sim: createSim(params, 1),
    seed: 1,
    running: false,
    held: null,
    version: 0,

    setParams: (patch) => {
      const s = get();
      const params = { ...s.params, ...patch };
      // Temperature and the catalyst change the run as it goes; more acid or a different metal starts a new one.
      if (("concentration" in patch && patch.concentration !== s.params.concentration) || ("surface" in patch && patch.surface !== s.params.surface)) {
        set({ params, sim: createSim(params, s.seed + 1), seed: s.seed + 1, running: false });
        return;
      }
      if ("temperature" in patch) setTemperature(s.sim, params.temperature);
      if ("catalyst" in patch) setCatalyst(s.sim, params.catalyst);
      set({ params, version: s.version + 1 });
    },
    setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
    setRunning: (running) => set({ running }),
    reset: () => {
      const s = get();
      set({ sim: createSim(s.params, s.seed + 1), seed: s.seed + 1, running: false, version: s.version + 1 });
    },
    hold: (label) => {
      const s = get();
      set({
        held: {
          label,
          gas: [...s.sim.gas],
          temperature: s.sim.params.temperature,
          concentration: s.sim.params.concentration,
          surface: s.sim.params.surface,
          particles: s.sim.startAcid,
          catalyst: s.sim.params.catalyst,
        },
      });
    },
    clearHeld: () => set({ held: null }),
    bump: () => set({ version: get().version + 1 }),
  };
});

useRates.subscribe((s, before) => {
  if (s.params !== before.params) remember(PARAMS_KEY, s.params);
  if (s.options !== before.options) remember(OPTIONS_KEY, s.options);
});
