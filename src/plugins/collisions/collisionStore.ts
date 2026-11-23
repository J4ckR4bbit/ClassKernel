// The collision on the track, kept outside the view so leaving the screen
// doesn't lose the set-up or where the run had got to. This computer remembers
// the set-up and the display options (localStorage); nothing goes into the
// data folder.

import { create } from "zustand";
import { CollParams, DEFAULT_PARAMS, EXAMPLES } from "./collisions";
import type { Positive } from "./memo";

export interface CollOptions {
  positive: Positive;
  /** Slow the run down through the contact, so the class can see it. */
  slowMo: boolean;
  /** The average force on B, dashed over its F–t curve. */
  average: boolean;
  values: boolean;
  question: boolean;
}

const DEFAULT_OPTIONS: CollOptions = { positive: "right", slowMo: true, average: true, values: true, question: false };

const PARAMS_KEY = "classkernel.collisions.params";
const OPTIONS_KEY = "classkernel.collisions.options";

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

export interface CollState {
  params: CollParams;
  options: CollOptions;
  /** The example last loaded, or "" once anything is changed. */
  example: string;
  /** Time into the run, s. */
  t: number;
  running: boolean;
  /** An earlier contact's force on B, kept dashed to compare. */
  held: { dp: number; dt: number; label: string } | null;

  setParams(patch: Partial<CollParams>): void;
  setOptions(patch: Partial<CollOptions>): void;
  loadExample(id: string): void;
  setT(t: number): void;
  setRunning(running: boolean): void;
  reset(): void;
  hold(dp: number, dt: number, label: string): void;
  clearHeld(): void;
}

export const useCollisions = create<CollState>((set, get) => ({
  params: load(PARAMS_KEY, DEFAULT_PARAMS),
  options: load(OPTIONS_KEY, DEFAULT_OPTIONS),
  example: "",
  t: 0,
  running: false,
  held: null,

  // Any change starts the run again from the beginning.
  setParams: (patch) => set({ params: { ...get().params, ...patch }, example: "", t: 0, running: false }),
  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
  loadExample: (id) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (ex) set({ params: { ...ex.params }, example: id, t: 0, running: false, held: null });
  },
  setT: (t) => set({ t }),
  setRunning: (running) => set({ running }),
  reset: () => set({ t: 0, running: false }),
  hold: (dp, dt, label) => set({ held: { dp, dt, label } }),
  clearHeld: () => set({ held: null }),
}));

useCollisions.subscribe((s, before) => {
  if (s.params !== before.params) remember(PARAMS_KEY, s.params);
  if (s.options !== before.options) remember(OPTIONS_KEY, s.options);
});
