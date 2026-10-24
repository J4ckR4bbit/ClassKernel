import { useApp, useAppPick } from "../../store/appStore";
import { examWeightFor } from "../../lib/types";
import { fmtDecimal, gradeLabel, parseDecimal } from "../../lib/format";

/**
 * Per grade, how the informal tasks and the examinations make up a student's
 * weighted mark (the markbook, dashboards and parent reports). Each task's own
 * weight within its side is set on the Marks page.
 */
export default function WeightingSettings({ grades }: { grades: string[] }) {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");
  const setExam = (grade: string, text: string) => {
    const pct = parseDecimal(text);
    if (pct >= 0 && pct <= 100) void setUserPrefs({ ...userPrefs, examWeights: { ...userPrefs.examWeights, [grade]: pct } });
  };
  return (
    <div className="panel">
      <h3>Weighting: informal tasks and examinations</h3>
      <p className="muted lead">
        A student's mark blends their informal tasks with their examinations in these shares. Until a student has written an
        examination, their informal tasks make up the whole mark. Set each task's own weight, and whether it is informal or an
        examination, on the Marks page.
      </p>
      {grades.length === 0 ? (
        <p className="muted tail">
          Give a class its grade on its Class notes page to set the weighting for that grade.
        </p>
      ) : (
        <table className="data weighting-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th style={{ width: 130 }}>Informal</th>
              <th style={{ width: 130 }}>Examinations</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => {
              const exam = examWeightFor(userPrefs, g);
              return (
                <tr key={g}>
                  <td>{gradeLabel(g)}</td>
                  <td>{fmtDecimal(100 - exam, 1)}%</td>
                  <td>
                    <div className="row nowrap">
                      <input
                        key={exam}
                        className="weight-input"
                        inputMode="decimal"
                        aria-label={`Examinations' share for ${gradeLabel(g)}`}
                        defaultValue={fmtDecimal(exam, 1)}
                        onBlur={(e) => {
                          setExam(g, e.target.value);
                          e.target.value = fmtDecimal(examWeightFor(useApp.getState().userPrefs, g), 1);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                      %
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
