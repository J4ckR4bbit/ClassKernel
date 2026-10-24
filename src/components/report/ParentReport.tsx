import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";
import { ClassInfo, GradeScale } from "../../lib/types";
import { ReportSection, StudentProfile, TopicScore, fmtNum, fmtPct } from "../../lib/insights";
import { GRADE_SCALES, formatDuration, gradeForPct } from "../../lib/stats";
import { C_PRIMARY, C_SECONDARY, PAPER_GRID, PAPER_INK } from "../dashboard/shared";
import { shortDate } from "../../lib/format";


/**
 * One student's parent-evening report, laid out for a single A4 page. It only
 * presents what it is given: the profile and the parent-friendly summary come
 * from src/lib/insights.ts, so the page and the dashboard never disagree.
 */
export default function ParentReport({
  profile: p,
  summary,
  sections,
  classInfo,
  school,
  teacher,
  periodLabel,
  printedOn,
  comment,
  onComment,
  onCommentDone,
  gradeScale,
}: {
  profile: StudentProfile;
  summary: string[];
  sections: Set<ReportSection>;
  classInfo: ClassInfo | undefined;
  school: string;
  teacher: string;
  periodLabel: string;
  printedOn: string;
  comment: string;
  onComment: (text: string) => void;
  /** The comment box lost focus: the place to save it. */
  onCommentDone: () => void;
  /** Show results as SA levels (7–1) or symbols (A–F). */
  gradeScale: GradeScale;
}) {
  const first = p.student.firstName || "Student";
  const classLine = [classInfo?.subject, classInfo?.year && `Grade ${classInfo.year}`, classInfo?.name].filter(Boolean).join(" · ");
  const marked = p.assessments.filter((r) => r.pct !== null);
  const good = p.behaviour.byCode.filter((c) => c.kind === "positive");
  const work = p.behaviour.byCode.filter((c) => c.kind === "negative");
  const att = p.attendance;

  return (
    <article className="report-page" aria-label={`Report for ${p.student.firstName} ${p.student.lastName}`}>
      <header className="report-head">
        <div>
          {school && <div className="report-school">{school}</div>}
          <h1>
            {p.student.firstName} {p.student.lastName}
          </h1>
          {classLine && <div className="report-class">{classLine}</div>}
        </div>
        <div className="report-meta">
          <div>{periodLabel}</div>
          {teacher && <div>Teacher: {teacher}</div>}
          <div className="report-printed">Printed {printedOn}</div>
        </div>
      </header>

      {summary.length > 0 && (
        <section className="report-summary">
          <h2>Summary</h2>
          <ul>
            {summary.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {sections.has("marks") && p.assessments.length > 0 && (
        <section className="report-section">
          <h2>Marks</h2>
          <table className="report-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Date</th>
                <th>Type</th>
                <th className="num">Mark</th>
                <th className="num">%</th>
                <th className="num" title={GRADE_SCALES[gradeScale].key}>
                  {GRADE_SCALES[gradeScale].label}
                </th>
                <th className="num">Class average</th>
              </tr>
            </thead>
            <tbody>
              {p.assessments.map((r) => (
                <tr key={r.assessment.id}>
                  <td>{r.assessment.title}</td>
                  <td>{shortDate(r.assessment.date)}</td>
                  <td>{r.assessment.category || "—"}</td>
                  <td className="num">
                    {r.mark !== null ? `${fmtNum(r.mark, Number.isInteger(r.mark) ? 0 : 1)} / ${r.assessment.totalMarks}` : "not written"}
                  </td>
                  <td className="num">{r.pct !== null ? fmtPct(r.pct) : ""}</td>
                  <td className="num">{gradeForPct(r.pct, gradeScale)}</td>
                  <td className="num">{fmtPct(r.classMean)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {marked.length > 1 && <ResultsChart profile={p} name={first} />}
        </section>
      )}

      {sections.has("topics") && (p.topics.length > 0 || p.levels.length > 1) && (
        <section className="report-section report-two">
          {p.topics.length > 0 && <ScoreTable title="By topic" scores={p.topics} name={first} />}
          {p.levels.length > 1 && <ScoreTable title="By cognitive level" scores={p.levels} name={first} />}
        </section>
      )}

      {sections.has("behaviour") && (
        <section className="report-section">
          <h2>Behaviour and participation</h2>
          <div className="report-two">
            <div>
              <h3>Going well</h3>
              {good.length ? (
                <ul className="report-tally">
                  {good.map((c) => (
                    <li key={c.code}>
                      <span>{c.label}</span>
                      <b>{c.count}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="report-muted">Nothing recorded yet.</p>
              )}
            </div>
            <div>
              <h3>To work on</h3>
              {work.length ? (
                <ul className="report-tally">
                  {work.map((c) => (
                    <li key={c.code}>
                      <span>{c.label}</span>
                      <b>{c.count}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="report-muted">No concerns.</p>
              )}
            </div>
          </div>
          <p>
            Questions in class:{" "}
            {p.answers.asked
              ? `answered ${p.answers.answered} of ${p.answers.asked} when asked.`
              : "not asked a question in this period."}
          </p>
        </section>
      )}

      {sections.has("attendance") && (
        <section className="report-section">
          <h2>Attendance</h2>
          {att.total === 0 ? (
            <p className="report-muted">No attendance taken in this period.</p>
          ) : (
            <p>
              {att.rate !== null && <b>{fmtPct(att.rate * 100)}</b>} — present {att.present}, late {att.late}, absent {att.absent}
              {att.excused ? `, excused ${att.excused}` : ""}.
              {p.absentDates.length > 0 && <> Absent: {p.absentDates.map(shortDate).join(", ")}.</>}
              {p.lateDates.length > 0 && <> Late: {p.lateDates.map(shortDate).join(", ")}.</>}
            </p>
          )}
          <p>
            Bathroom trips during lessons:{" "}
            {p.bathroom.trips === 0
              ? "none."
              : `${p.bathroom.trips}, ${fmtNum(p.bathroom.totalSeconds / 60)} min in total (longest ${formatDuration(p.bathroom.longestSeconds)}) — ${p.bathroom.visits
                  .slice(0, 8)
                  .map((v) => shortDate(v.date))
                  .join(", ")}${p.bathroom.trips > 8 ? ", …" : ""}.`}
          </p>
        </section>
      )}

      <section className="report-section report-comment">
        <h2>Teacher's comment</h2>
        <textarea
          className="report-edit"
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          onBlur={onCommentDone}
          placeholder={`Type a comment about ${first}. It's saved for next time. Leave it empty to handwrite one.`}
          rows={3}
          aria-label={`Teacher's comment for ${p.student.firstName} ${p.student.lastName}`}
        />
        {comment.trim() ? (
          <p className="report-comment-print">{comment}</p>
        ) : (
          <div className="report-lines report-comment-print" aria-hidden>
            <span />
            <span />
          </div>
        )}
      </section>

      <section className="report-section report-notes">
        <h2>Notes from our meeting</h2>
        <div className="report-lines" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </section>

    </article>
  );
}

/** Results against the class average, at a fixed size so it prints the same every time. */
function ResultsChart({ profile, name }: { profile: StudentProfile; name: string }) {
  const rows = profile.assessments.map((r) => ({
    name: r.assessment.title,
    student: r.pct !== null ? Math.round(r.pct) : null,
    classAvg: r.classMean !== null ? Math.round(r.classMean) : null,
  }));
  return (
    <LineChart width={680} height={112} data={rows} margin={{ top: 6, right: 44, left: 0, bottom: 0 }} className="report-chart">
      <CartesianGrid stroke={PAPER_GRID} vertical={false} />
      <XAxis dataKey="name" tick={{ fontSize: 10, fill: PAPER_INK }} interval={0} />
      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: PAPER_INK }} width={40} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      <Line isAnimationActive={false} dataKey="classAvg" name="Class average" stroke={C_SECONDARY} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
      <Line isAnimationActive={false} dataKey="student" name={name} stroke={C_PRIMARY} strokeWidth={2} dot={{ r: 3 }} connectNulls />
    </LineChart>
  );
}

/** The student's % per topic (or level) beside the class's, with a printable bar. */
function ScoreTable({ title, scores, name }: { title: string; scores: TopicScore[]; name: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <table className="report-table report-scores">
        <thead>
          <tr>
            <th></th>
            <th className="num">{name}</th>
            <th className="num">Class</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.name}>
              <td>
                {s.name}
                <div className="report-bar" aria-hidden>
                  <span style={{ width: `${Math.max(0, Math.min(100, s.pct))}%` }} />
                </div>
              </td>
              <td className="num">{fmtPct(s.pct)}</td>
              <td className="num">{fmtPct(s.classPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
