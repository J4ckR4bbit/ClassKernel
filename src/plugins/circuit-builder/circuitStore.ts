// The circuit on the bench, kept outside the view so it is still there after
// a trip to another screen, with its undo history. This computer also keeps a
// copy (localStorage), so the circuit and the options come back next time;
// nothing goes into the teacher's data folder.

import { create } from "zustand";
import { Circuit, PartType, Rot, fromFile, toFile } from "./circuit";
import { Precision } from "./drawing";
import { presetById } from "./presets";

export type Mode = "build" | "run";
export type Tool = "select" | "wire" | "erase" | PartType;
export type Selection = { kind: "part"; id: string } | { kind: "wire"; edges: string[] } | null;

export interface CircuitOptions {
  grid: boolean;
  junctionDots: boolean;
  /** Show the current moving round the circuit while it runs. */
  flow: boolean;
  /** Show it as electron flow (− to +) rather than conventional current. */
  electrons: boolean;
  precision: Precision;
  /** Readouts show "?" so the class can predict first. */
  hideReadings: boolean;
}

const DEFAULT_OPTIONS: CircuitOptions = {
  grid: true,
  junctionDots: true,
  flow: true,
  electrons: false,
  precision: "dp2",
  hideReadings: false,
};

const CIRCUIT_KEY = "classkernel.circuit.bench";
const OPTIONS_KEY = "classkernel.circuit.options";
const HISTORY = 100;

function loadCircuit(): Circuit {
  try {
    const saved = fromFile(localStorage.getItem(CIRCUIT_KEY));
    if (saved) return saved;
  } catch {
    // No storage here: start from the example.
  }
  return presetById("series-parallel-lamps")!.make();
}

function loadOptions(): CircuitOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") as Partial<CircuitOptions>;
    const out = { ...DEFAULT_OPTIONS };
    for (const k of Object.keys(DEFAULT_OPTIONS) as Array<keyof CircuitOptions>) {
      if (typeof saved[k] === typeof DEFAULT_OPTIONS[k]) (out as Record<string, unknown>)[k] = saved[k];
    }
    if (out.precision !== "dp2" && out.precision !== "sf3") out.precision = "dp2";
    return out;
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered on this computer; it still works until the app closes.
  }
}

export interface CircuitState {
  circuit: Circuit;
  past: Circuit[];
  future: Circuit[];
  /** The last change's merge key and time: slider drags merge into one undo step. */
  lastKey: string | null;
  lastAt: number;
  mode: Mode;
  tool: Tool;
  /** Which way a new part goes: across (0) or down (1). */
  placeRot: Rot;
  selection: Selection;
  options: CircuitOptions;

  /** Make a change that Undo can take back. Changes with the same `key` within a second are one step. */
  commit(next: Circuit, key?: string): void;
  /** Change the circuit without a new undo step (a fuse blowing as a result of the last change). */
  amend(next: Circuit): void;
  undo(): void;
  redo(): void;
  setMode(mode: Mode): void;
  setTool(tool: Tool): void;
  setPlaceRot(rot: Rot): void;
  select(selection: Selection): void;
  setOptions(patch: Partial<CircuitOptions>): void;
}

export const useCircuit = create<CircuitState>((set, get) => ({
  circuit: loadCircuit(),
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
  mode: "run",
  tool: "select",
  placeRot: 0,
  selection: null,
  options: loadOptions(),

  commit: (next, key) => {
    const s = get();
    if (next === s.circuit) return;
    const now = Date.now();
    const merge = key && key === s.lastKey && now - s.lastAt < 1000;
    set({
      circuit: next,
      past: merge ? s.past : [...s.past, s.circuit].slice(-HISTORY),
      future: [],
      lastKey: key ?? null,
      lastAt: now,
    });
  },
  amend: (next) => set({ circuit: next }),
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ circuit: prev, past: s.past.slice(0, -1), future: [s.circuit, ...s.future], selection: null, lastKey: null });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ circuit: next, past: [...s.past, s.circuit], future: s.future.slice(1), selection: null, lastKey: null });
  },
  setMode: (mode) => set({ mode, tool: "select" }),
  setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : null }),
  setPlaceRot: (placeRot) => set({ placeRot }),
  select: (selection) => set({ selection }),
  setOptions: (patch) => set({ options: { ...get().options, ...patch } }),
}));

// Keep this computer's copy up to date.
useCircuit.subscribe((s, before) => {
  if (s.circuit !== before.circuit) remember(CIRCUIT_KEY, toFile(s.circuit));
  if (s.options !== before.options) remember(OPTIONS_KEY, JSON.stringify(s.options));
});
