import { useMemo } from "react";
import { useExamWeight, useAppPick } from "../store/appStore";
import { Assessment, studentName, sortByName } from "../lib/types";
import { GRADE_SCALES, assessmentStats, gradeForPct, percentage, rankByScore, taskShares, weightedMark } from "../lib/stats";
import { fmtDecimal } from "../lib/format";
import { positionTint, rankTints } from "../lib/listTint";
import Icon from "./Icon";
import StatTile from "./StatTile";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-12" → "12 Sep". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m >= 1 && m <= 12 && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

/**
 * Every assessment's marks for the class on one read-only page: students down
 * the side, assessments across the top (newest first) as percentages, each with
 * its share of the final mark. Then each student's informal and examination
 * averages, their weighted mark (the grade's split, Settings › Assessments), its
 * level/symbol and their rank on it. A test's heading opens that test's marks.
 */
export default function Markbook({ onBack, onOpen }: { onBack: () => void; onOpen: (a: Assessment) => void }) {
  const { students, assessments, marks, userPrefs } = useAppPick("students", "assessments", "marks", "userPrefs");
  const examWeight = useExamWeight();
  const scale = userPrefs.gradeScale;
  const scaleInfo = GRADE_SCALES[scale];
  const sorted = useMemo(
    () => sortByName(students),
    [students],
  );
  const tests = useMemo(() => [...assessments].sort((a, b) => b.date.localeCompare(a.date)), [assessments]);
  const shares = taskShares(assessments, examWeight);

  const pctOf = (studentId: string, a: Assessment) => {
    const m = marks.find((m) => m.assessmentId === a.id && m.studentId === studentId);
    return m ? percentage(m, a) : null;
  };
  // The same weighted mark the dashboards and parent reports use.
  const weighted = new Map(sorted.map((s) => [s.id, weightedMark(s.id, assessments, marks, examWeight)]));
  const finals = new Map<string, number>();
  for (const [id, w] of weighted) if (w.overall !== null) finals.set(id, w.overall);
  const ranks = rankByScore(finals);
  const rankTint = rankTints(ranks);
  const testMeans = tests.map((a) => assessmentStats(a, marks).mean);
  const meanOf = (values: Array<number | null>) => {
    const v = values.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const classInformal = meanOf([...weighted.values()].map((w) => w.informal));
  const classExam = meanOf([...weighted.values()].map((w) => w.exam));
  const classAverage = meanOf([...finals.values()]);
  const top = sorted.find((s) => ranks.get(s.id) === 1);
  const pct = (n: number | null) => (n !== null ? String(Math.round(n)) : "");

  return (
    <div className="marking-view">
      <div className="view-header">
        <button className="small" onClick={onBack}>
          <Icon name="arrow_back" size={18} /> Back
        </button>
        <h1>Markbook</h1>
      </div>

      <div className="stat-tiles compact">
        <StatTile value={tests.length} label={tests.length === 1 ? "assessment" : "assessments"} />
        <StatTile
          value={`${fmtDecimal(100 - examWeight, 1)} / ${fmtDecimal(examWeight, 1)}`}
          label="informal / exam"
          title="The grade's split, set under Settings › Assessments"
        />
        <StatTile value={classAverage !== null ? `${Math.round(classAverage)}%` : "—"} label="class average" />
        <StatTile value={top ? `${Math.round(finals.get(top.id)!)}%` : "—"} label={top ? `top: ${studentName(top)}` : "top of class"} />
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
                  <button className="link-btn test-link" onClick={() => onOpen(a)} title={`${a.title} (out of ${fmtDecimal(a.totalMarks)}): open its marks`}>
                    <span className="test-title">{a.title}</span>
                  </button>
                  <div className="q-sub" title="Its share of the final mark">
                    {a.kind === "exam" ? "Exam · " : ""}
                    {fmtDecimal(shares.get(a.id) ?? 0, 1)}%
                  </div>
                </th>
              ))}
              <th className="col-total sticky-right fifth divider" title="Weighted average of the informal tasks">
                Informal
                <div className="q-sub">%</div>
              </th>
              <th className="col-total sticky-right fourth plain" title="Weighted average of the examinations">
                Exam
                <div className="q-sub">%</div>
              </th>
              <th className="col-total sticky-right third" title="The two blended by the grade's split">
                Mark
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
              <th className="sticky-right fifth divider"></th>
              <th className="sticky-right fourth plain"></th>
              <th className="sticky-right third"></th>
              <th className="sticky-right second"></th>
              <th className="sticky-right"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, r) => {
              const w = weighted.get(s.id)!;
              const rank = ranks.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="col-no sticky-left">{r + 1}</td>
                  <td className="col-name sticky-left second" style={{ background: positionTint(r, sorted.length) }}>
                    {s.lastName}
                  </td>
                  <td className="col-name sticky-left third">{s.firstName}</td>
                  {tests.map((a) => (
                    <td key={a.id} className="col-test">
                      {pct(pctOf(s.id, a))}
                    </td>
                  ))}
                  <td className="col-total sticky-right fifth divider">{pct(w.informal)}</td>
                  <td className="col-total sticky-right fourth plain">{pct(w.exam)}</td>
                  <td className="col-total sticky-right third final">{pct(w.overall)}</td>
                  <td className="col-total sticky-right second">{w.overall !== null ? gradeForPct(w.overall, scale) : ""}</td>
                  <td className="col-total sticky-right" style={rank != null ? { background: rankTint.get(s.id) } : undefined}>
                    {rank ?? ""}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={tests.length + 8} className="empty-row start">
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
                  {pct(testMeans[i])}
                </td>
              ))}
              <td className="sticky-right fifth divider">{pct(classInformal)}</td>
              <td className="sticky-right fourth plain">{pct(classExam)}</td>
              <td className="sticky-right third">{pct(classAverage)}</td>
              <td className="sticky-right second">{classAverage !== null ? gradeForPct(classAverage, scale) : ""}</td>
              <td className="sticky-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
