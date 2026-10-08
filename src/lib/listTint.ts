// A very light colour for each row of a long list, running from blue at the
// top through green, yellow and orange to red for the last row, so a glance at
// the colour shows how far down the list you are (used on the marking screens).

/** Hues of the stops, evenly spaced down the list: blue, green, yellow, orange, red. */
const HUES = [215, 130, 52, 30, 4];

/** The tint for row `index` (0-based) of `count` rows, as a CSS colour. */
export function positionTint(index: number, count: number): string {
  const t = count <= 1 ? 0 : Math.min(1, Math.max(0, index / (count - 1)));
  const along = t * (HUES.length - 1);
  const k = Math.min(HUES.length - 2, Math.floor(along));
  const hue = HUES[k] + (HUES[k + 1] - HUES[k]) * (along - k);
  return `hsl(${Math.round(hue)} 85% 92%)`;
}
