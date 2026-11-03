import { KeyboardEvent, ReactNode } from "react";
import { AttendanceStatus, BehaviourCode } from "../lib/types";
import { IconGlyph, IconName } from "./Icon";
import { BehaviourIconGlyph } from "./BehaviourIcon";
import { behaviourText } from "./BehaviourButton";
import { ATTENDANCE_CODES, ATTENDANCE_WORDS, StudentActionProps, useBehaviourGroups, usePopupName } from "./StudentActions";

// A student's actions as rings around the seat that was tapped: close in the
// middle; attendance across the top of the inner ring with OUTSIDE and Note
// below; the behaviours on the outer ring, positives across the top half and
// negatives across the bottom, each in its colour with its icon and code.
// More than PER_HALF of one kind spill onto a further ring.

const R_CENTRE = 30;
const INNER_OUT = 92;
const RING_W = 64;
const GAP = 3;
const PER_HALF = 8;

/** The outer radius of the rings for this many positives and negatives. */
export function ringRadius(positives: number, negatives: number): number {
  const rings = Math.max(1, Math.ceil(positives / PER_HALF), Math.ceil(negatives / PER_HALF));
  return INNER_OUT + rings * (GAP + RING_W);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** An annular sector from a0 to a1 degrees (clockwise, 0 = 3 o'clock), with a small gap on every side. */
function sector(c: number, r0: number, r1: number, a0: number, a1: number): string {
  const p0 = GAP / 2 / r0;
  const p1 = GAP / 2 / r1;
  const pt = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const s0 = rad(a0);
  const s1 = rad(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [
    `M ${pt(r1, s0 + p1)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${pt(r1, s1 - p1)}`,
    `L ${pt(r0, s1 - p0)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${pt(r0, s0 + p0)}`,
    "Z",
  ].join(" ");
}

/** Where a sector's label goes: half way round it, half way out. */
function middle(c: number, r0: number, r1: number, a0: number, a1: number) {
  const a = rad((a0 + a1) / 2);
  const r = (r0 + r1) / 2;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}

function Segment({
  d,
  label,
  className,
  style,
  pressed,
  onPress,
  children,
}: {
  d: string;
  label: string;
  className: string;
  style?: React.CSSProperties;
  pressed?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <g
      className={`ring-seg ${className}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onPress}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onPress();
      }}
    >
      <title>{label}</title>
      <path d={d} style={style} />
      {children}
    </g>
  );
}

export default function StudentRing({
  student,
  status,
  outVisit,
  onAttendance,
  onBathroom,
  onBehaviour,
  onNote,
  noteDraft,
  onClose,
}: StudentActionProps) {
  const { positives, negatives } = useBehaviourGroups();
  const name = usePopupName(student);
  const R = ringRadius(positives.length, negatives.length);
  const size = 2 * R + 4;
  const c = size / 2;

  // Inner ring: attendance across the top half, OUTSIDE and Note below.
  const att = ATTENDANCE_CODES.map((code, i) => {
    const a0 = 180 + i * 45;
    return { code, a0, a1: a0 + 45 };
  });
  const outside = onNote ? { a0: 0, a1: 90 } : { a0: 0, a1: 180 };
  const note = { a0: 90, a1: 180 };

  // Outer rings: each kind fills its half, PER_HALF to a ring, left to right.
  const place = (codes: BehaviourCode[], top: boolean) =>
    codes.map((code, i) => {
      const ring = Math.floor(i / PER_HALF);
      const onRing = Math.min(PER_HALF, codes.length - ring * PER_HALF);
      const span = 180 / onRing;
      const k = i - ring * PER_HALF;
      const r0 = INNER_OUT + GAP + ring * (GAP + RING_W);
      const [a0, a1] = top ? [180 + k * span, 180 + (k + 1) * span] : [180 - (k + 1) * span, 180 - k * span];
      return { code, r0, r1: r0 + RING_W, a0, a1 };
    });
  const placed = [...place(positives, true), ...place(negatives, false)];
  const r0 = R_CENTRE + GAP;

  const glyph = (icon: IconName, x: number, y: number) => <IconGlyph name={icon} x={x} y={y} size={20} className="ring-icon" />;

  return (
    <div className="student-ring" style={{ width: size, height: size }}>
      <div className="ring-name">{name}</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={`Actions for ${name}`}>
        <circle className="ring-back" cx={c} cy={c} r={R + 2} />

        {att.map(({ code, a0, a1 }) => {
          const m = middle(c, r0, INNER_OUT, a0, a1);
          const on = status === code;
          return (
            <Segment
              key={code}
              d={sector(c, r0, INNER_OUT, a0, a1)}
              label={ATTENDANCE_WORDS[code]}
              className={`ring-att ${code} ${on ? "on" : ""}`}
              pressed={on}
              onPress={() => onAttendance(code as AttendanceStatus)}
            >
              <text x={m.x} y={m.y} className="ring-letter" dominantBaseline="central">
                {code}
              </text>
            </Segment>
          );
        })}

        {(() => {
          const m = middle(c, r0, INNER_OUT, outside.a0, outside.a1);
          return (
            <Segment
              d={sector(c, r0, INNER_OUT, outside.a0, outside.a1)}
              label={outVisit ? "Back inside" : "OUTSIDE: start the timer"}
              className={`ring-outside ${outVisit ? "out" : ""}`}
              onPress={onBathroom}
            >
              {glyph("door_open", m.x, m.y - 8)}
              <text x={m.x} y={m.y + 11} className="ring-word" dominantBaseline="central">
                {outVisit ? "BACK" : "OUTSIDE"}
              </text>
            </Segment>
          );
        })()}

        {onNote &&
          (() => {
            const m = middle(c, r0, INNER_OUT, note.a0, note.a1);
            return (
              <Segment
                d={sector(c, r0, INNER_OUT, note.a0, note.a1)}
                label={noteDraft ? "Note (draft)" : "Write a note"}
                className={`ring-note ${noteDraft ? "draft" : ""}`}
                onPress={onNote}
              >
                {glyph("edit_note", m.x, m.y - 8)}
                <text x={m.x} y={m.y + 11} className="ring-word" dominantBaseline="central">
                  {noteDraft ? "DRAFT" : "NOTE"}
                </text>
              </Segment>
            );
          })()}

        {placed.map(({ code, r0: a, r1: b, a0, a1 }) => {
          const m = middle(c, a, b, a0, a1);
          return (
            <Segment
              key={code.code}
              d={sector(c, a, b, a0, a1)}
              label={behaviourText(code)}
              className="ring-behaviour"
              style={{ fill: code.color }}
              onPress={() => onBehaviour(code)}
            >
              <g className="ring-on-fill">
                {code.icon ? (
                  <>
                    <BehaviourIconGlyph name={code.icon} x={m.x} y={m.y - 9} size={18} />
                    <text x={m.x} y={m.y + 10} className="ring-code" dominantBaseline="central">
                      {code.code}
                    </text>
                  </>
                ) : (
                  <text x={m.x} y={m.y} className="ring-code" dominantBaseline="central">
                    {code.code}
                  </text>
                )}
              </g>
            </Segment>
          );
        })}

        <Segment d={`M ${c - R_CENTRE} ${c} a ${R_CENTRE} ${R_CENTRE} 0 1 0 ${2 * R_CENTRE} 0 a ${R_CENTRE} ${R_CENTRE} 0 1 0 ${-2 * R_CENTRE} 0`} label="Close" className="ring-close" onPress={onClose}>
          {glyph("close", c, c)}
        </Segment>
      </svg>
    </div>
  );
}
