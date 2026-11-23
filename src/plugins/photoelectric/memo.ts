// The working a memo would show: for the light on the metal, and for an
// electron's fall between hydrogen's energy levels. Worked with the unrounded
// values and written to three significant figures, with the data sheet's
// constants.

import type { MemoStep } from "../shared/SimControls";
import { formatFixed, formatNumber, superscript } from "../numbers";
import {
  C,
  EV,
  H,
  ME,
  Transition,
  band,
  colourName,
  electronsPerSecond,
  emission,
  levelEnergy,
  photocurrent,
  seriesName,
  thresholdFrequency,
  wavelengthOf,
} from "./photons";

/** Scientific notation to `sf` significant figures, keeping the zeros: 4,40 × 10⁻¹⁹. */
export function sci(v: number, sf = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  let e = Math.floor(Math.log10(a));
  if (Number((a / 10 ** e).toFixed(sf - 1)) >= 10) e += 1;
  return `${sign}${formatFixed(a / 10 ** e, sf - 1)} × 10${superscript(e)}`;
}

/** A value to 3 significant figures in plain notation (655, 2,75, 0,450). */
export function sig3(v: number): string {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  return formatFixed(Number(v.toPrecision(3)), Math.max(0, 2 - e)).replace(/^-/, "−");
}

/** An energy in eV to two decimals (2,75 eV); a level's value as the papers print it (−3,4). */
export const ev2 = (v: number) => formatFixed(v, 2).replace(/^-/, "−");
export const levelText = (v: number) => formatNumber(v, 2).replace(/^-/, "−");

export interface LightSetting {
  frequency: number;
  /** How the light was set: by wavelength (nm) or frequency (Hz). */
  setBy: "wavelength" | "frequency";
  workFunction: number;
  metalName: string;
  intensity: number;
}

export function photoMemo(s: LightSetting): MemoStep[] {
  const steps: MemoStep[] = [];
  const f = s.frequency;
  const lambda = wavelengthOf(f);
  const e = emission(f, s.workFunction);
  const f0 = thresholdFrequency(s.workFunction);

  steps.push({
    head: "The light",
    lines:
      s.setBy === "wavelength"
        ? [`λ = ${sig3(lambda)} nm = ${sig3(lambda)} × 10⁻⁹ m`, `f = c/λ = (3 × 10⁸)/(${sig3(lambda)} × 10⁻⁹) = ${sci(f)} Hz`]
        : [`f = ${sci(f)} Hz`, `λ = c/f = (3 × 10⁸)/(${sci(f)}) = ${sci(lambda * 1e-9)} m = ${sig3(lambda)} nm`],
  });
  steps.push({
    head: "Energy of a photon",
    lines: [`E = hf = (6,6 × 10⁻³⁴)(${sci(f)}) = ${sci(e.energy)} J`, `In electron-volts: (${sci(e.energy)})/(1,6 × 10⁻¹⁹) = ${ev2(e.energy / EV)} eV`],
  });
  steps.push({
    head: "Work function",
    lines: [`W_0 = ${formatNumber(s.workFunction, 2)} eV = (${formatNumber(s.workFunction, 2)})(1,6 × 10⁻¹⁹) = ${sci(e.workFunction)} J (${s.metalName})`],
  });
  steps.push({
    head: "Threshold",
    lines: [
      `f_0 = W_0/h = (${sci(e.workFunction)})/(6,6 × 10⁻³⁴) = ${sci(f0)} Hz`,
      `λ_0 = c/f_0 = ${sig3(wavelengthOf(f0))} nm: the longest wavelength that ejects electrons from ${s.metalName.toLowerCase()}`,
    ],
  });
  if (!e.emitted) {
    steps.push({
      head: "Emitted?",
      lines: [
        `No. E = ${sci(e.energy)} J is less than W_0 = ${sci(e.workFunction)} J (f < f_0).`,
        "No electrons are emitted, however intense the light: each electron takes the energy of one photon, and one photon is not enough.",
      ],
    });
    return steps;
  }
  steps.push({
    head: "Emitted?",
    lines: [
      Math.abs(e.ekMax) < e.workFunction * 1e-6
        ? "Just: E = W_0 (f = f_0). Electrons are freed with no kinetic energy to spare."
        : `Yes. E = ${sci(e.energy)} J is more than W_0 = ${sci(e.workFunction)} J (f > f_0), so photoelectrons are emitted.`,
    ],
  });
  steps.push({
    head: "Maximum kinetic energy",
    lines: [`E = W_0 + E_{K(max)}`, `E_{K(max)} = E − W_0 = ${sci(e.energy)} − ${sci(e.workFunction)} = ${sci(e.ekMax)} J (${ev2(e.ekMax / EV)} eV)`],
  });
  if (e.ekMax > 0) {
    steps.push({
      head: "Maximum speed",
      lines: [`E_{K(max)} = ½mv_{max}²`, `v_{max} = √(2E_{K(max)}/m) = √(2(${sci(e.ekMax)})/(9,1 × 10⁻³¹)) = ${sci(e.vMax)} m·s⁻¹`],
    });
  }
  const n = electronsPerSecond(s.intensity, e);
  steps.push({
    head: "How many",
    lines: [
      `At ${formatNumber(s.intensity, 0)} % intensity: ${sci(n)} electrons a second, so I = (${sci(n)})(1,6 × 10⁻¹⁹) = ${formatFixed(photocurrent(s.intensity, e) * 1e6, 1)} µA.`,
      "More intense light means more photons a second, so more electrons a second — but each still has the same E_{K(max)}.",
    ],
  });
  return steps;
}

export function transitionMemo(t: Transition): MemoStep[] {
  const upper = levelEnergy(t.from);
  const lower = levelEnergy(t.to);
  const b = band(t.wavelength);
  return [
    {
      head: "The fall",
      lines: [
        `The electron moves from the n = ${t.from} energy level (${levelText(upper)} eV) to the lower n = ${t.to} level (${levelText(lower)} eV). The energy it loses is given out as one photon.`,
      ],
    },
    {
      head: "Energy of the photon",
      lines: [
        `ΔE = E_${t.from} − E_${t.to} = (${levelText(upper)}) − (${levelText(lower)}) = ${ev2(t.energyEv)} eV`,
        `ΔE = (${ev2(t.energyEv)})(1,6 × 10⁻¹⁹) = ${sci(t.energyJ)} J`,
      ],
    },
    { head: "Frequency", lines: [`E = hf, so f = E/h = (${sci(t.energyJ)})/(6,6 × 10⁻³⁴) = ${sci(t.frequency)} Hz`] },
    {
      head: "Wavelength",
      lines: [
        `λ = c/f = (3 × 10⁸)/(${sci(t.frequency)}) = ${sci(t.wavelength * 1e-9)} m = ${sig3(t.wavelength)} nm`,
        `${b === "visible" ? `Visible: ${colourName(t.wavelength)} light` : b === "ultraviolet" ? "Ultraviolet: not visible" : "Infrared: not visible"} — ${seriesName(t.to)}.`,
      ],
    },
  ];
}

/** The constants the memo uses, for the note under it. */
export const CONSTANTS_NOTE = `h = 6,6 × 10⁻³⁴ J·s, c = 3 × 10⁸ m·s⁻¹, mₑ = 9,1 × 10⁻³¹ kg and 1 eV = 1,6 × 10⁻¹⁹ J, as on the data sheet.`;

// Keep the constants and the note in step: a test reads both.
export const CONSTANTS = { H, C, ME, EV };
