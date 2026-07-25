import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { displayStudentName } from "../lib/privacy";
import { today } from "../lib/id";

/** Ids already picked this lesson, so "no repeats" survives a reload. Cleared by End lesson. */
export const pickedKey = (className: string) => `classkernel.picked.${className}`;

/**
 * Full-screen random-student picker for the live lesson: flashes through the
 * candidates like the seat shuffle, then lands on one name shown huge. Shows
 * exactly one name and nothing else, so it's safe on the class-facing screen.
 */
export default function StudentPicker({ onClose }: { onClose: () => void }) {
  const { students, attendance, currentClass, userPrefs } = useApp();
  const [skipAbsent, setSkipAbsent] = useState(true);
  const [noRepeats, setNoRepeats] = useState(true);
  const [display, setDisplay] = useState("");
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const readPicked = useCallback((): string[] => {
    if (!currentClass) return [];
    try {
      const raw = JSON.parse(localStorage.getItem(pickedKey(currentClass)) ?? "[]");
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }, [currentClass]);

  const pick = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    setNote("");
    const attToday = attendance.filter((e) => e.date === today());
    const statusOf = (id: string) => attToday.find((e) => e.studentId === id)?.status;
    let pool = students.filter((s) => !skipAbsent || (statusOf(s.id) !== "A" && statusOf(s.id) !== "E"));
    if (noRepeats) {
      const picked = new Set(readPicked());
      const fresh = pool.filter((s) => !picked.has(s.id));
      if (fresh.length === 0 && pool.length > 0) {
        // Everyone has had a turn — start a new round rather than dead-ending.
        if (currentClass) localStorage.removeItem(pickedKey(currentClass));
        setNote("Everyone has had a turn — starting a new round.");
      } else {
        pool = fresh;
      }
    }
    if (pool.length === 0) {
      setDisplay("No students to pick");
      setSettled(true);
      return;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    setSettled(false);
    let frame = 0;
    timer.current = setInterval(() => {
      frame++;
      if (frame >= 14) {
        clearInterval(timer.current);
        setDisplay(displayStudentName(chosen, userPrefs.seatNameStyle));
        setSettled(true);
        if (noRepeats && currentClass) {
          localStorage.setItem(pickedKey(currentClass), JSON.stringify([...readPicked(), chosen.id]));
        }
        return;
      }
      const flash = pool[Math.floor(Math.random() * pool.length)];
      setDisplay(displayStudentName(flash, userPrefs.seatNameStyle));
    }, 80);
  }, [students, attendance, skipAbsent, noRepeats, currentClass, userPrefs.seatNameStyle, readPicked]);

  useEffect(() => {
    pick();
    return () => clearInterval(timer.current);
    // Run once on open; "Pick again" re-runs it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-card" onClick={(e) => e.stopPropagation()}>
        <div className={`picker-name ${settled ? "settled" : ""}`}>{display || "…"}</div>
        {note && <p className="muted">{note}</p>}
        <div className="picker-actions">
          <button className="primary" onClick={pick}>
            🎲 Pick again
          </button>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="picker-options">
          <label>
            <input type="checkbox" checked={skipAbsent} onChange={(e) => setSkipAbsent(e.target.checked)} />
            Skip absent students
          </label>
          <label>
            <input type="checkbox" checked={noRepeats} onChange={(e) => setNoRepeats(e.target.checked)} />
            No repeats until the lesson ends
          </label>
        </div>
      </div>
    </div>
  );
}
