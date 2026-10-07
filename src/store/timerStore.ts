import { create } from "zustand";
import { TimerDisplay } from "../lib/types";
import { chime } from "../lib/chime";
import {
  TimerPhase,
  TimerState,
  addMinute as addMinuteTo,
  pauseTimer,
  resumeTimer,
  skipPhase,
  startTimer,
  tick,
} from "../lib/timer";

/**
 * The test timer, kept outside any one screen so leaving the timer view
 * doesn't stop it: the countdown runs here, the timer screen shows it full
 * size, and the small pop-up (TimerMini) shows it everywhere else.
 */
interface TimerStore {
  /** The running (or finished) timer; null when none is set. */
  timer: TimerState | null;
  display: TimerDisplay;
  chimeOn: boolean;
  /** The teacher closed the "Time's up" pop-up for this timer. */
  dismissed: boolean;
  start(phases: TimerPhase[], display: TimerDisplay, chimeOn: boolean): void;
  pause(): void;
  resume(): void;
  addMinute(): void;
  skip(): void;
  stop(): void;
  dismiss(): void;
}

let interval: ReturnType<typeof setInterval> | null = null;

export const useTimer = create<TimerStore>((set, get) => {
  // One interval for the whole app, running only while a timer is counting.
  const syncTicking = () => {
    const running = !!get().timer?.running;
    if (running && !interval) {
      interval = setInterval(() => {
        const { timer, chimeOn } = get();
        if (!timer) return;
        const { state, event } = tick(timer, Date.now());
        if (event !== "none" && chimeOn) chime(event === "finish" ? 3 : 2);
        set({ timer: state });
        if (!state.running) syncTicking();
      }, 200);
    } else if (!running && interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  const update = (fn: (t: TimerState) => TimerState) => {
    const { timer } = get();
    if (!timer) return;
    set({ timer: fn(timer) });
    syncTicking();
  };

  return {
    timer: null,
    display: "circle",
    chimeOn: true,
    dismissed: false,
    start(phases, display, chimeOn) {
      if (phases.length === 0) return;
      set({ timer: startTimer(phases, Date.now()), display, chimeOn, dismissed: false });
      syncTicking();
    },
    pause: () => update((t) => pauseTimer(t, Date.now())),
    resume: () => update((t) => resumeTimer(t, Date.now())),
    addMinute: () => update(addMinuteTo),
    skip: () => update((t) => skipPhase(t, Date.now())),
    stop() {
      set({ timer: null, dismissed: false });
      syncTicking();
    },
    dismiss: () => set({ dismissed: true }),
  };
});
