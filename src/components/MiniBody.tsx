import { ReactNode } from "react";

/**
 * The main part of a tool's corner pop-up (the timer, the noise meter): a
 * button that opens the tool, or, with no `onClick` (in teaching mode, where
 * a brush against it mustn't leave the lesson), just the readout.
 */
export default function MiniBody({
  className,
  onClick,
  title,
  children,
}: {
  className: string;
  onClick?: () => void;
  title: string;
  children: ReactNode;
}) {
  return onClick ? (
    <button className={className} onClick={onClick} title={title}>
      {children}
    </button>
  ) : (
    <div className={`${className} static`}>{children}</div>
  );
}
