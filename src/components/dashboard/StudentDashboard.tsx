import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Student, studentName } from "../../lib/types";
import { GRADE_SCALES, formatDuration, gradeForPct } from "../../lib/stats";
import { useApp } from "../../store/appStore";
import { dateInZone, timeInZone } from "../../lib/time";
import { StudentProfile, TopicScore, fmtNum, fmtSigned } from "../../lib/insights";
import {
  C_GRID,
  C_INK,
  C_PRIMARY,
  C_SECONDARY,
  CodeCountChart,
  StatTile,
  SummaryCard,
  WeeklyBehaviourChart,
  fmtPct,
} from "./shared";

/**
 * One student at a glance: a written summary, then their marks (each
 * assessment against the class), behaviour, cold-call answers, bathroom trips
 * and attendance for the chosen period.
 */
export default function StudentDashboard({
  students,
  profile: p,
  summary,
  codeLabel,
  onPick,
}: {
  students: Student[];
  profile: StudentProfile;
  summary: string[];
  codeLabel: (code: string) => { label: string; color: string };
  onPick: (id: string) => void;
}) {
  const scale = useApp((s) => s.userPrefs.gradeScale);
  const sorted = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students],
  );
  const idx = sorted.findIndex((s) => s.id === p.student.id);
  const step = (d: number) => onPick(sorted[(idx + d + sorted.length) % sorted.length].id);
  const flags = p.student.flags.split(";").map((f) => f.trim()).filter(Boolean);
  const marked = p.assessments.filter((r) => r.pct !== null);
  const a = p.answers;
  const att = p.attendance;

  const trend = p.assessments.map((r) => ({
    name: r.assessment.title,
    student: r.pct !== null ? Math.round(r.pct) : null,
    classAvg: r.classMean !== null ? Math.round(r.classMean) : null,
  }));

  return (
    <div className="dash-student">
      <div className="student-pick">
        <button onClick={() => step(-1)} aria-label="Previous student" title="Previous student">
          ‹
        </button>
        <select value={p.student.id} onChange={(e) => onPick(e.target.value)} aria-label="Student">
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.lastName}, {s.firstName}
            </option>
          ))}
        </select>
        <button onClick={() => step(1)} aria-label="Next student" title="Next student">
          ›
        </button>
        <h2 className="student-name">{studentName(p.student)}</h2>
        {flags.map((f) => (
          <span key={f} className="tag warn">
            {f}
          </span>
        ))}
      </div>
      {p.student.notes && <p className="muted student-notes">📝 {p.student.notes}</p>}

      <SummaryCard title={`How ${p.student.firstName || "this student"} is doing`} lines={summary} />

      <div className="stat-tiles">
        <StatTile value={fmtPct(p.overall)} label={p.rank !== null ? `average · ranked ${p.rank} of ${p.rankedOf}` : "average"} />
        <StatTile value={p.overall !== null ? gradeForPct(p.overall, scale) : "—"} label={GRADE_SCALES[scale].label.toLowerCase()} />
        <StatTile value={att.rate !== null ? fmtPct(att.rate * 100) : "—"} label="attendance" />
        <StatTile
          value={fmtSigned(p.behaviour.net)}
          label={`behaviour (${p.behaviour.positive}+ / ${p.behaviour.negative}−)`}
          tone={p.behaviour.net > 0 ? "good" : p.behaviour.net < 0 ? "bad" : undefined}
        />
        <StatTile value={a.asked ? `${a.answered}/${a.asked}` : "—"} label="questions answered" />
        <StatTile value={String(p.bathroom.trips)} label="bathroom trips" />
      </div>

      <h2 className="section-heading">Marks</h2>
      {p.assessments.length === 0 ? (
        <div className="panel muted">No assessments in this period.</div>
      ) : (
        <div className="dash-grid">
          <div className="panel dash-wide">
            <table className="data">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="num">Mark</th>
                  <th className="num">%</th>
                  <th className="num" title={GRADE_SCALES[scale].key}>
                    {GRADE_SCALES[scale].short}
                  </th>
                  <th className="num">Class</th>
                  <th className="num">±</th>
                </tr>
              </thead>
              <tbody>
                {p.assessments.map((r) => (
                  <tr key={r.assessment.id}>
                    <td>
                      {r.assessment.title}
                      {r.comment && <div className="muted">“{r.comment}”</div>}
                    </td>
                    <td>{r.assessment.date}</td>
                    <td>{[r.assessment.category, r.assessment.contentArea].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="num">{r.mark !== null ? `${fmtNum(r.mark, Number.isInteger(r.mark) ? 0 : 1)} / ${r.assessment.totalMarks}` : <span className="muted">not entered</span>}</td>
                    <td className="num">{r.pct !== null ? fmtPct(r.pct) : ""}</td>
                    <td className="num">{gradeForPct(r.pct, scale)}</td>
                    <td className="num">{fmtPct(r.classMean)}</td>
                    <td className={`num ${r.diff === null ? "" : r.diff >= 0 ? "pos" : "neg"}`}>
                      {r.diff !== null ? fmtSigned(Math.round(r.diff)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {marked.length > 1 && (
            <div className="panel">
              <h3>Results vs the class</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend} margin={{ right: 24, left: 4 }}>
                  <CartesianGrid stroke={C_GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C_INK }} interval={0} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="classAvg" name="Class average" stroke={C_SECONDARY} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} connectNulls />
                  <Line type="monotone" dataKey="student" name={p.student.firstName || "Student"} stroke={C_PRIMARY} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {p.topics.length > 0 && <ScoreChart title="By topic" scores={p.topics} name={p.student.firstName} />}
          {p.levels.length > 1 && <ScoreChart title="By cognitive level" scores={p.levels} name={p.student.firstName} />}
        </div>
      )}

      <h2 className="section-heading">Behaviour</h2>
      <div className="dash-grid">
        <div className="panel">
          <h3>Week by week</h3>
          <WeeklyBehaviourChart weeks={p.behaviour.weekly} />
        </div>
        <div className="panel">
          <h3>What's been logged</h3>
          <CodeCountChart counts={p.behaviour.byCode} />
        </div>
        <div className="panel">
          <h3>Recent entries</h3>
          {p.behaviour.recent.length === 0 ? (
            <p className="muted">Nothing logged in this period.</p>
          ) : (
            <ul className="event-list">
              {p.behaviour.recent.map((e, i) => {
                const c = codeLabel(e.code);
                return (
                  <li key={`${e.timestamp}-${i}`}>
                    <span className="event-dot" style={{ background: c.color }} aria-hidden />
                    <span className="grow">
                      {c.label}
                      {e.note && <span className="muted"> — {e.note}</span>}
                    </span>
                    <span className={`event-points ${e.points >= 0 ? "pos" : "neg"}`}>{fmtSigned(e.points)}</span>
                    <span className="muted">
                      {dateInZone(e.timestamp)} {timeInZone(e.timestamp)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3>🙋 Questions</h3>
          {a.asked === 0 ? (
            <p className="muted">Not picked to answer in this period.</p>
          ) : (
            <>
              <div className="answer-bar" role="img" aria-label={`Answered ${a.answered} of ${a.asked}`}>
                <span className="answered" style={{ flexGrow: a.answered }}>
                  {a.answered > 0 && `${a.answered} answered`}
                </span>
                <span className="missed" style={{ flexGrow: a.missed }}>
                  {a.missed > 0 && `${a.missed} unable`}
                </span>
              </div>
              <p className="muted">
                Asked {a.asked} time{a.asked === 1 ? "" : "s"} with Pick a student.
              </p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>🚻 Bathroom</h3>
          {p.bathroom.trips === 0 ? (
            <p className="muted">No bathroom trips in this period.</p>
          ) : (
            <>
              <p>
                {p.bathroom.trips} trip{p.bathroom.trips === 1 ? "" : "s"}, {fmtNum(p.bathroom.totalSeconds / 60)} min out in total, longest{" "}
                {formatDuration(p.bathroom.longestSeconds)}.
              </p>
              <ul className="event-list">
                {p.bathroom.visits.slice(0, 10).map((v) => (
                  <li key={v.start}>
                    <span className="grow">{v.date}</span>
                    <span className="muted">
                      {timeInZone(v.start)}
                      {v.end ? `–${timeInZone(v.end)}` : " (still out)"}
                    </span>
                    <span>{v.end ? formatDuration(Math.round((Date.parse(v.end) - Date.parse(v.start)) / 1000)) : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel">
          <h3>📅 Attendance</h3>
          {att.total === 0 ? (
            <p className="muted">No attendance taken in this period.</p>
          ) : (
            <>
              <p>
                {att.present} present · {att.late} late · {att.absent} absent · {att.excused} excused
              </p>
              {p.absentDates.length > 0 && <p className="muted">Absent: {p.absentDates.join(", ")}</p>}
              {p.lateDates.length > 0 && <p className="muted">Late: {p.lateDates.join(", ")}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The student's percentage per topic (or level) beside the class's. */
function ScoreChart({ title, scores, name }: { title: string; scores: TopicScore[]; name: string }) {
  const rows = scores.map((s) => ({
    name: s.name,
    student: Math.round(s.pct),
    classAvg: s.classPct !== null ? Math.round(s.classPct) : null,
  }));
  return (
    <div className="panel">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} barCategoryGap="25%" barGap={2}>
          <CartesianGrid stroke={C_GRID} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: C_INK }} interval={0} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Legend />
          <Bar dataKey="student" name={name || "Student"} fill={C_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Bar dataKey="classAvg" name="Class" fill={C_SECONDARY} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
