// A very light colour for each row of a long list, running from blue at the
// top through green, yellow and orange to red for the last row, so a glance at
// the colour shows how far down the list you are (used on the marking screens).
// The same gradient colours the Rank column: blue for the top rank to red for
// the lowest.

/** Hues of the stops, evenly spaced down the list: blue, green, yellow, orange, red. */
const HUES = [215, 130, 52, 30, 4];

/** The tint a fraction `t` of the way along the gradient (0 = blue, 1 = red), as a CSS colour. */
export function gradientTint(t: number): string {
  const along = Math.min(1, Math.max(0, t)) * (HUES.length - 1);
  const k = Math.min(HUES.length - 2, Math.floor(along));
  const hue = HUES[k] + (HUES[k + 1] - HUES[k]) * (along - k);
  return `hsl(${Math.round(hue)} 85% 92%)`;
}

/** The tint for row `index` (0-based) of `count` rows, as a CSS colour. */
export function positionTint(index: number, count: number): string {
  return gradientTint(count <= 1 ? 0 : index / (count - 1));
}

/**
 * The tint for a `rank` among ranks running from `best` (blue) to `worst` (red).
 * Ranks may be fractional (tied students share the average of their places).
 */
export function rankTint(rank: number, best: number, worst: number): string {
  return gradientTint(worst > best ? (rank - best) / (worst - best) : 0);
}
