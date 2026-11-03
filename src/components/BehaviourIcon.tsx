import { BEHAVIOUR_ICON_PATHS } from "./behaviourIcons";

/** A behaviour's icon (see behaviourIcons.ts); nothing for "" or a name this build doesn't have. */
export default function BehaviourIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const d = BEHAVIOUR_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/** The same icon inside an SVG (a segment of the round pop-up), centred on x, y. */
export function BehaviourIconGlyph({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const d = BEHAVIOUR_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 -960 960 960" aria-hidden focusable="false" pointerEvents="none">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
