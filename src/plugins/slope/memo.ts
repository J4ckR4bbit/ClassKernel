// The working a memo would show for the block as it is now: the weight and
// its components, the normal force, whether friction is static or kinetic and
// why, Newton's second law for each body, and what happens next. Up the slope
// is positive; numbers to two decimals with the decimal comma.

import { formatFixed } from "../numbers";
import { Forces, G, Motion, SlopeParams, muK, muS, slipAngle, stopping } from "./slope";

export interface MemoStep {
  head: string;
  lines: string[];
}

/** Two decimals with the decimal comma and a true minus sign. */
export const n2 = (v: number) => formatFixed(v, 2).replace(/^-/, "−");
const n1 = (v: number) => formatFixed(v, 1).replace(/^-/, "−");
const plain = (v: number) => formatFixed(v, 3).replace(/,?0+$/, "");
const way = (v: number) => (v > 0 ? "up the slope" : "down the slope");

/** "a − b + c = 1,23" with each term's sign. */
function sum(terms: Array<[string, number]>, unit: string): string {
  const live = terms.filter(([, v]) => Math.abs(v) > 1e-9);
  if (!live.length) return `0 ${unit}`;
  const names = live.map(([name, v], i) => (i === 0 ? (v < 0 ? `−${name}` : name) : `${v < 0 ? "−" : "+"} ${name}`)).join(" ");
  const values = live.map(([, v], i) => (i === 0 ? (v < 0 ? `−${n2(-v)}` : n2(v)) : `${v < 0 ? "−" : "+"} ${n2(Math.abs(v))}`)).join(" ");
  const total = live.reduce((s, [, v]) => s + v, 0);
  return `${names} = ${values} = ${n2(total)} ${unit}`;
}

