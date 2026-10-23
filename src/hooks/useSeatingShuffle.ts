import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { SeatAssignment } from "../lib/types";
import { assignRandomSeats } from "../lib/seating";
import { lessonStartedMessage } from "../lib/lessonState";
import { today } from "../lib/id";
import { flashTiming } from "../lib/motion";

const SHUFFLE_FRAMES = 12;
const SHUFFLE_INTERVAL = 90;

/**
 * Animated reroll shared by the Seating and Live-lesson views: it flashes the
 * names across the final seats for ~1s before settling, so the class can see the
 * seating really is being shuffled. Uses the class's saved (hidden) seating
 * rules and persists the result to the given plan.
 *
 * Seats are assigned once per lesson: after a successful reroll the class is
 * locked (see lessonState.ts) until End lesson, a new day, or the reseat PIN.
 * Every Randomise button goes through here, so the lock can't be sidestepped.
 * A reroll also starts the lesson if one isn't running yet.
 */
export function useSeatingShuffle() {
  const [shuffleFrame, setShuffleFrame] = useState<SeatAssignment[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Subscribing to the stamp re-renders the buttons when the lock changes.
  useApp((s) => s.seatingLockedAt);
  useApp((s) => s.currentClass);
  const locked = useApp.getState().seatingLocked();

  // Clear the handle too, not just the interval: StrictMode's dev remount
  // reuses this ref, and a stale handle would make randomise() bail forever.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    },
    [],
  );

  const isShuffling = shuffleFrame !== null;

  const randomise = (activePlan: string) => {
    if (timer.current) return;
    // Read live state at call time so the result is never stale.
    const { students, desks, seatingPrefs, roomConfig, showToast, seatingLocked } = useApp.getState();
    if (seatingLocked()) {
      showToast("Seats already assigned this lesson — use Reseat… to unlock with your PIN");
      return;
    }
    const result = assignRandomSeats(students, desks, activePlan, {
      ...seatingPrefs,
      frontEdge: roomConfig.frontEdge,
    });
    if (result.assignments.length === 0) {
      showToast("Add desks and students first");
      return;
    }
    const targetSeats = result.assignments.map((a) => ({ deskId: a.deskId, seatIndex: a.seatIndex }));
    const ids = result.assignments.map((a) => a.studentId);
    let frame = 0;
    const { frames, intervalMs } = flashTiming(SHUFFLE_FRAMES, SHUFFLE_INTERVAL);
    timer.current = setInterval(() => {
      frame++;
      const shuffled = [...ids];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setShuffleFrame(
        targetSeats.map((s, i) => ({ planName: activePlan, deskId: s.deskId, seatIndex: s.seatIndex, studentId: shuffled[i] })),
      );
      if (frame >= frames) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setShuffleFrame(null);
        const cur = useApp.getState();
        // What Undo puts back: this plan's seats and, if Randomise started the
        // lesson, today's register as it was.
        const previousPlan = cur.seating.filter((s) => s.planName === activePlan);
        const day = today();
        const registerBefore = cur.attendance.filter((e) => e.date === day);
        cur.markSeated();
        void cur.setSeating([
          ...cur.seating.filter((s) => s.planName !== activePlan),
          ...result.assignments.map((a) => ({ ...a, planName: activePlan })),
        ]);
        const seated = result.violations.length
          ? `Seated with ${result.violations.length} unmet constraint${result.violations.length > 1 ? "s" : ""}`
          : "Seating randomised";
        void cur.startLesson().then((added) =>
          useApp.getState().showToast(added === null ? seated : lessonStartedMessage(`${seated}, lesson started`, added), {
            label: "Undo",
            run: () => {
              // The seat lock stays on: Undo puts back a mistaken tap, it isn't
              // a way to reroll without the PIN.
              const st = useApp.getState();
              void st.setSeating([...st.seating.filter((s) => s.planName !== activePlan), ...previousPlan]);
              if (added !== null) {
                st.stopLesson();
                void st.setAttendance([...st.attendance.filter((e) => e.date !== day), ...registerBefore]);
              }
            },
          }),
        );
      }
    }, intervalMs);
  };

  const requestUnlock = () => void useApp.getState().requestSeatingUnlock();

  return { shuffleFrame, isShuffling, randomise, locked, requestUnlock };
}
