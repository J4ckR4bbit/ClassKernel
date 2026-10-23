import { ReactNode } from "react";
import { fmtSigned } from "../lib/format";
import { BehaviourCode } from "../lib/types";

/** "+1 Asked and answered": how a behaviour reads on every button and tag, points first. */
export const behaviourText = (c: BehaviourCode) => `${fmtSigned(c.points)} ${c.label}`;

/**
 * A behaviour button in its own colour, worded the same in the seat pop-up,
 * batch entry and the student picker, so the teacher knows it at a glance.
 */
export default function BehaviourButton({
  code,
  onClick,
  icon,
  title,
  className = "bh-btn",
}: {
  code: BehaviourCode;
  onClick: () => void;
  icon?: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button className={className} style={{ background: code.color }} onClick={onClick} title={title}>
      {icon}
      {behaviourText(code)}
    </button>
  );
}
