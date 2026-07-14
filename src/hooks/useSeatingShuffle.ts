import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { SeatAssignment } from "../lib/types";
import { assignRandomSeats } from "../lib/seating";

const SHUFFLE_FRAMES = 12;
const SHUFFLE_INTERVAL = 90;

/**
 * Animated reroll shared by the Seating and Live-lesson views: it flashes the
 * names across the final seats for ~1s before settling, so the class can see the
 * seating really is being shuffled. Uses the class's saved (hidden) seating
 * rules and persists the result to the given plan.
 */
export function useSeatingShuffle() {
  const [shuffleFrame, setShuffleFrame] = useState<SeatAssignment[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const isShuffling = shuffleFrame !== null;

  const randomise = (activePlan: string) => {
    if (timer.current) return;
    // Read live state at call time so the result is never stale.
    const { students, desks, seatingPrefs, roomConfig, showToast } = useApp.getState();
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
      if (frame >= SHUFFLE_FRAMES) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setShuffleFrame(null);
        const cur = useApp.getState();
        void cur.setSeating([
          ...cur.seating.filter((s) => s.planName !== activePlan),
          ...result.assignments.map((a) => ({ ...a, planName: activePlan })),
        ]);
        cur.showToast(
          result.violations.length
            ? `Seated with ${result.violations.length} unmet constraint${result.violations.length > 1 ? "s" : ""}`
            : "Seating randomised",
        );
      }
    }, SHUFFLE_INTERVAL);
  };

  return { shuffleFrame, isShuffling, randomise };
}
