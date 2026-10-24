import { useMemo } from "react";
import { useAppPick } from "../../store/appStore";
import { Assessment, Mark, studentName, sortByName } from "../../lib/types";
import { GRADE_SCALES, gradeForPct, rankByScore } from "../../lib/stats";
import { fmtDecimal } from "../../lib/format";
import { positionTint, rankTints } from "../../lib/listTint";
import MarkSheetTools from "../MarkSheetTools";
import Icon from "../Icon";
import StatTile from "../StatTile";

/**
 * A single-mark test's results, read-only: each student's mark, percentage,
 * level/symbol, rank and comment, with the class averages under them.
 */
export default function MarkListView({
  assessment,
  onEnterMarks,
  onImported,
}: {
  assessment: Assessment;
  onEnterMarks: () => void;
  onImported: () => void;
}) {
  const { students, marks, userPrefs } = useAppPick("students", "marks", "userPrefs");
  const scale = userPrefs.gradeScale;
  const scaleInfo = GRADE_SCALES[scale];
  const sorted = useMemo(
    () => sortByName(students),
    [students],
  );

  const markOf = (studentId: string): Mark | undefined =>
    marks.find((m) => m.assessmentId === assessment.id && m.studentId === studentId);
  const entered = new Map<string, number>();
  for (const s of sorted) {
    const v = markOf(s.id)?.mark;
    if (v != null) entered.set(s.id, v);
  }
  const ranks = rankByScore(entered);
  const rankTint = rankTints(ranks);
  const pctOf = (mark: number) => (assessment.totalMarks > 0 ? (mark / assessment.totalMarks) * 100 : null);
  const values = [...entered.values()];
  const meanMark = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const classMean = meanMark !== null ? pctOf(meanMark) : null;
  const top = sorted.find((s) => ranks.get(s.id) === 1);
  const topPct = top ? pctOf(entered.get(top.id)!) : null;

  return (
    <div className="marking-view">
      <div className="view-header">
        <div className="spacer" />
        <MarkSheetTools assessment={assessment} onImported={onImported} />
        <button className="small" onClick={onEnterMarks}>
          <Icon name="edit" size={18} /> Enter marks
        </button>
      </div>

      <div className="stat-tiles compact">
        <StatTile value={`${sorted.length ? Math.round((1 - entered.size / sorted.length) * 100) : 0}%`} label="left to enter" />
        <StatTile value={classMean !== null ? `${Math.round(classMean)}%` : "—"} label="class mean (entered)" />
        <StatTile value={topPct !== null ? `${Math.round(topPct)}%` : "—"} label={top ? `top: ${studentName(top)}` : "top of class"} />
      </div>

      <div className="mark-grid-wrap">
        <table className="mark-grid read-only">
          <thead>
            <tr>
              <th className="col-no sticky-left">No</th>
              <th className="col-name sticky-left second">Surname</th>
              <th className="col-name sticky-left third">Name</th>
              <th className="col-total">
                Mark
                <div className="q-sub">/{assessment.totalMarks}</div>
              </th>
              <th className="col-total">%</th>
              <th className="col-total" title={`${scaleInfo.label}: ${scaleInfo.key}`}>
                {scaleInfo.short}
              </th>
              <th className="col-total">Rank</th>
              <th className="col-comment">Comment</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, r) => {
              const m = markOf(s.id);
              const v = entered.get(s.id);
              const pct = v !== undefined ? pctOf(v) : null;
              const rank = ranks.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="col-no sticky-left">{r + 1}</td>
                  <td className="col-name sticky-left second" style={{ background: positionTint(r, sorted.length) }}>
                    {s.lastName}
                  </td>
                  <td className="col-name sticky-left third">{s.firstName}</td>
                  <td className="col-total">{v !== undefined ? fmtDecimal(v) : ""}</td>
                  <td className="col-total">{pct !== null ? Math.round(pct) : ""}</td>
                  <td className="col-total">{pct !== null ? gradeForPct(pct, scale) : ""}</td>
                  <td className="col-total" style={rank != null ? { background: rankTint.get(s.id) } : undefined}>
                    {rank ?? ""}
                  </td>
                  <td className="col-comment">{m?.comment ?? ""}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-row start">
                  Add students to the class first.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="avg-row">
              <th className="sticky-left" colSpan={3}>
                Average (mark)
              </th>
              <td className="col-total">{meanMark !== null ? fmtDecimal(meanMark, 1) : ""}</td>
              <td colSpan={4}></td>
            </tr>
            <tr className="avg-row">
              <th className="sticky-left" colSpan={3}>
                Average (%)
              </th>
              <td></td>
              <td className="col-total">{classMean !== null ? Math.round(classMean) : ""}</td>
              <td className="col-total">{classMean !== null ? gradeForPct(classMean, scale) : ""}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
