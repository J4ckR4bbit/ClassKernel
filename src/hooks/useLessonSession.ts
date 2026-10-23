import { useEffect, useMemo, useState } from "react";
import { useApp, useLessonRunning, useAppPick } from "../store/appStore";
import { newId, nowIso, today } from "../lib/id";
import {
  AttendanceStatus,
  BathroomVisit,
  BehaviourCode,
  BehaviourEvent,
  LessonRecord,
  SeatAssignment,
  studentName,
} from "../lib/types";
import { eventsOnDate, formatDuration, visitSeconds } from "../lib/stats";
import { lessonStartKey, lessonStartedMessage } from "../lib/lessonState";
import { deskDisplayLabels } from "../lib/tables";
import { pickedKey } from "../components/StudentPicker";
import type { SeatBadge } from "../components/RoomCanvas";
import { behaviourText } from "../components/BehaviourButton";


const STATUS_LABEL: Record<AttendanceStatus, string> = { P: "present", A: "absent", L: "late", E: "excused" };

/** How a student's seat (or strip row) is marked: out at the bathroom first, then absent, late or excused. */
export function seatBadge(status: AttendanceStatus | undefined, out: boolean): SeatBadge | undefined {
  if (out) return { icon: "wc", tone: "out", label: "Out at the bathroom" };
  if (status === "A") return { icon: "close", tone: "absent", label: "Absent" };
  if (status === "L") return { text: "L", tone: "late", label: "Late" };
  if (status === "E") return { text: "E", tone: "excused", label: "Excused" };
  return undefined;
}

/**
 * The running lesson, shared by the room-plan Live lesson and the teaching
 * strip so the two can never disagree: what counts as "this lesson", each
 * student's points and attendance, and the actions that record against it.
 */
