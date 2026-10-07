import { useApp } from "../store/appStore";
import { AttendanceStatus, BathroomVisit, BehaviourCode, Student, studentName } from "../lib/types";
import { formatDuration, visitSeconds } from "../lib/stats";

interface Props {
  student: Student;
  status: AttendanceStatus | undefined;
  /** The student's running bathroom trip, if they're out now. */
  outVisit: BathroomVisit | undefined;
  onAttendance: (status: AttendanceStatus) => void;
  onBathroom: () => void;
  onBehaviour: (code: BehaviourCode) => void;
  onClose: () => void;
}

/**
 * Everything the teacher can record for one student during a lesson:
 * attendance, a bathroom timer and the behaviour buttons. Shown as the seat
 * popover on the room plan and as a sheet in the teaching strip.
 */
export default function StudentActions({ student, status, outVisit, onAttendance, onBathroom, onBehaviour, onClose }: Props) {
  const { behaviourCodes, userPrefs } = useApp();
  const positives = behaviourCodes.filter((c) => c.kind === "positive");
  const negatives = behaviourCodes.filter((c) => c.kind === "negative");
  const showFlags = student.flags && (!userPrefs.privacyMode || userPrefs.popoverShowFlags);
  const showNotes = student.notes && (!userPrefs.privacyMode || userPrefs.popoverShowNotes);

  return (
    <>
      <h4>
        {studentName(student)}
        {showFlags &&
          student.flags
            .split(";")
            .filter(Boolean)
            .map((f) => (
              <span key={f} className="tag warn" style={{ marginLeft: 6 }}>
                {f}
              </span>
            ))}
      </h4>
      {showNotes && <p className="muted" style={{ marginTop: 0 }}>{student.notes}</p>}
      <div className="att-seg" role="radiogroup" aria-label="Attendance" style={{ marginBottom: 2 }}>
        {(["P", "A", "L", "E"] as AttendanceStatus[]).map((code) => (
          <button
            key={code}
            role="radio"
            aria-checked={status === code}
            className={`att-btn ${code} ${status === code ? "on" : ""}`}
            onClick={() => onAttendance(code)}
          >
            {code}
          </button>
        ))}
      </div>
      <div className="att-legend">P present · A absent · L late · E excused</div>
      <button
        className={`bathroom-btn ${outVisit ? "out" : ""}`}
        title="Time a bathroom trip; it's saved to the bathroom log when the student is back"
        onClick={onBathroom}
      >
        {outVisit ? `🚻 Back from bathroom · ${formatDuration(visitSeconds(outVisit))}` : "🚻 Bathroom — start timer"}
      </button>
      {positives.map((c) => (
        <button
          key={c.code}
          className="bh-btn"
          style={{ background: c.color }}
          onClick={() => onBehaviour(c)}
        >
          +{c.points} {c.label}
        </button>
      ))}
      {negatives.map((c) => (
        <button
          key={c.code}
          className="bh-btn"
          style={{ background: c.color }}
          onClick={() => onBehaviour(c)}
        >
          {c.points} {c.label}
        </button>
      ))}
      <button style={{ width: "100%", marginTop: 6 }} onClick={onClose}>
        Close
      </button>
    </>
  );
}
