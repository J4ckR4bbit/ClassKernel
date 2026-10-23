// Whether Windows (Settings → Accessibility → Visual effects → Animation
// effects off) asks for less motion. The seat shuffle and the student picker
// then flash through fewer names, more slowly.

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Frames and frame length for a name-flashing animation, calmer when less motion is asked for. */
export function flashTiming(frames: number, intervalMs: number): { frames: number; intervalMs: number } {
  return prefersReducedMotion() ? { frames: Math.min(frames, 3), intervalMs: Math.max(intervalMs, 300) } : { frames, intervalMs };
}
