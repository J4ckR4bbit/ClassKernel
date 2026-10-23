import { useAppPick } from "../store/appStore";
import { AttendanceStatus, BathroomVisit, BehaviourCode, Student, studentName } from "../lib/types";
import { displayStudentName } from "../lib/privacy";
import Elapsed from "./Elapsed";
import Icon from "./Icon";
import BehaviourButton from "./BehaviourButton";

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
  const { behaviourCodes, userPrefs } = useAppPick("behaviourCodes", "userPrefs");
  const positives = behaviourCodes.filter((c) => c.kind === "positive");
  const negatives = behaviourCodes.filter((c) => c.kind === "negative");
  const showFlags = student.flags && (!userPrefs.privacyMode || userPrefs.popoverShowFlags);
  const showNotes = student.notes && (!userPrefs.privacyMode || userPrefs.popoverShowNotes);

  // The class can see this pop-up: in privacy mode it names the student as the seats do.
  const name = userPrefs.privacyMode ? displayStudentName(student, userPrefs.seatNameStyle) : studentName(student);

  return (
    <>
      <div className="sa-head">
        <h4>
          {name}
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
        <button className="icon-only small" onClick={onClose} title="Close (Esc)" aria-label="Close">
          <Icon name="close" size={20} />
        </button>
      </div>
      {showNotes && <p className="muted lead">{student.notes}</p>}
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
        <Icon name="wc" size={20} />
        {outVisit ? (
          <>
            Back from bathroom · <Elapsed visit={outVisit} />
          </>
        ) : (
          "Bathroom — start timer"
        )}
      </button>
      {/* Two labelled groups, apart, so a hurried tap doesn't land on the wrong kind. */}
      {positives.length > 0 && (
        <div className="bh-group" role="group" aria-label="Positive">
          <span className="bh-group-label">Positive</span>
          {positives.map((c) => (
            <BehaviourButton key={c.code} code={c} onClick={() => onBehaviour(c)} />
          ))}
        </div>
      )}
      {negatives.length > 0 && (
        <div className="bh-group" role="group" aria-label="Negative">
          <span className="bh-group-label">Negative</span>
          {negatives.map((c) => (
            <BehaviourButton key={c.code} code={c} onClick={() => onBehaviour(c)} />
          ))}
        </div>
      )}
    </>
  );
}
