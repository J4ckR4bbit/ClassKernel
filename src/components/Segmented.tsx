import { ReactNode } from "react";
import Icon, { IconName } from "./Icon";

/**
 * A Material segmented button: one choice out of a few, side by side. The
 * chosen segment fills with the secondary container and shows a check in
 * place of its icon.
 */
export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  small = false,
}: {
  options: Array<{ value: T; label: ReactNode; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
  /** Read out by screen readers for the group as a whole. */
  label: string;
  /** 32 px tall, for dense panels. */
  small?: boolean;
}) {
  return (
    <div className={`seg ${small ? "small" : ""}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} className={on ? "on" : ""} aria-pressed={on} onClick={() => onChange(o.value)}>
            {on ? <Icon name="check" size={18} /> : o.icon && <Icon name={o.icon} size={18} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
