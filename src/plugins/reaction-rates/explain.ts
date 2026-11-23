// What the dashed run and this one differ by, and why that changes the rate,
// in the words of collision theory.

import { formatNumber } from "../numbers";
import { RateParams, Surface } from "./rates";

/** A short name for a set of conditions, for the dashed run's label. */
export function conditionsLabel(p: RateParams): string {
  const surface = p.surface === "lump" ? "one lump" : p.surface === "pieces" ? "six pieces" : "powder";
  return `${formatNumber(p.temperature, 0)} °C, ${formatNumber(p.concentration, 2)} mol·dm⁻³, ${surface}${p.catalyst ? ", catalyst" : ""}`;
}

/** What changed from the kept run to this one, explained by collision theory. */
export function explainChange(before: Pick<RateParams, "temperature" | "concentration" | "surface" | "catalyst">, now: RateParams): string[] {
  const out: string[] = [];
  const order: Record<Surface, number> = { lump: 0, pieces: 1, powder: 2 };
  if (now.temperature !== before.temperature) {
    const up = now.temperature > before.temperature;
    out.push(
      up
        ? "Higher temperature: the particles have more kinetic energy on average, so more of them have E_k ≥ E_a (the shaded area grows) and they collide more often. More effective collisions per unit time: a faster rate."
        : "Lower temperature: the particles have less kinetic energy on average, so fewer have E_k ≥ E_a and they collide less often. Fewer effective collisions per unit time: a slower rate.",
    );
  }
  if (now.concentration !== before.concentration) {
    const up = now.concentration > before.concentration;
    out.push(
      up
        ? "Higher concentration: more acid particles in the same volume, so more collisions per unit time — and so more effective collisions per unit time: a faster rate. The same fraction of them has E_k ≥ E_a."
        : "Lower concentration: fewer acid particles in the same volume, so fewer collisions per unit time and fewer effective collisions per unit time: a slower rate.",
    );
  }
  if (now.surface !== before.surface) {
    const up = order[now.surface] > order[before.surface];
    out.push(
      up
        ? "Larger surface area: the same metal in smaller pieces exposes more atoms to the acid, so more collisions per unit time and more effective collisions per unit time: a faster rate."
        : "Smaller surface area: fewer metal atoms are exposed, so fewer collisions per unit time and fewer effective collisions: a slower rate.",
    );
  }
  if (now.catalyst !== before.catalyst) {
    out.push(
      now.catalyst
        ? "A catalyst: it provides an alternative pathway with a lower activation energy, so more particles have E_k ≥ E_a — more effective collisions per unit time: a faster rate. The catalyst is not used up."
        : "Without the catalyst the activation energy is higher again, so fewer particles have E_k ≥ E_a: a slower rate.",
    );
  }
  return out;
}
