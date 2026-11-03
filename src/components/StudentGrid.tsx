import { BehaviourCode } from "../lib/types";
import { fmtSigned } from "../lib/format";
import Elapsed from "./Elapsed";
import Icon from "./Icon";
import BehaviourIcon from "./BehaviourIcon";
import { behaviourText } from "./BehaviourButton";
import { ATTENDANCE_CODES, ATTENDANCE_WORDS, StudentActionProps, StudentHead, useBehaviourGroups } from "./StudentActions";

/**
 * A student's actions as a near-square grid of tiles: attendance, OUTSIDE and
 * Note across the top, then a tile per behaviour, picked out by its colour,
 * icon and three-character code. Positives first; the negatives start a row of
 * their own, so the two kinds stay apart.
 */
export default function StudentGrid({
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
  const tile = (c: BehaviourCode) => (
    <button
      key={c.code}
      className="sg-tile"
      style={{ background: c.color }}
      onClick={() => onBehaviour(c)}
      title={behaviourText(c)}
      aria-label={behaviourText(c)}
    >
      {c.icon && <BehaviourIcon name={c.icon} size={20} />}
      <span className="sg-code">{c.code}</span>
      <span className="sg-points">{fmtSigned(c.points)}</span>
    </button>
  );

  return (
    <div className="student-grid">
      <StudentHead student={student} onClose={onClose} />
      <div className="sg-top">
        <div className="sg-att" role="radiogroup" aria-label="Attendance">
          {ATTENDANCE_CODES.map((code) => (
            <button
              key={code}
              role="radio"
              aria-checked={status === code}
              aria-label={ATTENDANCE_WORDS[code]}
              title={ATTENDANCE_WORDS[code]}
              className={`att-btn ${code} ${status === code ? "on" : ""}`}
              onClick={() => onAttendance(code)}
            >
              {code}
            </button>
          ))}
        </div>
        <button
          className={`sg-big sg-outside ${outVisit ? "out" : ""}`}
          onClick={onBathroom}
          title="Time a trip outside the classroom; it's saved to the Outside log when the student is back"
        >
          <Icon name="door_open" size={24} />
          {outVisit ? (
            <span>
              Back · <Elapsed visit={outVisit} />
            </span>
          ) : (
            <span>OUTSIDE</span>
          )}
        </button>
        {onNote && (
          <button className={`sg-big sg-note ${noteDraft ? "draft" : ""}`} onClick={onNote} title="Write a note about this student">
            <Icon name="edit_note" size={24} />
            <span>{noteDraft ? "DRAFT" : "NOTE"}</span>
          </button>
        )}
      </div>
      {positives.length > 0 && (
        <div className="sg-tiles" role="group" aria-label="Positive">
          {positives.map(tile)}
        </div>
      )}
      {negatives.length > 0 && (
        <div className="sg-tiles" role="group" aria-label="Negative">
          {negatives.map(tile)}
        </div>
      )}
    </div>
  );
}
