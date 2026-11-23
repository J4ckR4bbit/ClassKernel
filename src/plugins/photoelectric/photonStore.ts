// The photoelectric bench and the spectra, kept outside the view so leaving the
// screen doesn't lose the set-up or the lines made so far. This computer
// remembers the set-up and the display options (localStorage); nothing goes
// into the data folder.

import { create } from "zustand";
import type { EnergyUnit, GraphKind } from "./drawing";
import { CUSTOM_METAL, ELEMENTS, METALS, frequencyOf, metalById } from "./photons";

export type Tab = "photoelectric" | "spectra";
export type SpectraMode = "hydrogen" | "elements";

export interface PhotoParams {
  metalId: string;
  /** W₀ for "Your own", eV. */
  customW0: number;
  /** The light's frequency, Hz. */
  frequency: number;
  setBy: "wavelength" | "frequency";
  /** Photons a second, % of full. */
  intensity: number;
  /** A second metal's line on the graph, or "" for none. */
  compareId: string;
}

export interface PhotoOptions {
  graph: GraphKind;
  unit: EnergyUnit;
  values: boolean;
  extend: boolean;
  gradient: boolean;
  question: boolean;
  toScale: boolean;
  energies: boolean;
  /** Elements whose fingerprints are shown. */
  shown: string[];
}

export const DEFAULT_PARAMS: PhotoParams = {
  metalId: "sodium",
  customW0: 2.3,
  frequency: frequencyOf(450),
  setBy: "wavelength",
  intensity: 60,
  compareId: "",
};

const DEFAULT_OPTIONS: PhotoOptions = {
  graph: "ek-f",
  unit: "J",
  values: true,
  extend: true,
  gradient: false,
  question: false,
  toScale: false,
  energies: true,
  shown: ELEMENTS.map((e) => e.id),
};

const PARAMS_KEY = "classkernel.photoelectric.params";
const OPTIONS_KEY = "classkernel.photoelectric.options";

function load<T extends object>(key: string, fallback: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<T>;
    const out = { ...fallback };
    for (const k of Object.keys(fallback) as Array<keyof T>) {
      const v = saved[k];
      if (Array.isArray(fallback[k])) {
        if (Array.isArray(v)) out[k] = v as T[keyof T];
      } else if (typeof v === typeof fallback[k] && (typeof v !== "number" || Number.isFinite(v))) out[k] = v as T[keyof T];
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

/** The metal's name and work function (eV), "Your own" included. */
export function metalOf(p: PhotoParams): { name: string; workFunction: number } {
  if (p.metalId === CUSTOM_METAL) return { name: "Metal X", workFunction: p.customW0 };
  const m = metalById(p.metalId) ?? METALS[2];
  return { name: m.name, workFunction: m.workFunction };
}

export interface PhotoState {
  tab: Tab;
  params: PhotoParams;
  options: PhotoOptions;
  mode: SpectraMode;
  /** The hydrogen electron's level, and the falls made: "from-to" → how many. */
  electron: number;
  last: { from: number; to: number } | null;
  excite: { from: number; to: number } | null;
  falls: Record<string, number>;
  /** When the last photon was given out (performance.now()), for its flight. */
  photonAt: number;
  discharge: boolean;
  mystery: string | null;
  revealed: boolean;

  setTab(tab: Tab): void;
  setParams(patch: Partial<PhotoParams>): void;
  setOptions(patch: Partial<PhotoOptions>): void;
  setMode(mode: SpectraMode): void;
  /** Move the electron to level n: up absorbs energy, down gives out a photon. */
  moveTo(n: number): void;
  /** Put the electron on `from` and let it fall to `to`. */
  fall(from: number, to: number): void;
  clearSpectrum(): void;
  setDischarge(on: boolean): void;
  newMystery(): void;
  reveal(): void;
}

export const usePhotons = create<PhotoState>((set, get) => ({
  tab: "photoelectric",
  params: load(PARAMS_KEY, DEFAULT_PARAMS),
  options: load(OPTIONS_KEY, DEFAULT_OPTIONS),
  mode: "hydrogen",
  electron: 1,
  last: null,
  excite: null,
  falls: {},
  photonAt: 0,
  discharge: false,
  mystery: null,
  revealed: false,

  setTab: (tab) => set({ tab }),
  setParams: (patch) => set({ params: { ...get().params, ...patch } }),
  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
  setMode: (mode) => set({ mode }),
  moveTo: (n) => {
    const from = get().electron;
    if (n === from) return;
    if (n > from) set({ electron: n, excite: { from, to: n } });
    else get().fall(from, n);
  },
  fall: (from, to) => {
    const key = `${from}-${to}`;
    const falls = { ...get().falls, [key]: (get().falls[key] ?? 0) + 1 };
    set({ electron: to, last: { from, to }, excite: null, falls, photonAt: performance.now() });
  },
  clearSpectrum: () => set({ falls: {}, last: null, excite: null, electron: 1 }),
  setDischarge: (on) => set({ discharge: on }),
  newMystery: () => {
    const others = ELEMENTS.filter((e) => e.id !== get().mystery);
    set({ mystery: others[Math.floor(Math.random() * others.length)].id, revealed: false });
  },
  reveal: () => set({ revealed: true }),
}));

usePhotons.subscribe((s, before) => {
  if (s.params !== before.params) remember(PARAMS_KEY, s.params);
  if (s.options !== before.options) remember(OPTIONS_KEY, s.options);
});
