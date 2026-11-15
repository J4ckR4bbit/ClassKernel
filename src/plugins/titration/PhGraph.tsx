import { useMemo } from "react";
import { formatFixed, formatNumber } from "../numbers";
import { EquivalencePoint, Indicator, Setup, curve } from "./chemistry";
import { BURETTE_CAPACITY, Reading } from "./titrationStore";

/**
 * pH against volume added, drawn as a probe would trace it: only up to the
 * volume run in so far, unless the whole curve is asked for. Equivalence
 * points as dashed lines (when revealed), the indicator's range as a band.
 */
export default function PhGraph({
  setup,
  added,
  currentPH,
  showWhole,
  equivalence,
  indicator,
  readings,
}: {
  setup: Setup;
  added: number;
  currentPH: number;
  showWhole: boolean;
  equivalence: EquivalencePoint[] | null;
  indicator: Indicator | null;
  readings: Reading[];
}) {
  const W = 640;
  const H = 360;
  const left = 52;
  const right = 16;
  const top = 16;
  const bottom = 44;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const x = (v: number) => left + (v / BURETTE_CAPACITY) * plotW;
  const y = (pH: number) => top + plotH - (pH / 14) * plotH;

  const points = useMemo(() => curve(setup, BURETTE_CAPACITY, 0.1), [setup]);
  const drawn = showWhole ? points : points.filter((p) => p.volume <= added + 1e-9);
  const path = drawn.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.volume).toFixed(1)} ${y(p.pH).toFixed(1)}`).join(" ");

  return (
    <svg className="ti-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="pH against volume added">
      <rect x={left} y={top} width={plotW} height={plotH} fill="#fff" stroke="#c0c9c0" />
      {/* Gridlines */}
      {Array.from({ length: 15 }, (_, i) => (
        <g key={`y${i}`}>
          <line x1={left} x2={left + plotW} y1={y(i)} y2={y(i)} stroke={i === 7 ? "#9aa3ad" : "#eef1f4"} strokeWidth={1} />
          {i % 2 === 0 && (
            <text x={left - 8} y={y(i) + 4} textAnchor="end" fontSize={12} fill="#414942">
              {i}
            </text>
          )}
        </g>
      ))}
      {Array.from({ length: BURETTE_CAPACITY / 5 + 1 }, (_, i) => (
        <g key={`x${i}`}>
          <line x1={x(i * 5)} x2={x(i * 5)} y1={top} y2={top + plotH} stroke="#eef1f4" strokeWidth={1} />
          {i % 2 === 0 && (
            <text x={x(i * 5)} y={top + plotH + 18} textAnchor="middle" fontSize={12} fill="#414942">
              {i * 5}
            </text>
          )}
        </g>
      ))}
      <text x={left + plotW / 2} y={H - 8} textAnchor="middle" fontSize={13} fill="#1d2733">
        Volume added from the burette (cm³)
      </text>
      <text x={14} y={top + plotH / 2} textAnchor="middle" fontSize={13} fill="#1d2733" transform={`rotate(-90 14 ${top + plotH / 2})`}>
        pH
      </text>
      {/* The indicator's range */}
      {indicator && (
        <g>
          <rect x={left} y={y(indicator.high)} width={plotW} height={y(indicator.low) - y(indicator.high)} fill={indicator.baseColour} opacity={0.18} />
          <text x={left + plotW - 6} y={y(indicator.high) - 4} textAnchor="end" fontSize={11} fill="#414942">
            {indicator.name} {formatNumber(indicator.low, 1)}–{formatNumber(indicator.high, 1)}
          </text>
        </g>
      )}
      {/* Equivalence points */}
      {equivalence?.map((e) =>
        e.volume <= BURETTE_CAPACITY ? (
          <g key={e.step}>
            <line x1={x(e.volume)} x2={x(e.volume)} y1={top} y2={top + plotH} stroke="#9c2f1f" strokeDasharray="5 4" strokeWidth={1.2} />
            <text x={x(e.volume) + (e.volume > BURETTE_CAPACITY * 0.7 ? -4 : 4)} y={top + 12} fontSize={11} fill="#9c2f1f" textAnchor={e.volume > BURETTE_CAPACITY * 0.7 ? "end" : "start"}>
              {equivalence.length > 1 ? `Eq ${e.step}: ` : "Eq: "}
              {formatFixed(e.volume, 2)} cm³, pH {formatFixed(e.pH, 1)}
            </text>
          </g>
        ) : null,
      )}
      {/* The curve */}
      {drawn.length > 1 && <path d={path} fill="none" stroke="#1f5fbf" strokeWidth={2.2} />}
      {/* Recorded readings */}
      {readings.map((r, i) => (
        <g key={i} stroke="#1d2733" strokeWidth={1.4}>
          <line x1={x(r.volume) - 4} x2={x(r.volume) + 4} y1={y(r.pH) - 4} y2={y(r.pH) + 4} />
          <line x1={x(r.volume) - 4} x2={x(r.volume) + 4} y1={y(r.pH) + 4} y2={y(r.pH) - 4} />
        </g>
      ))}
      {/* Where we are */}
      <circle cx={x(added)} cy={y(currentPH)} r={5} fill="#e3399a" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
