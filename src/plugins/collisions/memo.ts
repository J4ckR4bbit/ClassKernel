// The working a memo would show for the interaction: the sign convention,
// the momenta before, conservation of momentum solved for what's unknown,
// the kinetic-energy test for elastic or inelastic, Δp of each, and the
// impulse and the average force (Newton's third law). Values to two decimals
// with the decimal comma, in the chosen sign convention.

import type { MemoStep } from "../shared/SimControls";
import { formatFixed, formatNumber } from "../numbers";
import { CollParams, Outcome, before } from "./collisions";

export type Positive = "right" | "left";

/** Two decimals with the decimal comma and a true minus sign. */
export const n2 = (v: number) => formatFixed(Math.abs(v) < 5e-10 ? 0 : v, 2).replace(/^-/, "−");
/** A given value as typed: up to three decimals, trailing zeros dropped. */
const g = (v: number) => formatNumber(v, 3).replace(/^-/, "−");
/** A bracketed value for substitution: (−2). */
const br = (v: number) => `(${g(v)})`;
/** A worked value, bracketed when negative so it can follow a + or a /. */
const gb = (v: number) => (v < 0 ? `(${g(v)})` : g(v));
const nb = (v: number) => (n2(v).startsWith("−") ? `(${n2(v)})` : n2(v));

/** "to the right", "to the left" or "at rest", from a right-positive value. */
export function direction(v: number): string {
  if (Math.abs(v) < 1e-9) return "at rest";
  return v > 0 ? "to the right" : "to the left";
}

export function memo(p: CollParams, o: Outcome, positive: Positive): MemoStep[] {
  const sg = positive === "right" ? 1 : -1;
  const { uA, uB } = before(p);
  const mA = p.massA;
  const mB = p.massB;
  const steps: MemoStep[] = [];
  steps.push({ head: "Sign convention", lines: [positive === "right" ? "To the right is positive." : "To the left is positive."] });

  if (p.kind === "explosion") {
    steps.push({
      head: "Momentum before",
      lines: [`Together: Σp_{before} = (m_A + m_B)u = (${g(mA)} + ${g(mB)})${br(sg * uA)} = ${n2(sg * o.pBefore)} kg·m·s⁻¹`],
    });
  } else {
    steps.push({
      head: "Momentum before",
      lines: [
        `p_A = m_Au_A = (${g(mA)})${br(sg * uA)} = ${n2(sg * mA * uA)} kg·m·s⁻¹`,
        `p_B = m_Bu_B = (${g(mB)})${br(sg * uB)} = ${n2(sg * mB * uB)} kg·m·s⁻¹`,
        `Σp_{before} = p_A + p_B = ${n2(sg * mA * uA)} + ${nb(sg * mB * uB)} = ${n2(sg * o.pBefore)} kg·m·s⁻¹`,
      ],
    });
  }

  if (!o.collides) {
    steps.push({ head: "Do they collide?", lines: [o.problem, "Nothing changes: each keeps its velocity."] });
    return steps;
  }

  const law = "The total linear momentum of an isolated system remains constant (is conserved): Σp_{before} = Σp_{after}.";
  if (p.kind === "stick") {
    steps.push({
      head: "Conservation of momentum",
      lines: [law, `(${g(mA)})${br(sg * uA)} + (${g(mB)})${br(sg * uB)} = (${g(mA)} + ${g(mB)})v_f`, `v_f = ${n2(sg * o.vA)} m·s⁻¹ (${direction(o.vA)}), both together`],
    });
  } else if (p.kind === "elastic") {
    steps.push({
      head: "Conservation of momentum",
      lines: [
        law,
        `(${g(mA)})${br(sg * uA)} + (${g(mB)})${br(sg * uB)} = (${g(mA)})v_A + (${g(mB)})v_B`,
        "In an elastic collision the kinetic energy is conserved too; solving the two equations together:",
        `v_A = ${n2(sg * o.vA)} m·s⁻¹ (${direction(o.vA)}); v_B = ${n2(sg * o.vB)} m·s⁻¹ (${direction(o.vB)})`,
      ],
    });
  } else {
    const lhs = p.kind === "explosion" ? `(${g(mA)} + ${g(mB)})${br(sg * uA)}` : `(${g(mA)})${br(sg * uA)} + (${g(mB)})${br(sg * uB)}`;
    steps.push({
      head: "Conservation of momentum",
      lines: [law, `${lhs} = (${g(mA)})${br(sg * o.vA)} + (${g(mB)})v_B`, `v_B = ${n2(sg * o.vB)} m·s⁻¹ (${direction(o.vB)})`],
    });
  }
  if (!o.possible) {
    steps.push({ head: "But", lines: [o.problem] });
    return steps;
  }

  const ekLine = (label: string, a: number, b: number, total: number) =>
    p.kind === "stick" && label === "after"
      ? `ΣE_{k ${label}} = ½(m_A + m_B)v_f² = ½(${g(mA + mB)})${br(sg * a)}² = ${n2(total)} J`
      : `ΣE_{k ${label}} = ½(${g(mA)})${br(sg * a)}² + ½(${g(mB)})${br(sg * b)}² = ${n2(total)} J`;
  const verdict =
    o.verdict === "elastic"
      ? "Equal: kinetic energy is conserved, so the collision is elastic (both momentum and kinetic energy are conserved)."
      : o.verdict === "inelastic"
        ? `Less after: the collision is inelastic (only momentum is conserved). ${n2(o.ekBefore - o.ekAfter)} J of kinetic energy became heat, sound and the work of deforming the objects.`
        : `More after: ${n2(o.ekAfter - o.ekBefore)} J of energy stored in the spring (or chemical energy in an explosion) became kinetic energy.`;
  steps.push({
    head: "Kinetic energy",
    lines: [
      p.kind === "explosion" ? `ΣE_{k before} = ½(${g(mA + mB)})${br(sg * uA)}² = ${n2(o.ekBefore)} J` : ekLine("before", uA, uB, o.ekBefore),
      ekLine("after", o.vA, o.vB, o.ekAfter),
      verdict,
    ],
  });
  if (o.problem) steps.push({ head: "Check", lines: [o.problem] });

  steps.push({
    head: "Change in momentum",
    lines: [
      `Δp_A = m_A(v_A − u_A) = (${g(mA)})(${n2(sg * o.vA)} − ${gb(sg * uA)}) = ${n2(sg * o.dpA)} kg·m·s⁻¹`,
      `Δp_B = m_B(v_B − u_B) = (${g(mB)})(${n2(sg * o.vB)} − ${gb(sg * uB)}) = ${n2(sg * o.dpB)} kg·m·s⁻¹`,
      "Equal in size and opposite in direction: what one object gains, the other loses.",
    ],
  });
  const t = formatNumber(p.contactTime, 3);
  steps.push({
    head: "Impulse and force",
    lines: [
      `Impulse on B: J = Δp_B = ${n2(sg * o.dpB)} N·s; on A: ${n2(sg * o.dpA)} N·s`,
      `F_{net} = Δp/Δt = ${nb(sg * o.dpB)}/${t} = ${n2(sg * o.forceB)} N on B (${direction(o.forceB)})`,
      `On A: ${n2(sg * o.forceA)} N (${direction(o.forceA)}) — Newton's third law: equal in size, opposite in direction, at the same time, on different objects.`,
    ],
  });
  return steps;
}