export function memo(p: SlopeParams, f: Forces, m: Motion): MemoStep[] {
  const steps: MemoStep[] = [];
  const theta = plain(p.angle);
  const pulley = p.setup === "pulley" && !m.cut;
  const applied = p.setup === "block" && p.force > 0;

  steps.push({ head: "Sign convention", lines: ["Up the slope is positive."] });

  const weight = [`F_g = mg = (${plain(p.mass)})(9,8) = ${n2(f.weight)} N`];
  if (p.setup === "pulley") weight.push(`Hanging mass: F_g = m₂g = (${plain(p.hangingMass)})(9,8) = ${n2(f.hangingWeight)} N`);
  steps.push({ head: "Weight", lines: weight });

  steps.push({
    head: "Components of the weight",
    lines: [
      `F_{g∥} = F_g sin θ = (${n2(f.weight)})(sin ${theta}°) = ${n2(f.weightPar)} N down the slope`,
      `F_{g⊥} = F_g cos θ = (${n2(f.weight)})(cos ${theta}°) = ${n2(f.weightPerp)} N into the slope`,
    ],
  });

  if (applied) {
    const lines =
      Math.abs(p.forceAngle) > 0.05
        ? [
            `Along the slope: F cos ${plain(Math.abs(p.forceAngle))}° = (${plain(p.force)})(cos ${plain(Math.abs(p.forceAngle))}°) = ${n2(Math.abs(f.forcePar))} N ${way(f.forcePar)}`,
            `Across the slope: F sin ${plain(Math.abs(p.forceAngle))}° = ${n2(Math.abs(f.forcePerp))} N ${f.forcePerp > 0 ? "away from the slope" : "into the slope"}`,
          ]
        : [`F = ${plain(p.force)} N ${way(f.forcePar)}, parallel to the slope`];
    steps.push({ head: "Applied force", lines });
  }

  if (f.state === "lifted") {
    steps.push({
      head: "Normal force",
      lines: [
        `F sin ${plain(Math.abs(p.forceAngle))}° = ${n2(f.forcePerp)} N is more than F_{g⊥} = ${n2(f.weightPerp)} N: the force lifts the block off the slope, so there is no normal force and no friction. Reduce F or its angle.`,
      ],
    });
    return steps;
  }

  const across = applied && Math.abs(f.forcePerp) > 1e-9;
  steps.push({
    head: "Normal force",
    lines: [
      across
        ? `Nothing accelerates across the slope: F_N = F_{g⊥} ${f.forcePerp > 0 ? "−" : "+"} F sin ${plain(Math.abs(p.forceAngle))}° = ${n2(f.weightPerp)} ${f.forcePerp > 0 ? "−" : "+"} ${n2(Math.abs(f.forcePerp))} = ${n2(f.normal)} N`
        : `Nothing accelerates across the slope: F_N = F_{g⊥} = ${n2(f.normal)} N`,
    ],
  });

  // Friction: what the other forces along the slope do, and what friction can do about it.
  const along: Array<[string, number]> = [];
  if (applied) along.push([Math.abs(p.forceAngle) > 0.05 ? `F cos ${plain(Math.abs(p.forceAngle))}°` : "F", f.forcePar]);
  if (pulley) along.push(["m₂g", f.hangingWeight]);
  along.push(["F_{g∥}", -f.weightPar]);
  const frictionLines: string[] = [];
  if (muS(p) === 0 && muK(p) === 0) {
    frictionLines.push("The slope is frictionless: F_f = 0.");
  } else if (f.state === "rest") {
    frictionLines.push(`F_{fs}(max) = μₛF_N = (${plain(muS(p))})(${n2(f.normal)}) = ${n2(f.staticMax)} N`);
    frictionLines.push(
      Math.abs(f.drive) < 1e-9
        ? "The other forces along the slope already balance, so no friction is needed."
        : `The other forces along the slope add to ${n2(Math.abs(f.drive))} N ${way(f.drive)}${pulley ? " (on the block and the hanging mass together)" : ""} — no more than ${n2(f.staticMax)} N, so static friction holds the block: F_f = ${n2(Math.abs(f.friction))} N ${way(f.friction)}.`,
    );
  } else if (f.state === "starting") {
    frictionLines.push(`F_{fs}(max) = μₛF_N = (${plain(muS(p))})(${n2(f.normal)}) = ${n2(f.staticMax)} N`);
    frictionLines.push(
      `The other forces along the slope add to ${n2(Math.abs(f.drive))} N ${way(f.drive)} — more than ${n2(f.staticMax)} N, so the block starts to slide and kinetic friction acts ${way(f.friction)}: F_f = μₖF_N = (${plain(muK(p))})(${n2(f.normal)}) = ${n2(f.kinetic)} N.`,
    );
  } else {
    frictionLines.push(
      `The block is moving ${way(m.v)}, so kinetic friction acts ${way(f.friction)}: F_f = μₖF_N = (${plain(muK(p))})(${n2(f.normal)}) = ${n2(f.kinetic)} N.`,
    );
  }
  steps.push({ head: "Friction", lines: frictionLines });

  // Newton's second law.
  const newton: string[] = [];
  if (f.state === "rest") {
    newton.push("F_{net} = 0, so a = 0: the block stays at rest.");
    if (pulley) newton.push(`The hanging mass is at rest too, so T = m₂g = ${n2(f.tension)} N.`);
  } else if (pulley) {
    newton.push(`Hanging mass (down positive): m₂g − T = m₂a`);
    newton.push(`Block (up the slope positive): T − F_{g∥} ${f.friction < 0 ? "−" : "+"} F_f = m₁a`);
    newton.push(
      `Adding them: a = (m₂g − F_{g∥} ${f.friction < 0 ? "−" : "+"} F_f) / (m₁ + m₂) = (${n2(f.hangingWeight)} − ${n2(f.weightPar)} ${f.friction < 0 ? "−" : "+"} ${n2(Math.abs(f.friction))}) / (${plain(p.mass)} + ${plain(p.hangingMass)}) = ${n2(f.a)} m·s⁻²`,
    );
    newton.push(`T = m₂(g − a) = (${plain(p.hangingMass)})(9,8 − ${n2(f.a)}) = ${n2(f.tension)} N`);
  } else {
    const terms: Array<[string, number]> = [...along, ["F_f", f.friction]];
    newton.push(`F_{net} = ${sum(terms, "N")}`);
    newton.push(`a = F_{net} / m = ${n2(f.net)} / ${plain(p.mass)} = ${n2(f.a)} m·s⁻²${Math.abs(f.a) > 1e-9 ? `, i.e. ${n2(Math.abs(f.a))} m·s⁻² ${way(f.a)}` : ""}`);
    if (m.cut && p.setup === "pulley") newton.push(`The string is cut: the hanging mass falls freely with a = g = ${n1(G)} m·s⁻².`);
  }
  steps.push({ head: "Newton's second law", lines: newton });

  // What happens next.
  const next: string[] = [];
  const stop = stopping(m.v, f.a);
  if (stop) {
    next.push(`It is slowing: it comes to rest after Δx = v² / 2a = (${n2(Math.abs(m.v))})² / (2 × ${n2(Math.abs(f.a))}) = ${n2(stop.distance)} m, in Δt = ${n2(stop.time)} s.`);
  }
  if (p.setup === "block" && !applied) {
    const c = (Math.atan(muS(p)) * 180) / Math.PI;
    next.push(`With only its weight, the normal force and friction acting, it slips when tan θ = μₛ: θ = tan⁻¹(${plain(muS(p))}) = ${n1(c)}° — whatever its mass.`);
  } else if (f.state === "rest") {
    const slip = slipAngle(p, p.angle);
    if (slip !== null && slip > p.angle) next.push(`Tilt the slope up from here and it starts to slide at θ = ${n1(slip)}°.`);
  }
  if (next.length) steps.push({ head: "What happens next", lines: next });
  return steps;
}

/** "F_{g∥}" → [["F", false], ["g∥", true]]: the subscripts the view prints with <sub> (one character after _, or braced). */
export function subscriptRuns(s: string): Array<[string, boolean]> {
  const out: Array<[string, boolean]> = [];
  let plainText = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "_" && i > 0 && i + 1 < s.length) {
      if (plainText) out.push([plainText, false]);
      plainText = "";
      if (s[i + 1] === "{") {
        const end = s.indexOf("}", i + 2);
        out.push([s.slice(i + 2, end < 0 ? undefined : end), true]);
        i = end < 0 ? s.length : end + 1;
      } else {
        out.push([s[i + 1], true]);
        i += 2;
      }
    } else plainText += s[i++];
  }
  if (plainText) out.push([plainText, false]);
  return out;
}
