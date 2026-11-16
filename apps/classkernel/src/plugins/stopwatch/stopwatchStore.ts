import { create } from "zustand";
import { INITIAL, StopwatchState, lap, pause, restart, start } from "./stopwatch";

/**
 * The stopwatch, kept outside its screen so a timing carries on while the
 * teacher looks something up elsewhere in the app. It holds timestamps only —
 * nothing ticks here; the stopwatch screen redraws itself while it is open.
 */
interface StopwatchStore {
  sw: StopwatchState;
  start(): void;
  pause(): void;
  lap(): void;
  restart(): void;
}

export const useStopwatch = create<StopwatchStore>((set) => {
  const apply = (fn: (s: StopwatchState, now: number) => StopwatchState) => set((st) => ({ sw: fn(st.sw, Date.now()) }));
  return {
    sw: INITIAL,
    start: () => apply(start),
    pause: () => apply(pause),
    lap: () => apply(lap),
    restart: () => apply(restart),
  };
});
