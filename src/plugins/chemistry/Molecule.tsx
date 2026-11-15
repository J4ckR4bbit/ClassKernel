import { useMemo } from "react";
import { formatFixed } from "../numbers";
import { Molecule as Placed, Shape, layoutMolecule, parseStructure, polarity } from "./bonds";
import { elementBySymbol } from "./elements";

/** Colours by element, the usual classroom set. */
const ATOM_COLOURS: Record<string, string> = {
  H: "#ffffff",
  C: "#4a4a4a",
  N: "#3b5bdb",
  O: "#e03131",
  S: "#f2c230",
  P: "#f08c00",
  F: "#74c476",
  Cl: "#2f9e44",
  Br: "#a0522d",
  I: "#7048e8",
  Si: "#b8a9c9",
};

const INK_ON: Record<string, string> = { H: "#1d2733", S: "#1d2733", F: "#1d2733", C: "#ffffff" };

export interface MoleculeProps {
  structure: string;
  shape?: Shape;
  /** δ+ / δ− on each polar bond. */
  showDeltas: boolean;
  /** Each atom's electronegativity under it. */
  showEN: boolean;
  /** Pixels per bond length. */
  scale?: number;
  /** A charge to print at the top right, for an ion. */
  charge?: string;
}

/**
 * A structural formula as SVG: atoms as coloured discs with their symbols,
 * bonds as one, two or three lines, and the δ+ / δ− of each polar bond
 * beside the atoms that carry them.
 */
export default function Molecule({ structure, shape, showDeltas, showEN, scale = 54, charge }: MoleculeProps) {
  const placed: Placed = useMemo(() => layoutMolecule(parseStructure(structure), shape), [structure, shape]);
  const r = 15;
  const pad = 34;
  const xs = placed.atoms.map((a) => a.x * scale);
  const ys = placed.atoms.map((a) => a.y * scale);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const width = maxX - minX;
  const height = maxY - minY;
  const px = (i: number) => xs[i] - minX;
  const py = (i: number) => ys[i] - minY;

  // δ labels: one per atom that is δ+ or δ− in any bond, pushed away from its
  // neighbours (or up and to the right when they surround it), so a sulfur
  // with four oxygens gets one δ+ rather than four on top of each other.
  const deltas: Array<{ x: number; y: number; text: string }> = [];
  if (showDeltas) {
    const sign = new Map<number, string>();
    for (const b of placed.bonds) {
      const a1 = placed.atoms[b.from];
      const a2 = placed.atoms[b.to];
      const p = polarity(a1.element, a2.element);
      if (!p.negative) continue;
      if (!sign.has(b.from)) sign.set(b.from, a1.element === p.negative ? "δ−" : "δ+");
      if (!sign.has(b.to)) sign.set(b.to, a2.element === p.negative ? "δ−" : "δ+");
    }
    for (const [id, text] of sign) {
      const neighbours = placed.bonds.filter((b) => b.from === id || b.to === id).map((b) => (b.from === id ? b.to : b.from));
      let dx = 0;
      let dy = 0;
      for (const n of neighbours) {
        const vx = px(n) - px(id);
        const vy = py(n) - py(id);
        const len = Math.hypot(vx, vy) || 1;
        dx -= vx / len;
        dy -= vy / len;
      }
      let len = Math.hypot(dx, dy);
      if (len < 0.3) {
        dx = 0.7;
        dy = -0.7;
        len = 1;
      }
      dx /= len;
      dy /= len;
      // Keep clear of the electronegativity printed under the atom.
      if (showEN && dy > 0.6) {
        dx = dx >= 0 ? 0.85 : -0.85;
        dy = 0.5;
      }
      deltas.push({ x: px(id) + dx * (r + 12), y: py(id) + dy * (r + 12), text });
    }
  }

  return (
    <svg className="mol" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Structural formula ${structure}`}>
      {placed.bonds.map((b, i) => {
        const x1 = px(b.from);
        const y1 = py(b.from);
        const x2 = px(b.to);
        const y2 = py(b.to);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * 4.5;
        const ny = (dx / len) * 4.5;
        const offsets = b.order === 1 ? [0] : b.order === 2 ? [-1, 1] : [-1, 0, 1];
        return (
          <g key={i} stroke="#1d2733" strokeWidth={2.2} strokeLinecap="round">
            {offsets.map((o) => (
              <line key={o} x1={x1 + nx * o} y1={y1 + ny * o} x2={x2 + nx * o} y2={y2 + ny * o} />
            ))}
          </g>
        );
      })}
      {placed.atoms.map((a, i) => (
        <g key={a.id}>
          <circle cx={px(i)} cy={py(i)} r={r} fill={ATOM_COLOURS[a.element] ?? "#9aa3ad"} stroke="#1d2733" strokeWidth={1.5} />
          <text x={px(i)} y={py(i) + 1} textAnchor="middle" dominantBaseline="middle" fontSize={a.element.length > 1 ? 13 : 15} fontWeight={700} fill={INK_ON[a.element] ?? "#ffffff"}>
            {a.element}
          </text>
          {showEN && elementBySymbol(a.element)?.en !== undefined && (
            <text x={px(i)} y={py(i) + r + 12} textAnchor="middle" fontSize={11} fill="#414942">
              {formatFixed(elementBySymbol(a.element)!.en!, 1)}
            </text>
          )}
        </g>
      ))}
      {deltas.map((d, i) => (
        <text key={i} x={d.x} y={d.y} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill={d.text === "δ−" ? "#c0392b" : "#1f4fd1"}>
          {d.text}
        </text>
      ))}
      {charge && (
        <text x={width - 8} y={16} textAnchor="end" fontSize={16} fontWeight={700} fill="#1d2733">
          {charge}
        </text>
      )}
    </svg>
  );
}