export function useLessonSession() {
  const {
    currentClass,
    students,
    desks,
    behaviourEvents,
    addBehaviourEvent,
    removeBehaviourEvent,
    addBehaviourEvents,
    removeBehaviourEvents,
    bathroomVisits,
    startBathroomVisit,
    endBathroomVisit,
    addLessonRecords,
    attendance,
    setAttendance,
    showToast,
    userPrefs,
    confirmDialog,
    unlockSeating,
    startLesson: beginLesson,
    stopLesson,
  } = useAppPick(
    "currentClass",
    "students",
    "desks",
    "behaviourEvents",
    "addBehaviourEvent",
    "removeBehaviourEvent",
    "addBehaviourEvents",
    "removeBehaviourEvents",
    "bathroomVisits",
    "startBathroomVisit",
    "endBathroomVisit",
    "addLessonRecords",
    "attendance",
    "setAttendance",
    "showToast",
    "userPrefs",
    "confirmDialog",
    "unlockSeating",
    "startLesson",
    "stopLesson",
  );
  const running = useLessonRunning();

  // "This lesson" is everything logged since the last End-lesson reset (or the
  // start of today if a lesson has never been ended for this class).
  const [lessonStart, setLessonStart] = useState<string | null>(null);
  useEffect(() => {
    setLessonStart(currentClass ? localStorage.getItem(lessonStartKey(currentClass)) : null);
  }, [currentClass]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const lessonEvents = useMemo(
    () => (lessonStart ? behaviourEvents.filter((e) => e.timestamp >= lessonStart) : eventsOnDate(behaviourEvents, today())),
    [behaviourEvents, lessonStart],
  );
  const pointsToday = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of lessonEvents) m.set(e.studentId, (m.get(e.studentId) ?? 0) + e.points);
    return m;
  }, [lessonEvents]);

  // Whether the class-facing screen shows the running points scoreboard.
  const pointsVisible = userPrefs.privacyMode ? userPrefs.showSeatPoints : true;

  // Today's register as a lookup: the room plan asks it once per seat.
  const day = today();
  const statusToday = useMemo(() => {
    const m = new Map<string, AttendanceStatus>();
    for (const e of attendance) if (e.date === day && !m.has(e.studentId)) m.set(e.studentId, e.status);
    return m;
  }, [attendance, day]);
  const statusOf = (id: string) => statusToday.get(id);

  // Bathroom timers: a visit without an end time is a student who is out now.
  // The running times tick in <Elapsed>, so the room plan doesn't redraw every second.
  const outNow = useMemo(() => bathroomVisits.filter((v) => !v.end), [bathroomVisits]);
  const outById = useMemo(() => {
    const m = new Map<string, BathroomVisit>();
    for (const v of outNow) if (!m.has(v.studentId)) m.set(v.studentId, v);
    return m;
  }, [outNow]);
  const outVisitOf = (id: string) => outById.get(id);

  // In privacy mode toasts stay nameless — the teacher just tapped that
  // student, so the name adds nothing the class should see.
  const toastName = (studentId: string) => {
    const s = byId.get(studentId);
    return !userPrefs.privacyMode && s ? studentName(s) : "recorded";
  };

  const toggleBathroom = (studentId: string) => {
    const open = outVisitOf(studentId);
    if (open) {
      void endBathroomVisit(studentId);
      showToast(`Back from the bathroom after ${formatDuration(visitSeconds(open))} — ${toastName(studentId)}`);
    } else {
      void startBathroomVisit(studentId);
      showToast(`Bathroom timer started — ${toastName(studentId)}`);
    }
  };

  const logBehaviour = (studentId: string, c: BehaviourCode) => {
    const timestamp = nowIso();
    void addBehaviourEvent({ timestamp, studentId, code: c.code, points: c.points, note: "" });
    showToast(`${behaviourText(c)} — ${toastName(studentId)}`, {
      label: "Undo",
      run: () => void removeBehaviourEvent(timestamp, studentId, c.code),
    });
  };

  /** Batch entry: the same behaviour for every selected student, one write, one undo. */
  const logBatch = (c: BehaviourCode, studentIds: string[]) => {
    if (studentIds.length === 0) return;
    const timestamp = nowIso();
    const events: BehaviourEvent[] = studentIds.map((studentId) => ({
      timestamp,
      studentId,
      code: c.code,
      points: c.points,
      note: "",
    }));
    void addBehaviourEvents(events);
    const n = studentIds.length;
    showToast(`${behaviourText(c)} — ${n} student${n === 1 ? "" : "s"}`, {
      label: "Undo",
      run: () => void removeBehaviourEvents(timestamp, c.code, studentIds),
    });
  };

  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    const date = today();
    const before = attendance.find((e) => e.date === date && e.studentId === studentId);
    const rest = attendance.filter((e) => e !== before);
    void setAttendance([...rest, { date, studentId, status, note: "" }]);
    // The pop-up closes on the tap, so say what was recorded, with a way back.
    showToast(`Marked ${STATUS_LABEL[status]} — ${toastName(studentId)}`, {
      label: "Undo",
      run: () => {
        const now = useApp.getState().attendance.filter((e) => !(e.date === date && e.studentId === studentId));
        void setAttendance(before ? [...now, before] : now);
      },
    });
  };

  /** Start the lesson: everyone not yet marked today is marked present. */
  const startLesson = async () => {
    const day = today();
    const registerBefore = useApp.getState().attendance.filter((e) => e.date === day);
    const added = await beginLesson();
    if (added === null) return;
    showToast(lessonStartedMessage("Lesson started", added), {
      label: "Undo",
      run: () => {
        // Back to before the tap: no lesson running, and today's register as it was.
        stopLesson();
        const now = useApp.getState().attendance.filter((e) => e.date !== day);
        void setAttendance([...now, ...registerBefore]);
      },
    });
  };

  /** Save each student's seat and behaviour to history, then start a fresh lesson. Resolves true if ended. */
  const endLesson = async (planSeats: SeatAssignment[]): Promise<boolean> => {
    if (!currentClass || planSeats.length === 0) return false;
    const ok = await confirmDialog({
      title: `End the lesson for ${currentClass}?`,
      body: "This saves each student's seat and this lesson's behaviour to the class history (used for seating insights), then starts a fresh count.",
      confirmLabel: "End lesson",
    });
    if (!ok) return false;
    const sessionId = newId("les");
    const timestamp = nowIso();
    const date = today();
    const labels = deskDisplayLabels(desks);
    const deskOccupants = new Map<string, string[]>();
    for (const seat of planSeats) {
      const list = deskOccupants.get(seat.deskId) ?? [];
      list.push(seat.studentId);
      deskOccupants.set(seat.deskId, list);
    }
    const records: LessonRecord[] = planSeats.map((seat) => {
      const deskLabel = labels.get(seat.deskId) ?? seat.deskId;
      const seatmates = (deskOccupants.get(seat.deskId) ?? []).filter((id) => id !== seat.studentId).join(";");
      const evs = lessonEvents.filter((e) => e.studentId === seat.studentId);
      return {
        sessionId,
        date,
        timestamp,
        studentId: seat.studentId,
        deskId: seat.deskId,
        deskLabel,
        seatmates,
        points: evs.reduce((a, e) => a + e.points, 0),
        positives: evs.filter((e) => e.points > 0).length,
        negatives: evs.filter((e) => e.points < 0).length,
      };
    });
    await addLessonRecords(records);
    localStorage.setItem(lessonStartKey(currentClass), timestamp);
    localStorage.removeItem(pickedKey(currentClass));
    // A new lesson may have its seats assigned again.
    unlockSeating();
    stopLesson();
    setLessonStart(timestamp);
    showToast(`Lesson ended — saved ${records.length} seat records to history`);
    return true;
  };

  return {
    running,
    startLesson,
    byId,
    lessonEvents,
    pointsToday,
    pointsVisible,
    statusOf,
    outNow,
    outVisitOf,
    toggleBathroom,
    logBehaviour,
    logBatch,
    markAttendance,
    endLesson,
  };
}
