// The titration in progress, kept outside the view so leaving the screen
// mid-titration doesn't empty the burette.

import { create } from "zustand";

/** A class burette. */
export const BURETTE_CAPACITY = 50;

export interface Reading {
  volume: number;
  pH: number;
}

export interface TitrationState {
  buretteSolute: string;
  buretteConcentration: number;
  flaskSolute: string;
  flaskConcentration: number;
  flaskVolume: number;
  /** An indicator id, "universal", or null for none. */
  indicator: string | null;
  autoMix: boolean;
  /** cm³ run in from the burette. */
  added: number;
  /** The volume up to which the flask has been mixed. */
  stirredAt: number;
  tapOpen: boolean;
  /** cm³ per second with the tap open. */
  tapRate: number;
  /** The flask's concentration is the unknown the class must find. */
  hideFlaskConcentration: boolean;
  showWholeCurve: boolean;
  readings: Reading[];
  /** Bumped on each addition, so the view can play a drop. */
  drops: number;

  set(patch: Partial<TitrationState>): void;
  add(volume: number): void;
  stir(): void;
  swap(): void;
  record(pH: number): void;
  removeReading(index: number): void;
  /** Refill the burette and start again with the same solutions. */
  reset(): void;
}

const FRESH = {
  added: 0,
  stirredAt: 0,
  tapOpen: false,
  readings: [] as Reading[],
  drops: 0,
};

export const useTitration = create<TitrationState>((set, get) => ({
  buretteSolute: "naoh",
  buretteConcentration: 0.1,
  flaskSolute: "hcl",
  flaskConcentration: 0.1,
  flaskVolume: 25,
  indicator: "phenolphthalein",
  autoMix: true,
  tapRate: 1,
  hideFlaskConcentration: false,
  showWholeCurve: false,
  ...FRESH,

  set: (patch) => set(patch),
  add: (volume) => {
    const { added, autoMix, stirredAt } = get();
    const next = Math.min(BURETTE_CAPACITY, added + Math.max(0, volume));
    if (next === added) {
      set({ tapOpen: false });
      return;
    }
    set({
      added: next,
      stirredAt: autoMix ? next : stirredAt,
      drops: get().drops + 1,
      tapOpen: next >= BURETTE_CAPACITY ? false : get().tapOpen,
    });
  },
  stir: () => set({ stirredAt: get().added }),
  swap: () => {
    const s = get();
    set({
      buretteSolute: s.flaskSolute,
      buretteConcentration: s.flaskConcentration,
      flaskSolute: s.buretteSolute,
      flaskConcentration: s.buretteConcentration,
      ...FRESH,
    });
  },
  record: (pH) => set({ readings: [...get().readings, { volume: get().added, pH }] }),
  removeReading: (index) => set({ readings: get().readings.filter((_, i) => i !== index) }),
  reset: () => set({ ...FRESH }),
}));
