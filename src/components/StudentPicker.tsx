import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../store/appStore";
import { displayStudentName } from "../lib/privacy";
import { today } from "../lib/id";
import { flashTiming } from "../lib/motion";
import { EMPTY_ANSWER_TALLY, answerTallyByStudent } from "../lib/stats";
import { ANSWERED_BEHAVIOUR, BehaviourCode, BehaviourEvent, NO_ANSWER_BEHAVIOUR, Student } from "../lib/types";
import Icon from "./Icon";
import BehaviourButton from "./BehaviourButton";
import { modalOpen } from "./Modal";

/** Ids already picked this lesson, so "no repeats" survives a reload. Cleared by End lesson. */
export const pickedKey = (className: string) => `classkernel.picked.${className}`;


interface Props {
  onClose: () => void;
  /** This lesson's behaviour events — what the answer tally is counted from. */
  lessonEvents: BehaviourEvent[];
  /** Whether the picked student's record may be shown (off in privacy mode). */
  showTally: boolean;
  /** Records an event against a student, with the same undo toast as a seat tap. */
  onLogBehaviour: (studentId: string, code: BehaviourCode) => void;
}

/**
 * Full-screen random-student picker for the live lesson: flashes through the
 * candidates like the seat shuffle, then lands on one name shown huge. Under
 * the name are the two answer buttons, so a cold-called student's answer is
 * one tap away, plus every other behaviour behind "Other behaviour". Nothing
 * else is shown unless privacy mode is off, so it stays class-facing safe.
 */
export default function StudentPicker({ onClose, lessonEvents, showTally, onLogBehaviour }: Props) {
  const { students, attendance, currentClass, userPrefs, behaviourCodes } = useAppPick(
    "students",
    "attendance",
    "currentClass",
    "userPrefs",
    "behaviourCodes",
  );
  const [skipAbsent, setSkipAbsent] = useState(true);
  const [noRepeats, setNoRepeats] = useState(true);
  const [display, setDisplay] = useState("");
  const [chosen, setChosen] = useState<Student | null>(null);
  const [settled, setSettled] = useState(false);
  const [note, setNote] = useState("");
  const [showOthers, setShowOthers] = useState(false);
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
    setChosen(null);
    setShowOthers(false);
    const day = today();
    const attToday = attendance.filter((e) => e.date === day);
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
    const winner = pool[Math.floor(Math.random() * pool.length)];
    setSettled(false);
    let frame = 0;
    const { frames, intervalMs } = flashTiming(14, 80);
    timer.current = setInterval(() => {
      frame++;
      if (frame >= frames) {
        clearInterval(timer.current);
        setDisplay(displayStudentName(winner, userPrefs.seatNameStyle));
        setChosen(winner);
        setSettled(true);
        if (noRepeats && currentClass) {
          localStorage.setItem(pickedKey(currentClass), JSON.stringify([...readPicked(), winner.id]));
        }
        return;
      }
      const flash = pool[Math.floor(Math.random() * pool.length)];
      setDisplay(displayStudentName(flash, userPrefs.seatNameStyle));
    }, intervalMs);
  }, [students, attendance, skipAbsent, noRepeats, currentClass, userPrefs.seatNameStyle, readPicked]);

  useEffect(() => {
    pick();
    return () => clearInterval(timer.current);
    // Run once on open; "Pick again" re-runs it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || modalOpen()) return;
      // Taken first and marked handled, so Escape closes the picker without
      // also leaving teaching mode. It backs out of the behaviour list first.
      e.preventDefault();
      if (showOthers) setShowOthers(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, showOthers]);

  // The answer buttons use the teacher's own catalogue entries where they
  // exist, so renaming or recolouring them in Settings carries through here.
  const answered = behaviourCodes.find((c) => c.code === ANSWERED_BEHAVIOUR.code) ?? ANSWERED_BEHAVIOUR;
  const noAnswer = behaviourCodes.find((c) => c.code === NO_ANSWER_BEHAVIOUR.code) ?? NO_ANSWER_BEHAVIOUR;
  const others = behaviourCodes.filter((c) => c.code !== answered.code && c.code !== noAnswer.code);
  const otherCodes = [...others.filter((c) => c.kind === "positive"), ...others.filter((c) => c.kind === "negative")];

  const tally = useMemo(
    () => (chosen ? answerTallyByStudent(lessonEvents).get(chosen.id) ?? EMPTY_ANSWER_TALLY : EMPTY_ANSWER_TALLY),
    [lessonEvents, chosen],
  );

  const log = (code: BehaviourCode) => {
    if (!chosen) return;
    onLogBehaviour(chosen.id, code);
    setShowOthers(false);
  };

  // Recording the answer is the end of a cold call: the picker gets out of the way.
  const logAnswer = (code: BehaviourCode) => {
    log(code);
    onClose();
  };

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-card" onClick={(e) => e.stopPropagation()}>
        <div className={`picker-name ${settled ? "settled" : ""}`}>{display || "…"}</div>
        {showTally && chosen && (
          <div className="picker-tally">
            <span className="yes">✓ {tally.answered}</span>
            <span className="no">✗ {tally.missed}</span>
            <span className="muted">
              {tally.asked === 0
                ? "not asked yet this lesson"
                : `asked ${tally.asked} time${tally.asked === 1 ? "" : "s"} this lesson`}
            </span>
          </div>
        )}
        {note && <p className="muted">{note}</p>}
        {chosen && (
          <>
            <div className="picker-answer">
              <BehaviourButton
                code={answered}
                className=""
                icon={<Icon name="check" size={20} />}
                onClick={() => logAnswer(answered)}
                title="Record that they answered"
              />
              <BehaviourButton
                code={noAnswer}
                className=""
                icon={<Icon name="close" size={20} />}
                onClick={() => logAnswer(noAnswer)}
                title="Record that they could not answer"
              />
              {otherCodes.length > 0 && (
                <button className="picker-other" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}>
                  <Icon name="more_horiz" size={20} /> Other behaviour
                </button>
              )}
            </div>
            {showOthers && (
              <div className="picker-more">
                {otherCodes.map((c) => (
                  <BehaviourButton key={c.code} code={c} onClick={() => log(c)} />
                ))}
              </div>
            )}
          </>
        )}
        <div className="picker-actions">
          <button className="primary" onClick={pick}>
            <Icon name="casino" size={20} /> Pick again
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
