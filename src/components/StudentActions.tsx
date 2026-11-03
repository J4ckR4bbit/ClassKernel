import { useAppPick } from "../store/appStore";
import { AttendanceStatus, BathroomVisit, BehaviourCode, Student, studentName } from "../lib/types";
import { displayStudentName } from "../lib/privacy";
import Elapsed from "./Elapsed";
import Icon from "./Icon";
import BehaviourButton from "./BehaviourButton";

/** What every style of a student's pop-up (list, grid, round) is given. */
export interface StudentActionProps {
  student: Student;
  status: AttendanceStatus | undefined;
  /** The student's running trip outside the classroom, if they're out now. */
  outVisit: BathroomVisit | undefined;
  onAttendance: (status: AttendanceStatus) => void;
  onBathroom: () => void;
  onBehaviour: (code: BehaviourCode) => void;
  /** Write a note about the student; left out, there's no Note button. */
  onNote?: () => void;
  /** A note about them is waiting as a draft. */
  noteDraft?: boolean;
  onClose: () => void;
}

export const ATTENDANCE_CODES: AttendanceStatus[] = ["P", "A", "L", "E"];
export const ATTENDANCE_WORDS: Record<AttendanceStatus, string> = { P: "Present", A: "Absent", L: "Late", E: "Excused" };

/** The behaviours in two groups, positives first, so a hurried tap doesn't land on the wrong kind. */
export function useBehaviourGroups() {
  const { behaviourCodes } = useAppPick("behaviourCodes");
  return {
    positives: behaviourCodes.filter((c) => c.kind === "positive"),
    negatives: behaviourCodes.filter((c) => c.kind === "negative"),
  };
}

/** The student's name as this screen may show it: in privacy mode, the way the seats show it. */
export function usePopupName(student: Student): string {
  const { userPrefs } = useAppPick("userPrefs");
  return userPrefs.privacyMode ? displayStudentName(student, userPrefs.seatNameStyle) : studentName(student);
}

/** The pop-up's name line, with flags and notes where Settings allows, and the close button. */
export function StudentHead({ student, onClose }: { student: Student; onClose: () => void }) {
  const { userPrefs } = useAppPick("userPrefs");
  const showFlags = student.flags && (!userPrefs.privacyMode || userPrefs.popoverShowFlags);
  const showNotes = student.notes && (!userPrefs.privacyMode || userPrefs.popoverShowNotes);
  const name = usePopupName(student);
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
    </>
  );
}

/**
 * Everything the teacher can record for one student during a lesson, as a
 * list: attendance, the OUTSIDE timer, a note and the behaviour buttons.
 * Shown as the seat popover on the room plan and as a sheet in the teaching strip.
 */
export default function StudentActions({
  student,
  status,
  outVisit,
  onAttendance,
  onBathroom,
  onBehaviour,
  onNote,
  noteDraft,
  onClose,
}: StudentActionProps) {
  const { positives, negatives } = useBehaviourGroups();

  return (
    <>
      <StudentHead student={student} onClose={onClose} />
      <div className="att-seg" role="radiogroup" aria-label="Attendance" style={{ marginBottom: 2 }}>
        {ATTENDANCE_CODES.map((code) => (
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
      <div className="sa-row">
        <button
          className={`bathroom-btn ${outVisit ? "out" : ""}`}
          title="Time a trip outside the classroom; it's saved to the Outside log when the student is back"
          onClick={onBathroom}
        >
          <Icon name="door_open" size={20} />
          {outVisit ? (
            <>
              Back inside · <Elapsed visit={outVisit} />
            </>
          ) : (
            "OUTSIDE — start timer"
          )}
        </button>
        {onNote && (
          <button className={`note-btn ${noteDraft ? "draft" : ""}`} onClick={onNote} title="Write a note about this student">
            <Icon name="edit_note" size={20} /> {noteDraft ? "Note (draft)" : "Note"}
          </button>
        )}
      </div>
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
