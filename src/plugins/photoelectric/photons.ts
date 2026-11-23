// Photons and electrons: the photoelectric effect and atomic emission spectra,
// as the SAG (Section G) has them.
//
// The constants are the IEB data sheet's — h = 6,6 × 10⁻³⁴ J·s,
// c = 3 × 10⁸ m·s⁻¹, mₑ = 9,1 × 10⁻³¹ kg and 1 eV = 1,6 × 10⁻¹⁹ J — so every
// number the tool shows is the one a candidate working from the data sheet
// would get.

export const H = 6.6e-34;
export const C = 3e8;
export const ME = 9.1e-31;
export const EV = 1.6e-19;

// ---------- light ----------

/** f = c / λ, with λ in nm. */
export function frequencyOf(wavelengthNm: number): number {
  return C / (wavelengthNm * 1e-9);
}

/** λ = c / f, in nm. */
export function wavelengthOf(frequency: number): number {
  return (C / frequency) * 1e9;
}

/** E = hf, in J. */
export function photonEnergy(frequency: number): number {
  return H * frequency;
}

export type Band = "ultraviolet" | "visible" | "infrared";

/** Where a wavelength sits: visible light taken as 400–700 nm, as the course does. */
export function band(wavelengthNm: number): Band {
  if (wavelengthNm < 400) return "ultraviolet";
  if (wavelengthNm > 700) return "infrared";
  return "visible";
}

/** A colour name for visible light; the band's name otherwise. */
export function colourName(wavelengthNm: number): string {
  const b = band(wavelengthNm);
  if (b !== "visible") return b;
  if (wavelengthNm < 450) return "violet";
  if (wavelengthNm < 495) return "blue";
  if (wavelengthNm < 570) return "green";
  if (wavelengthNm < 590) return "yellow";
  if (wavelengthNm < 620) return "orange";
  return "red";
}

/**
 * The colour light of this wavelength looks, for drawing (after Bruton's
 * approximation), fading at the ends of the visible range. Outside it, a grey
 * that says "you can't see this": lilac-grey for UV, brown-grey for IR.
 */
