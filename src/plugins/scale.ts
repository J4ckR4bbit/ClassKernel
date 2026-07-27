// Axis scales a learner can read: round steps, with the data comfortably inside.
// Shared by the plugins that draw graphs.

import { formatNumber } from "./numbers";

export interface Scale {
  min: number;
  max: number;
  step: number;
}

/**
 * An axis a learner can read: round steps of 1, 2 or 5 (times a power of ten),
 * with the data comfortably inside.
 */
export function niceScale(dataMin: number, dataMax: number, includeZero: boolean, targetTicks = 6): Scale {
  let min = includeZero ? Math.min(0, dataMin) : dataMin;
  let max = includeZero ? Math.max(0, dataMax) : dataMax;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.5 };
  if (min === max) {
    // A single value, or a flat run of them: give it something to sit in.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.5 : 1;
    min -= pad;
    max += pad;
  }

  const rough = (max - min) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  // Rounded generously (1,5 / 3 / 7 rather than 1 / 2 / 5) so an axis carries
  // enough ticks to read a value off between them.
  const step = magnitude * (normalised <= 1.5 ? 1 : normalised <= 3 ? 2 : normalised <= 7 ? 5 : 10);
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

/** Every tick value on a scale, rounded off the accumulated float error. */
export function tickValues(scale: Scale): number[] {
  const out: number[] = [];
  const count = Math.round((scale.max - scale.min) / scale.step);
  for (let i = 0; i <= count; i++) {
    out.push(Number((scale.min + i * scale.step).toPrecision(12)));
  }
  return out;
}

/** Tick label with just enough decimals for the step size. */
export function formatTick(value: number, step: number): string {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) + 0.0001));
  return formatNumber(value, Math.min(decimals, 6));
}
