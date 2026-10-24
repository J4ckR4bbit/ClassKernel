import { useAppPick } from "../../store/appStore";
import { GradeScale } from "../../lib/types";
import { GRADE_SCALES } from "../../lib/stats";

/** Which way Enter moves in the marking grid, and whether results show as levels or symbols. */
export default function MarkEntrySettings() {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");

  return (
    <>
      <div className="panel">
        <h3>Mark entry</h3>
        <label className="row">
          <span>After typing a mark in the grid, Enter moves</span>
          <select value={userPrefs.markGridEnter} onChange={(e) => void setUserPrefs({ ...userPrefs, markGridEnter: e.target.value as "across" | "down" })}>
            <option value="across">across (to the next question)</option>
            <option value="down">down (to the next student)</option>
          </select>
        </label>
        <p className="muted tail">
          Tab always moves the other way. Arrow keys move one cell.
        </p>
      </div>

      <div className="panel">
        <h3>Show results as</h3>
        <div className="row grade-scale-choice" role="radiogroup" aria-label="Show results as">
          {(["level", "symbol"] as GradeScale[]).map((g) => (
            <label key={g} className="row">
              <input
                type="radio"
                name="grade-scale"
                checked={userPrefs.gradeScale === g}
                onChange={() => void setUserPrefs({ ...userPrefs, gradeScale: g })}
              />
              <span>
                <b>{GRADE_SCALES[g].label}</b> <span className="muted">— {GRADE_SCALES[g].key}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted tail">
          Used in the marking grid, the dashboards, parent reports and spreadsheet exports.
        </p>
      </div>
    </>
  );
}
