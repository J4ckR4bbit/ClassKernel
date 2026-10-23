import { ReactNode } from "react";
import Icon, { IconName } from "./Icon";

/** A whole page with nothing to show yet: an icon, what's missing, and what to do about it. */
export default function EmptyState({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={48} />
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
