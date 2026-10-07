// Colour helpers shared by the room layout designer and the teaching strip.
// Both pick from the same calm pastels; the strip turns a table's pastel into
// a tinted card with a stronger accent of the same hue for its edge and title.

/** Preset fills: one soft pastel per hue so a colour-coded room stays calm. */
export const PASTEL_PRESETS: Array<{ name: string; hex: string }> = [
  { name: "Rose", hex: "#f7d9e0" },
  { name: "Peach", hex: "#fde3cf" },
  { name: "Butter", hex: "#fbf0c4" },
  { name: "Mint", hex: "#d7ecda" },
  { name: "Sky", hex: "#d6e8f7" },
  { name: "Lilac", hex: "#e5def4" },
];

/** The colour a table gets when none is chosen: the pastels in turn. */
export function autoTableColour(index: number): string {
  const n = PASTEL_PRESETS.length;
  return PASTEL_PRESETS[((index % n) + n) % n].hex;
}

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [v >> 16, (v >> 8) & 0xff, v & 0xff];
}

const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return 1;
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export interface TableTint {
  /** Card background — the chosen colour itself. */
  bg: string;
  /** Edge stripe and heading: the same hue, strong enough to read on the card. */
  accent: string;
}

/**
 * A table's card colours from its fill. The accent keeps the fill's hue but is
 * stepped darker (or lighter, on a dark fill) until the heading reads at 4,5:1
 * against the card — so a pale custom colour still gets a legible title.
 */
export function tableTint(fill: string): TableTint {
  const rgb = parseHex(fill);
  if (!rgb) return tableTint(PASTEL_PRESETS[0].hex);
  const bg = toHex(rgb);
  const [h, s] = rgbToHsl(rgb);
  const dark = luminance(rgb) < 0.18;
  // A greyish fill keeps a grey accent; a coloured one gets a confident tone.
  const sat = s < 0.08 ? s : Math.max(s, 0.5);
  for (let i = 0; i <= 20; i++) {
    const l = dark ? 0.7 + i * 0.015 : 0.42 - i * 0.02;
    const accent = toHex(hslToRgb(h, sat, Math.min(1, Math.max(0, l))));
    if (contrastRatio(accent, bg) >= 4.5) return { bg, accent };
  }
  return { bg, accent: dark ? "#ffffff" : "#000000" };
}
