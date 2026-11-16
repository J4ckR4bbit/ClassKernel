// The colours a behaviour button can take. Every one is a deep shade that
// carries white text at 4,5:1 or better, so the whole set reads as one family
// — no button needs black text and no colour is too pale to read on the board.

export const BEHAVIOUR_COLOURS: Array<{ name: string; hex: string }> = [
  { name: "Green", hex: "#1e7b46" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Blue", hex: "#1d63b0" },
  { name: "Indigo", hex: "#4338ca" },
  { name: "Purple", hex: "#7e3faf" },
  { name: "Pink", hex: "#b02a6b" },
  { name: "Red", hex: "#c0322b" },
  { name: "Orange", hex: "#b4500d" },
  { name: "Amber", hex: "#8f6206" },
  { name: "Slate", hex: "#4a5868" },
];

const byName = (name: string) => BEHAVIOUR_COLOURS.find((c) => c.name === name)!.hex;

/** Named shortcuts for the defaults. */
export const BC = {
  green: byName("Green"),
  teal: byName("Teal"),
  blue: byName("Blue"),
  indigo: byName("Indigo"),
  purple: byName("Purple"),
  pink: byName("Pink"),
  red: byName("Red"),
  orange: byName("Orange"),
  amber: byName("Amber"),
  slate: byName("Slate"),
};

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [v >> 16, (v >> 8) & 0xff, v & 0xff];
}

function hsl([r, g, b]: [number, number, number]): [number, number, number] {
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

/**
 * The palette colour nearest to any hex — how colours chosen before the
 * palette existed are carried over. Matching is by hue, so a colour keeps its
 * family however pale or dark it was (a light amber stays amber rather than
 * turning orange); lightness only breaks near-ties. Greys, near-black and
 * near-white become Slate, as does anything unreadable.
 */
export function snapBehaviourColour(hex: string): string {
  const c = rgb(hex);
  if (!c) return BC.slate;
  const exact = BEHAVIOUR_COLOURS.find((p) => p.hex === `#${hex.trim().replace(/^#/, "").toLowerCase()}`);
  if (exact) return exact.hex;
  const [h, s, l] = hsl(c);
  if (s < 0.15 || l < 0.08 || l > 0.95) return BC.slate;
  let best = BC.slate;
  let bestD = Infinity;
  for (const p of BEHAVIOUR_COLOURS) {
    if (p.hex === BC.slate) continue;
    const [ph, , pl] = hsl(rgb(p.hex)!);
    const dh = Math.min(Math.abs(h - ph), 360 - Math.abs(h - ph));
    const d = dh + 10 * Math.abs(l - pl);
    if (d < bestD) {
      bestD = d;
      best = p.hex;
    }
  }
  return best;
}
