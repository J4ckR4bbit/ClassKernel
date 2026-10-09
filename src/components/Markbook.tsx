import { useMemo } from "react";
import { useApp } from "../store/appStore";
import { Assessment, studentName } from "../lib/types";
import { GRADE_SCALES, assessmentStats, gradeForPct, overallPercent, percentage, rankByScore } from "../lib/stats";
import { positionTint, rankTints } from "../lib/listTint";
import Icon from "./Icon";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-12" → "12 Sep". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

/**
 * Every assessment's marks for the class on one read-only page: students down
 * the side, assessments across the top (newest first) as percentages, then each
 * student's average over the tests they have a mark for, its level/symbol and
 * their rank on it. A test's heading opens that test's marks.
 */
export default function Markbook({ onBack, onOpen }: { onBack: () => void; onOpen: (a: Assessment) => void }) {
  const { students, assessments, marks, userPrefs } = useApp();
  const scale = userPrefs.gradeScale;
  const scaleInfo = GRADE_SCALES[scale];
  const sorted = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students],
  );
  const tests = useMemo(() => [...assessments].sort((a, b) => b.date.localeCompare(a.date)), [assessments]);

  const pctOf = (studentId: string, a: Assessment) => {
    const m = marks.find((m) => m.assessmentId === a.id && m.studentId === studentId);
    return m ? percentage(m, a) : null;
  };
  // The same average the dashboards use: every test counts equally.
  const averages = new Map<string, number>();
  for (const s of sorted) {
    const avg = overallPercent(s.id, assessments, marks);
    if (avg !== null) averages.set(s.id, avg);
  }
  const ranks = rankByScore(averages);
  const rankTint = rankTints(ranks);
  const testMeans = tests.map((a) => assessmentStats(a, marks).mean);
  const classAverage = averages.size ? Math.round([...averages.values()].reduce((a, b) => a + b, 0) / averages.size) : null;
  const top = sorted.find((s) => ranks.get(s.id) === Math.min(...ranks.values())); // a tie for first shares rank 1.5

  return (
    <div className="marking-view">
      <div className="view-header">
        <button className="small" onClick={onBack}>
          <Icon name="arrow_back" size={18} /> Back
        </button>
        <h1>Markbook</h1>
      </div>

      <div className="stat-tiles compact">
        <div className="stat-tile">
          <div className="value">{tests.length}</div>
          <div className="label">{tests.length === 1 ? "assessment" : "assessments"}</div>
        </div>
        <div className="stat-tile">
          <div className="value">{classAverage !== null ? `${classAverage}%` : "—"}</div>
          <div className="label">class average</div>
        </div>
        <div className="stat-tile">
          <div className="value">{top ? `${Math.round(averages.get(top.id)!)}%` : "—"}</div>
          <div className="label">{top ? `top: ${studentName(top)}` : "top of class"}</div>
        </div>
      </div>

      <div className="mark-grid-wrap">
        <table className="mark-grid read-only markbook">
          <thead>
            <tr>
              <th className="col-no sticky-left">No</th>
              <th className="col-name sticky-left second">Surname</th>
              <th className="col-name sticky-left third">Name</th>
              {tests.map((a) => (
                <th key={a.id} className="col-test">
                  <button className="link-btn test-link" onClick={() => onOpen(a)} title={`${a.title} (out of ${a.totalMarks}): open its marks`}>
                    <span className="test-title">{a.title}</span>
                  </button>
                </th>
              ))}
              <th className="col-total sticky-right third divider">
                Avg
                <div className="q-sub">%</div>
              </th>
              <th className="col-total sticky-right second" title={`${scaleInfo.label}: ${scaleInfo.key}`}>
                {scaleInfo.short}
              </th>
              <th className="col-total sticky-right">Rank</th>
            </tr>
            <tr className="topic-row">
              <th className="sticky-left" colSpan={3}>
                Date
              </th>
              {tests.map((a) => (
                <th key={a.id} className="col-test">
                  {shortDate(a.date)}
                </th>
              ))}
              <th className="sticky-right third divider"></th>
              <th className="sticky-right second"></th>
              <th className="sticky-right"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, r) => {
              const avg = averages.get(s.id);
              const rank = ranks.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="col-no sticky-left">{r + 1}</td>
                  <td className="col-name sticky-left second" style={{ background: positionTint(r, sorted.length) }}>
                    {s.lastName}
                  </td>
                  <td className="col-name sticky-left third">{s.firstName}</td>
                  {tests.map((a) => {
                    const pct = pctOf(s.id, a);
                    return (
                      <td key={a.id} className="col-test">
                        {pct !== null ? Math.round(pct) : ""}
                      </td>
                    );
                  })}
                  <td className="col-total sticky-right third divider">{avg !== undefined ? Math.round(avg) : ""}</td>
                  <td className="col-total sticky-right second">{avg !== undefined ? gradeForPct(avg, scale) : ""}</td>
                  <td className="col-total sticky-right" style={rank != null ? { background: rankTint.get(s.id) } : undefined}>
                    {rank ?? ""}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={tests.length + 6} className="muted" style={{ padding: 16 }}>
                  Add students to the class first.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="avg-row">
              <th className="sticky-left" colSpan={3}>
                Class average (%)
              </th>
              {tests.map((a, i) => (
                <td key={a.id} className="col-test">
                  {testMeans[i] !== null ? Math.round(testMeans[i]!) : ""}
                </td>
              ))}
              <td className="sticky-right third divider">{classAverage ?? ""}</td>
              <td className="sticky-right second">{classAverage !== null ? gradeForPct(classAverage, scale) : ""}</td>
              <td className="sticky-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
