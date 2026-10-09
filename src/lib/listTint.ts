// Very light colours for the marking screens. Down a long list each row runs
// from blue at the top through green, yellow and orange to red for the last
// row, so a glance at the colour shows how far down the list you are. The Rank
// column runs green for the top rank through yellow and orange to red for the
// lowest.

/** Hues of the list stops, evenly spaced down the list: blue, green, yellow, orange, red. */
const POSITION_HUES = [215, 130, 52, 30, 4];
/** Hues of the rank stops, top to lowest: green, yellow, orange, red. */
const RANK_HUES = [130, 52, 30, 4];

/** The tint a fraction `t` (0 to 1) of the way along the stops `hues`, as a CSS colour. */
function tintAlong(t: number, hues: number[]): string {
  const along = Math.min(1, Math.max(0, t)) * (hues.length - 1);
  const k = Math.min(hues.length - 2, Math.floor(along));
  const hue = hues[k] + (hues[k + 1] - hues[k]) * (along - k);
  return `hsl(${Math.round(hue)} 85% 92%)`;
}

/** The tint for row `index` (0-based) of `count` rows, as a CSS colour. */
export function positionTint(index: number, count: number): string {
  return tintAlong(count <= 1 ? 0 : index / (count - 1), POSITION_HUES);
}

/**
 * The tint for a `rank` among ranks running from `best` (green) to `worst` (red).
 * Ranks may be fractional (tied students share the average of their places).
 */
export function rankTint(rank: number, best: number, worst: number): string {
  return tintAlong(worst > best ? (rank - best) / (worst - best) : 0, RANK_HUES);
}
