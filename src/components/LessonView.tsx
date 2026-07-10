import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { nowIso, today } from "../lib/id";
import { AttendanceStatus, studentName } from "../lib/types";
import { eventsOnDate } from "../lib/stats";
import RoomCanvas from "./RoomCanvas";

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
    attendance,
    setAttendance,
    showToast,
    setView,
  } = useApp();
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [popover, setPopover] = useState<Popover | null>(null);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const todayEvents = eventsOnDate(behaviourEvents, today());
  const pointsToday = new Map<string, number>();
  for (const e of todayEvents) pointsToday.set(e.studentId, (pointsToday.get(e.studentId) ?? 0) + e.points);

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

  if (desks.length === 0 || planSeats.length === 0) {
    return (
      <div>
        <div className="view-header">
          <h1>{currentClass} — Live lesson</h1>
        </div>
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
          {todayEvents.length} events logged today · tap a seat to record behaviour or attendance
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <RoomCanvas
          desks={desks}
          seatContent={(deskId, seatIndex) => {
            const occ = planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
            const s = occ ? byId.get(occ.studentId) : undefined;
            const status = s ? statusOf(s.id) : undefined;
            return {
              label: s ? `${s.firstName} ${s.lastName.charAt(0)}`.trim() + (status === "A" ? " ✗" : "") : "",
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
            style={{ left: Math.min(popover.x + 24, 620), top: Math.max(popover.y - 40, 4) }}
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