export function wavelengthColour(wavelengthNm: number): string {
  const l = wavelengthNm;
  if (l < 380) return "#9e8fb8";
  if (l > 780) return "#a1887f";
  let r = 0;
  let g = 0;
  let b = 0;
  if (l < 440) {
    r = -(l - 440) / (440 - 380);
    b = 1;
  } else if (l < 490) {
    g = (l - 440) / (490 - 440);
    b = 1;
  } else if (l < 510) {
    g = 1;
    b = -(l - 510) / (510 - 490);
  } else if (l < 580) {
    r = (l - 510) / (580 - 510);
    g = 1;
  } else if (l < 645) {
    r = 1;
    g = -(l - 645) / (645 - 580);
  } else r = 1;
  // Dimmer towards the edges of what the eye sees.
  const f = l < 420 ? 0.3 + (0.7 * (l - 380)) / 40 : l > 700 ? 0.3 + (0.7 * (780 - l)) / 80 : 1;
  const c = (v: number) => Math.round(255 * Math.pow(v * f, 0.8));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

// ---------- the photoelectric effect ----------

export interface Metal {
  id: string;
  name: string;
  /** W₀, in eV. */
  workFunction: number;
}

/**
 * Typical work functions, rounded as the papers' tables round them. Tables in
 * papers differ a little (potassium 2,24 or 2,30 eV); "Your own" takes the
 * paper's value.
 */
export const METALS: Metal[] = [
  { id: "caesium", name: "Caesium", workFunction: 2.1 },
  { id: "potassium", name: "Potassium", workFunction: 2.3 },
  { id: "sodium", name: "Sodium", workFunction: 2.4 },
  { id: "calcium", name: "Calcium", workFunction: 2.9 },
  { id: "magnesium", name: "Magnesium", workFunction: 3.7 },
  { id: "aluminium", name: "Aluminium", workFunction: 4.1 },
  { id: "zinc", name: "Zinc", workFunction: 4.3 },
  { id: "tungsten", name: "Tungsten", workFunction: 4.5 },
  { id: "copper", name: "Copper", workFunction: 4.7 },
  { id: "gold", name: "Gold", workFunction: 5.1 },
  { id: "platinum", name: "Platinum", workFunction: 6.4 },
];

export const CUSTOM_METAL = "custom";

export function metalById(id: string): Metal | undefined {
  return METALS.find((m) => m.id === id);
}

/** f₀ = W₀ / h, with W₀ in eV. */
export function thresholdFrequency(workFunctionEv: number): number {
  return (workFunctionEv * EV) / H;
}

/** The longest wavelength that still ejects electrons, λ₀ = c / f₀, in nm. */
export function thresholdWavelength(workFunctionEv: number): number {
  return wavelengthOf(thresholdFrequency(workFunctionEv));
}

export interface Emission {
  /** Photon energy, J. */
  energy: number;
  /** W₀, J. */
  workFunction: number;
  /** f₀, Hz. */
  threshold: number;
  /** E ≥ W₀: electrons are emitted. */
  emitted: boolean;
  /** Eₖ(max) = E − W₀, J — zero when nothing is emitted. */
  ekMax: number;
  /** v_max from Eₖ(max) = ½mv², m·s⁻¹. */
  vMax: number;
}

/** What light of this frequency does to a metal of this work function (in eV). */
export function emission(frequency: number, workFunctionEv: number): Emission {
  const energy = photonEnergy(frequency);
  const w = workFunctionEv * EV;
  // Equal to within rounding counts as at the threshold: emitted, with no kinetic energy to spare.
  const emitted = energy >= w * (1 - 1e-9);
  const ekMax = emitted ? Math.max(0, energy - w) : 0;
  return { energy, workFunction: w, threshold: thresholdFrequency(workFunctionEv), emitted, ekMax, vMax: Math.sqrt((2 * ekMax) / ME) };
}

/**
 * Electrons ejected a second at this intensity. The model: intensity is the
 * number of photons arriving each second (100 % is 6,25 × 10¹³ a second, so
 * 10 µA), and each photon with enough energy frees one electron.
 */
export const PHOTONS_AT_FULL = 6.25e13;

export function electronsPerSecond(intensityPercent: number, e: Emission): number {
  return e.emitted ? (PHOTONS_AT_FULL * intensityPercent) / 100 : 0;
}

/** The photocurrent, A: I = (electrons a second) × e. */
export function photocurrent(intensityPercent: number, e: Emission): number {
  return electronsPerSecond(intensityPercent, e) * EV;
}

// ---------- emission spectra ----------

/**
 * Hydrogen's energy levels, in eV, as the papers' energy-level diagrams give
 * them (Eₙ = −13,6 / n², to two decimals). Index 0 is n = 1.
 */
export const HYDROGEN_LEVELS = [-13.6, -3.4, -1.51, -0.85, -0.54, -0.38];

export function levelEnergy(n: number): number {
  return HYDROGEN_LEVELS[n - 1];
}

export interface Transition {
  from: number;
  to: number;
  /** ΔE = E(from) − E(to), eV: positive for a fall, when a photon is emitted. */
  energyEv: number;
  energyJ: number;
  frequency: number;
  wavelength: number;
}

/** An electron falling from level `from` to the lower level `to`, and the photon it gives out. */
export function transition(from: number, to: number): Transition {
  const energyEv = levelEnergy(from) - levelEnergy(to);
  const energyJ = energyEv * EV;
  const frequency = energyJ / H;
  return { from, to, energyEv, energyJ, frequency, wavelength: wavelengthOf(frequency) };
}

/** The series a fall belongs to, by where it ends. */
export function seriesName(to: number): string {
  return to === 1 ? "Lyman series (ultraviolet)" : to === 2 ? "Balmer series (mostly visible)" : to === 3 ? "Paschen series (infrared)" : to === 4 ? "Brackett series (infrared)" : "Pfund series (infrared)";
}

/** Every fall between the levels drawn: the whole hydrogen spectrum the tool can show. */
export function allTransitions(levels = HYDROGEN_LEVELS.length): Transition[] {
  const out: Transition[] = [];
  for (let from = 2; from <= levels; from++) for (let to = 1; to < from; to++) out.push(transition(from, to));
  return out;
}

export interface ElementSpectrum {
  id: string;
  name: string;
  /** The colour the discharge tube glows. */
  glow: string;
  /** Strong visible lines, nm, with a relative brightness 0–1 (measured values). */
  lines: Array<[number, number]>;
}

/**
 * Line spectra of the gases in common discharge tubes: the strong visible lines,
 * measured wavelengths (NIST). A fingerprint for each element.
 */
export const ELEMENTS: ElementSpectrum[] = [
  { id: "hydrogen", name: "Hydrogen", glow: "#c48fd6", lines: [[656.3, 1], [486.1, 0.6], [434.0, 0.35], [410.2, 0.25]] },
  {
    id: "helium",
    name: "Helium",
    glow: "#f3c6a5",
    lines: [[447.1, 0.5], [471.3, 0.25], [492.2, 0.3], [501.6, 0.5], [587.6, 1], [667.8, 0.5], [706.5, 0.35]],
  },
  {
    id: "neon",
    name: "Neon",
    glow: "#ff6a3d",
    lines: [
      [540.1, 0.3], [585.2, 0.9], [588.2, 0.5], [594.5, 0.6], [597.6, 0.3], [603.0, 0.4], [607.4, 0.5], [609.6, 0.6], [614.3, 0.8],
      [616.4, 0.4], [621.7, 0.5], [626.6, 0.6], [633.4, 0.7], [638.3, 0.7], [640.2, 1], [650.7, 0.7], [659.9, 0.5], [667.8, 0.5], [692.9, 0.6],
    ],
  },
  { id: "sodium", name: "Sodium", glow: "#ffb52e", lines: [[589.0, 1], [589.6, 0.9], [568.8, 0.25], [615.4, 0.2], [498.3, 0.15]] },
  { id: "mercury", name: "Mercury", glow: "#b7c7ff", lines: [[404.7, 0.6], [435.8, 1], [546.1, 0.9], [577.0, 0.5], [579.1, 0.5]] },
];

export function elementById(id: string): ElementSpectrum | undefined {
  return ELEMENTS.find((e) => e.id === id);
}
