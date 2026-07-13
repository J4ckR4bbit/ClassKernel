import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { newId, nowIso, today } from "../lib/id";
import { AttendanceStatus, LessonRecord, SEAT_COUNTS, studentName } from "../lib/types";
import { eventsOnDate } from "../lib/stats";
import RoomCanvas, { ROOM_H, ROOM_W } from "./RoomCanvas";

const lessonKey = (className: string) => `classkernel.lessonStart.${className}`;

interface Popover {
  studentId: string;
  x: number;
  y: number;
}

/**
 * The "live lesson" screen: the seating plan is the interface. Tap a seat to
 * log behaviour or take attendance for that student; running points for
 * today's lesson show under each name.
 */
export default function LessonView() {
  const {
    currentClass,
    students,
    desks,
    seating,
    behaviourCodes,
    behaviourEvents,
    addBehaviourEvent,
    addLessonRecords,
    attendance,
    setAttendance,
    showToast,
    setView,
    roomConfig,
    focusMode,
    setFocusMode,
  } = useApp();
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [popover, setPopover] = useState<Popover | null>(null);

  // "This lesson" is everything logged since the last End-lesson reset (or the
  // start of today if a lesson has never been ended for this class).
  const [lessonStart, setLessonStart] = useState<string | null>(null);
  useEffect(() => {
    setLessonStart(currentClass ? localStorage.getItem(lessonKey(currentClass)) : null);
  }, [currentClass]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const lessonEvents = useMemo(
    () => (lessonStart ? behaviourEvents.filter((e) => e.timestamp >= lessonStart) : eventsOnDate(behaviourEvents, today())),
    [behaviourEvents, lessonStart],
  );
  const pointsToday = new Map<string, number>();
  for (const e of lessonEvents) pointsToday.set(e.studentId, (pointsToday.get(e.studentId) ?? 0) + e.points);

  // Friendly fallback names for unlabelled desks, so lesson history is readable.
  const deskFallback = useMemo(() => {
    const m = new Map<string, string>();
    let n = 0;
    for (const d of desks) {
      if (SEAT_COUNTS[d.shape] > 0) {
        n++;
        m.set(d.id, d.label.trim() || `Desk ${n}`);
      }
    }
    return m;
  }, [desks]);

  const endLesson = async () => {
    if (!currentClass || planSeats.length === 0) return;
    if (
      !confirm(
        `End the lesson for ${currentClass}?\n\nThis saves each student's seat and this lesson's behaviour to the class history (used for seating insights), then starts a fresh count.`,
      )
    )
      return;
    const sessionId = newId("les");
    const timestamp = nowIso();
    const date = today();
    const deskOccupants = new Map<string, string[]>();
    for (const seat of planSeats) {
      const list = deskOccupants.get(seat.deskId) ?? [];
      list.push(seat.studentId);
      deskOccupants.set(seat.deskId, list);
    }
    const records: LessonRecord[] = planSeats.map((seat) => {
      const desk = desks.find((d) => d.id === seat.deskId);
      const deskLabel = desk?.label.trim() || deskFallback.get(seat.deskId) || seat.deskId;
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
    localStorage.setItem(lessonKey(currentClass), timestamp);
    setLessonStart(timestamp);
    setPopover(null);
    showToast(`Lesson ended — saved ${records.length} seat records to history`);
  };

  const attendanceToday = attendance.filter((e) => e.date === today());
  const statusOf = (id: string) => attendanceToday.find((e) => e.studentId === id)?.status;

  const logBehaviour = (studentId: string, code: string) => {
    const c = behaviourCodes.find((c) => c.code === code);
    if (!c) return;
    void addBehaviourEvent({ timestamp: nowIso(), studentId, code: c.code, points: c.points, note: "" });
    const s = byId.get(studentId);
    showToast(`${c.points > 0 ? "+" : ""}${c.points} ${c.label} — ${s ? studentName(s) : ""}`);
    setPopover(null);
  };

  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    const rest = attendance.filter((e) => !(e.date === today() && e.studentId === studentId));
    void setAttendance([...rest, { date: today(), studentId, status, note: "" }]);
    setPopover(null);
  };

  const popStudent = popover ? byId.get(popover.studentId) : undefined;
  const positives = behaviourCodes.filter((c) => c.kind === "positive");
  const negatives = behaviourCodes.filter((c) => c.kind === "negative");

  // In teaching mode the whole room scales to fit when no crop is set; otherwise
  // it honours the class's view crop just like the normal live lesson.
  const effectiveCrop = focusMode ? roomConfig.crop ?? { x: 0, y: 0, w: ROOM_W, h: ROOM_H } : roomConfig.crop;

  if (desks.length === 0 || planSeats.length === 0) {
    return (
      <div>
        {focusMode ? (
          <div className="focus-bar">
            <button onClick={() => setFocusMode(false)}>✕ Exit teaching mode</button>
            <span className="muted">Set up a room layout and seating plan to teach from.</span>
          </div>
        ) : (
          <div className="view-header">
            <h1>{currentClass} — Live lesson</h1>
          </div>
        )}
        <div className="panel">
          You need a room layout and a seating plan first.{" "}
          <button className="small" onClick={() => setView(desks.length === 0 ? "layout" : "seating")}>
            {desks.length === 0 ? "Design your room →" : "Create a seating plan →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {focusMode ? (
        <div className="focus-bar">
          <button onClick={() => setFocusMode(false)} title="Back to the full app (or press Esc)">
            ✕ Exit teaching mode
          </button>
          {planNames.length > 1 && (
            <select value={activePlan} onChange={(e) => setPlan(e.target.value)}>
              {planNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          <div className="spacer" />
          <span className="muted">
            {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"} this lesson
          </span>
          <button className="danger" onClick={() => void endLesson()}>
            ⏹ End lesson
          </button>
        </div>
      ) : (
        <div className="view-header">
          <h1>{currentClass} — Live lesson</h1>
          {planNames.length > 1 && (
            <select value={activePlan} onChange={(e) => setPlan(e.target.value)}>
              {planNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          )}
          <div className="spacer" />
          <span className="muted">
            {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"} this lesson · tap a seat to record
            behaviour or attendance
          </span>
          <button onClick={() => setFocusMode(true)} title="Distraction-free view for teaching, beside your notes">
            ⛶ Teaching mode
          </button>
          <button className="danger" onClick={() => void endLesson()} disabled={planSeats.length === 0}>
            ⏹ End lesson
          </button>
        </div>
      )}

      <div className={focusMode ? "focus-canvas-wrap" : ""} style={{ position: "relative" }}>
        <RoomCanvas
          desks={desks}
          frontEdge={roomConfig.frontEdge}
          crop={effectiveCrop}
          seatFontScale={roomConfig.seatFontScale}
          deskFontScale={roomConfig.deskFontScale}
          labelFontScale={roomConfig.labelFontScale}
          seatContent={(deskId, seatIndex) => {
            const occ = planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
            const s = occ ? byId.get(occ.studentId) : undefined;
            const status = s ? statusOf(s.id) : undefined;
            return {
              label: s ? studentName(s) : "",
              firstName: s?.firstName,
              lastName: s?.lastName,
              badge: status === "A" ? "✗" : undefined,
              occupied: !!s,
              points: s ? pointsToday.get(s.id) ?? 0 : null,
            };
          }}
          onSeatClick={(deskId, seatIndex, x, y) => {
            const occ = planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
            if (occ) setPopover({ studentId: occ.studentId, x, y });
          }}
        />

        {popover && popStudent && (
          <div
            className="behaviour-popover"
            style={{
              left: Math.max(4, Math.min(popover.x + 24, window.innerWidth - 230 - 48 - 280)),
              top: Math.max(popover.y - 40, 4),
            }}
          >
            <h4>
              {studentName(popStudent)}
              {popStudent.flags &&
                popStudent.flags
                  .split(";")
                  .filter(Boolean)
                  .map((f) => (
                    <span key={f} className="tag warn" style={{ marginLeft: 6 }}>
                      {f}
                    </span>
                  ))}
            </h4>
            {popStudent.notes && <p className="muted" style={{ marginTop: 0 }}>{popStudent.notes}</p>}
            <div className="row" style={{ marginBottom: 8 }}>
              {(["P", "A", "L", "E"] as AttendanceStatus[]).map((code) => (
                <button
                  key={code}
                  className={`att-btn ${code} ${statusOf(popStudent.id) === code ? "on" : ""}`}
                  onClick={() => markAttendance(popStudent.id, code)}
                >
                  {code}
                </button>
              ))}
            </div>
            {positives.map((c) => (
              <button key={c.code} className="bh-btn" style={{ background: c.color }} onClick={() => logBehaviour(popStudent.id, c.code)}>
                +{c.points} {c.label}
              </button>
            ))}
            {negatives.map((c) => (
              <button key={c.code} className="bh-btn" style={{ background: c.color }} onClick={() => logBehaviour(popStudent.id, c.code)}>
                {c.points} {c.label}
              </button>
            ))}
            <button style={{ width: "100%", marginTop: 6 }} onClick={() => setPopover(null)}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
