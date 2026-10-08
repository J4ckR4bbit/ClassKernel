import { useId } from "react";
import { HISTORY_MS, LevelSample, WARN_BAND } from "./meter";

// The noise level over the last few minutes, under the big reading. The line
// takes the zone colour of the height it's at (green, amber within 5 dB of the
// limit, red over it) and the limit is a dashed line, so the class can see how
// long the room has been loud, not only how loud it is now.

const ZONE = { quiet: "#2e9e5b", warn: "#d9901a", loud: "#c0392b" };
/** The SVG's own drawing grid; it is stretched to the box it sits in. */
const W = 1000;
const H = 200;

export default function LevelGraph({
  samples,
  limit,
  min,
  max,
  windowMs = HISTORY_MS,
}: {
  samples: LevelSample[];
  limit: number;
  /** The dB(A) at the bottom and top of the graph (the gauge's span). */
  min: number;
  max: number;
  windowMs?: number;
}) {
  const gradientId = `nm-line-${useId().replace(/:/g, "")}`;
  const end = samples.length ? samples[samples.length - 1].t : 0;
  const frac = (db: number) => (Math.min(max, Math.max(min, db)) - min) / (max - min);
  const x = (t: number) => W - ((end - t) / windowMs) * W;
  const y = (db: number) => H - frac(db) * H;
  const points = samples.map((s) => `${x(s.t).toFixed(1)},${y(s.db).toFixed(1)}`).join(" ");
  // Where the colour changes, as fractions down the graph.
  const atLimit = 1 - frac(limit);
  const atWarn = 1 - frac(limit - WARN_BAND);
  const ticks = [40, 60, 80, 100].filter((v) => v > min && v <= max);
  const minutes = Math.round(windowMs / 60_000);

  return (
    <div
      className="nm-graph"
      role="img"
      aria-label={`Noise level over the last ${minutes} minutes, against the limit of ${limit} dB(A)`}
    >
      <div className="nm-graph-y" aria-hidden>
        <span className="nm-graph-unit">dB(A)</span>
        {ticks.map((v) => (
          <span key={v} style={{ top: `${(1 - frac(v)) * 100}%` }}>
            {v}
          </span>
        ))}
      </div>
      <div className="nm-graph-plot">
        <div className="nm-graph-area">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset={0} stopColor={ZONE.loud} />
                <stop offset={atLimit} stopColor={ZONE.loud} />
                <stop offset={atLimit} stopColor={ZONE.warn} />
                <stop offset={atWarn} stopColor={ZONE.warn} />
                <stop offset={atWarn} stopColor={ZONE.quiet} />
                <stop offset={1} stopColor={ZONE.quiet} />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={W} height={atLimit * H} fill={ZONE.loud} opacity={0.08} />
            {ticks.map((v) => (
              <line key={v} className="nm-graph-grid" x1={0} x2={W} y1={y(v)} y2={y(v)} vectorEffect="non-scaling-stroke" />
            ))}
            <line className="nm-graph-limit" x1={0} x2={W} y1={atLimit * H} y2={atLimit * H} vectorEffect="non-scaling-stroke" />
            {samples.length > 1 && (
              <polyline
                points={points}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span className="nm-graph-limit-label" style={{ top: `${atLimit * 100}%` }} aria-hidden>
            limit {limit}
          </span>
        </div>
        <div className="nm-graph-x" aria-hidden>
          <span>{minutes} min ago</span>
          <span>now</span>
        </div>
      </div>
    </div>
  );
}
