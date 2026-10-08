import { ReactNode } from "react";
import { useApp } from "../store/appStore";
import Icon from "./Icon";

/**
 * Covers a screen containing individual student information until the teacher
 * explicitly reveals it. The reveal is per-visit: navigating away (or
 * switching class / entering teaching mode) re-arms the cover, so a screen
 * full of marks can't be left showing to the class by accident. Turning
 * privacy mode off in Settings removes the gate entirely.
 */
export default function PrivacyGate({ label, children }: { label: string; children: ReactNode }) {
  const { userPrefs, sensitiveRevealed, revealSensitive } = useApp();
  if (!userPrefs.privacyMode || sensitiveRevealed) return <>{children}</>;
  return (
    <div className="privacy-gate">
      <div className="privacy-gate-icon">
        <Icon name="visibility" size={32} />
      </div>
      <p>This screen shows {label} for individual students.</p>
      <button className="primary privacy-gate-btn" onClick={revealSensitive}>
        Show student details
      </button>
      <p className="muted">It will be covered again when you leave this screen.</p>
    </div>
  );
}
