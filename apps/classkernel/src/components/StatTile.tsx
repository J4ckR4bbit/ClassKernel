import { ReactNode } from "react";

/** One figure in a row of `.stat-tiles`: a big value over a small label, green or red when it matters. */
export default function StatTile({
  value,
  label,
  tone,
  title,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: "good" | "bad";
  title?: string;
}) {
  return (
    <div className="stat-tile" title={title}>
      <div className={tone ? `value ${tone}` : "value"}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
