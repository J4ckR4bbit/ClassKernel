import { BURETTE_CAPACITY } from "./titrationStore";

/**
 * The bench: a burette over a conical flask on a stirrer. The burette's
 * level falls as titrant runs in, the flask fills and takes the indicator's
 * colour; before stirring, a plume of the local colour sits where the drops
 * land.
 */
export default function Apparatus({
  added,
  flaskVolume,
  colour,
  plumeColour,
  mixed,
  stirring,
  dropKey,
  flowing,
  reducedMotion,
  tapLabel,
}: {
  added: number;
  /** Total volume in the flask, cm³. */
  flaskVolume: number;
  /** The mixed solution's colour, or null for colourless. */
  colour: string | null;
  /** The unmixed plume's colour, or null when there is nothing unmixed. */
  plumeColour: string | null;
  mixed: boolean;
  stirring: boolean;
  dropKey: number;
  flowing: boolean;
  reducedMotion: boolean;
  tapLabel: string;
}) {
  const W = 360;
  const H = 560;
  // Burette: 0 at the top graduation, 50 at the bottom one.
  const bx = 180;
  const bTop = 30;
  const bBottom = 290;
  const bw = 22;
  const scale = (bBottom - bTop) / BURETTE_CAPACITY;
  const levelY = bTop + Math.min(BURETTE_CAPACITY, added) * scale;
  const tipY = 340;
  // Flask: neck from 372, shoulders at 420, bottom at 540.
  const neckTop = 372;
  const neckW = 44;
  const shoulderY = 425;
  const bottomY = 538;
  const bodyW = 190;
  // Liquid height: the body holds ~75 cm³ to the shoulders, with a 25 cm³ sample a third of the way.
  const fillFraction = Math.min(1.1, flaskVolume / 80);
  const liquidTop = bottomY - fillFraction * (bottomY - shoulderY);
  const liquidColour = colour ?? "#e8f1f8";
  const liquidOpacity = colour ? 0.85 : 0.7;
  const flaskPath = `M ${bx - neckW / 2} ${neckTop} L ${bx - neckW / 2} ${shoulderY} L ${bx - bodyW / 2} ${bottomY - 14} Q ${bx - bodyW / 2} ${bottomY} ${bx - bodyW / 2 + 14} ${bottomY} L ${bx + bodyW / 2 - 14} ${bottomY} Q ${bx + bodyW / 2} ${bottomY} ${bx + bodyW / 2} ${bottomY - 14} L ${bx + neckW / 2} ${shoulderY} L ${bx + neckW / 2} ${neckTop}`;
  // Where the liquid surface meets the sloping sides.
  const halfWidthAt = (y: number) => (y <= shoulderY ? neckW / 2 : neckW / 2 + ((bodyW - neckW) / 2) * ((y - shoulderY) / (bottomY - 14 - shoulderY)));
  const surfaceHalf = Math.min(bodyW / 2, halfWidthAt(liquidTop));

  return (
    <svg className="ti-apparatus" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Burette reading ${added.toFixed(2)} cm³ over a flask of ${flaskVolume.toFixed(1)} cm³`}>
      <defs>
        <clipPath id="ti-flask-clip">
          <path d={flaskPath} />
        </clipPath>
        <radialGradient id="ti-plume">
          <stop offset="0%" stopColor={plumeColour ?? "#fff"} stopOpacity="0.95" />
          <stop offset="100%" stopColor={plumeColour ?? "#fff"} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Stand */}
      <rect x={bx + 60} y={10} width={8} height={H - 30} fill="#8a949e" />
      <rect x={bx + 20} y={H - 24} width={120} height={10} fill="#6b7580" />
      <rect x={bx + 11} y={150} width={60} height={8} fill="#6b7580" />

      {/* Burette tube */}
      <rect x={bx - bw / 2} y={bTop - 12} width={bw} height={bBottom - bTop + 24} rx={3} fill="#f7fbff" stroke="#3b4651" strokeWidth={2} />
      {/* Titrant */}
      <rect x={bx - bw / 2 + 1} y={levelY} width={bw - 2} height={Math.max(0, bBottom + 12 - levelY)} fill="#cfe3f5" />
      {/* Graduations: 0 at the top */}
      {Array.from({ length: BURETTE_CAPACITY + 1 }, (_, i) => {
        const y = bTop + i * scale;
        const major = i % 10 === 0;
        const mid = i % 5 === 0;
        return (
          <g key={i}>
            <line x1={bx - bw / 2} x2={bx - bw / 2 + (major ? 12 : mid ? 8 : 5)} y1={y} y2={y} stroke="#3b4651" strokeWidth={major ? 1.2 : 0.7} />
            {major && (
              <text x={bx - bw / 2 - 5} y={y + 3} textAnchor="end" fontSize={9} fill="#3b4651">
                {i}
              </text>
            )}
          </g>
        );
      })}
      {/* Meniscus */}
      <path d={`M ${bx - bw / 2 + 1} ${levelY} Q ${bx} ${levelY + 4} ${bx + bw / 2 - 1} ${levelY}`} fill="none" stroke="#5b7da0" strokeWidth={1} />
      {/* Tap and tip */}
      <path d={`M ${bx - bw / 2} ${bBottom + 12} L ${bx - 4} ${bBottom + 30} L ${bx - 4} ${tipY} L ${bx + 4} ${tipY} L ${bx + 4} ${bBottom + 30} L ${bx + bw / 2} ${bBottom + 12} Z`} fill="#f7fbff" stroke="#3b4651" strokeWidth={2} />
      <rect x={bx - 18} y={bBottom + 32} width={36} height={10} rx={3} fill={flowing ? "#2e9e5b" : "#8a949e"} stroke="#3b4651" strokeWidth={1} />
      <text x={bx + 24} y={bBottom + 41} fontSize={10} fill="#3b4651">
        {tapLabel}
      </text>
      {/* A stream while the tap is open, or a falling drop */}
      {flowing && <line x1={bx} x2={bx} y1={tipY} y2={liquidTop} stroke="#9ec3e6" strokeWidth={3} strokeLinecap="round" />}
      {!flowing && dropKey > 0 && !reducedMotion && (
        <circle key={dropKey} className="ti-drop" cx={bx} cy={tipY + 4} r={4} fill="#9ec3e6" style={{ ["--ti-fall" as string]: `${liquidTop - tipY - 4}px` }} />
      )}

      {/* Flask liquid, clipped to the glass */}
      <g clipPath="url(#ti-flask-clip)">
        <rect x={bx - bodyW / 2} y={liquidTop} width={bodyW} height={bottomY - liquidTop} fill={liquidColour} opacity={liquidOpacity} />
        {!mixed && plumeColour && (
          <ellipse cx={bx} cy={liquidTop + 14} rx={Math.min(surfaceHalf, 40)} ry={26} fill="url(#ti-plume)" />
        )}
        <path d={`M ${bx - surfaceHalf} ${liquidTop} Q ${bx} ${liquidTop + 5} ${bx + surfaceHalf} ${liquidTop}`} fill="none" stroke="rgba(59,70,81,0.45)" strokeWidth={1} />
        {/* Stirrer bar */}
        <rect className={`ti-stirbar ${stirring && !reducedMotion ? "spinning" : ""}`} x={bx - 22} y={bottomY - 10} width={44} height={6} rx={3} fill="#fff" stroke="#3b4651" strokeWidth={1} style={{ transformOrigin: `${bx}px ${bottomY - 7}px` }} />
      </g>
      {/* Glass */}
      <path d={flaskPath} fill="none" stroke="#3b4651" strokeWidth={2.5} />
      {/* Stirrer plate */}
      <rect x={bx - 110} y={bottomY + 2} width={220} height={14} rx={4} fill="#dfe4ea" stroke="#3b4651" strokeWidth={1.5} />
    </svg>
  );
}
