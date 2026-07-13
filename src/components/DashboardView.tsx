import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "../store/appStore";
import { studentName } from "../lib/types";
import {
  assessmentStats,
  atRiskStudents,
  attendanceByStudent,
  histogram,
  overallPercent,
  percentage,
  studentSeries,
} from "../lib/stats";
import SeatingInsights from "./SeatingInsights";

// Chart colors validated with the dataviz palette checker (light surface):
const C_PRIMARY = "#2e9455"; // green — main data series
const C_SECONDARY = "#3b6fd6"; // blue — comparison series (class average)
const C_GRID = "#eef1f4";
const C_INK = "#5c6b7a";

export default function DashboardView() {
  const { currentClass, students, assessments, marks, attendance, lessons } = useApp();
  const ordered = useMemo(() => [...assessments].sort((a, b) => a.date.localeCompare(b.date)), [assessments]);
  const [histAssessment, setHistAssessment] = useState<string>("");
  const [focusStudent, setFocusStudent] = useState<string>("");

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const attSummaries = useMemo(() => attendanceByStudent(attendance), [attendance]);

  const overalls = students
    .map((s) => ({ student: s, pct: overallPercent(s.id, assessments, marks) }))
    .filter((x): x is { student: (typeof students)[0]; pct: number } => x.pct !== null);
  const classAvg = overalls.length ? overalls.reduce((a, b) => a + b.pct, 0) / overalls.length : null;

  const classAttRates = students
    .map((s) => attSummaries.get(s.id)?.rate)
    .filter((r): r is number => r != null);
  const classAttRate = classAttRates.length ? classAttRates.reduce((a, b) => a + b, 0) / classAttRates.length : null;

  const atRisk = useMemo(() => atRiskStudents(students, assessments, marks), [students, assessments, marks]);

  // Class mean per assessment, in date order.
  const meanSeries = ordered.map((a) => {
    const s = assessmentStats(a, marks);
    return { name: a.title, mean: s.mean !== null ? Math.round(s.mean * 10) / 10 : null, median: s.median, entered: s.entered };
  });

  // Histogram for the selected (default: latest) assessment.
  const histTarget = ordered.find((a) => a.id === histAssessment) ?? ordered[ordered.length - 1];
  const histData = histTarget
    ? histogram(
        marks
          .filter((m) => m.assessmentId === histTarget.id)
          .map((m) => percentage(m, histTarget))
          .filter((v): v is number => v !== null),
      )
    : [];

  // Focus student trend vs class average across assessments.
  const focus = focusStudent ? byId.get(focusStudent) : undefined;
  const trendData = ordered.map((a) => {
    const s = assessmentStats(a, marks);
    const row: { name: string; classAvg: number | null; student?: number | null } = {
      name: a.title,
      classAvg: s.mean !== null ? Math.round(s.mean * 10) / 10 : null,
    };
    if (focus) {
      const point = studentSeries(focus.id, assessments, marks).find((p) => p.assessment.id === a.id);
      row.student = point ? Math.round(point.pct * 10) / 10 : null;
    }
    return row;
  });

  // Attendance vs performance scatter (one dot per student).
  const scatterData = overalls
    .map(({ student, pct }) => {
      const att = attSummaries.get(student.id)?.rate;
      return att != null ? { x: Math.round(att * 100), y: Math.round(pct), name: studentName(student) } : null;
    })
    .filter((d): d is { x: number; y: number; name: string } => d !== null);

  // Mean by category.
  const categories = [...new Set(assessments.map((a) => a.category).filter(Boolean))];
  const categoryData = categories.map((cat) => {
    const catAssessments = assessments.filter((a) => a.category === cat);
    const pcts = catAssessments.flatMap((a) =>
      marks
        .filter((m) => m.assessmentId === a.id)
        .map((m) => percentage(m, a))
        .filter((v): v is number => v !== null),
    );
    return { name: cat, mean: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0 };
  });

  if (assessments.length === 0) {
    return (
      <div>
        <div className="view-header">
          <h1>{currentClass} — Dashboard</h1>
        </div>
        <div className="panel muted">Create assessments and enter marks to see the marks analysis dashboard.</div>
        {lessons.length > 0 && (
          <>
            <h2 className="section-heading">Seating insights</h2>
            <SeatingInsights />
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Dashboard</h1>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="value">{classAvg !== null ? `${Math.round(classAvg)}%` : "—"}</div>
          <div className="label">class average</div>
        </div>
        <div className="stat-tile">
          <div className="value">{classAttRate !== null ? `${Math.round(classAttRate * 100)}%` : "—"}</div>
          <div className="label">attendance rate</div>
        </div>
        <div className="stat-tile">
          <div className="value">{assessments.length}</div>
          <div className="label">assessments</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: atRisk.length ? "var(--danger)" : "var(--accent)" }}>
            {atRisk.length}
          </div>
          <div className="label">students flagged</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <h3>Class mean by assessment</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={meanSeries} barCategoryGap="25%">
              <CartesianGrid stroke={C_GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C_INK }} interval={0} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="mean" name="Class mean" fill={C_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="row">
            <h3 className="grow">Mark distribution</h3>
            <select value={histTarget?.id ?? ""} onChange={(e) => setHistAssessment(e.target.value)}>
              {ordered.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={histData} barCategoryGap="12%">
              <CartesianGrid stroke={C_GRID} vertical={false} />
              <XAxis dataKey="bin" tick={{ fontSize: 10, fill: C_INK }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C_INK }} width={30} />
              <Tooltip formatter={(v: number) => `${v} student${v === 1 ? "" : "s"}`} />
              <Bar dataKey="count" name="Students" fill={C_PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="row">
            <h3 className="grow">Student trend vs class</h3>
            <select value={focusStudent} onChange={(e) => setFocusStudent(e.target.value)}>
              <option value="">— choose student —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {studentName(s)}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid stroke={C_GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C_INK }} interval={0} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="classAvg"
                name="Class average"
                stroke={C_SECONDARY}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 4 }}
                connectNulls
              />
              {focus && (
                <Line
                  type="monotone"
                  dataKey="student"
                  name={studentName(focus)}
                  stroke={C_PRIMARY}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h3>Attendance vs performance</h3>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ bottom: 6 }}>
              <CartesianGrid stroke={C_GRID} />
              <XAxis
                type="number"
                dataKey="x"
                name="Attendance"
                domain={[0, 100]}
                unit="%"
                tick={{ fontSize: 11, fill: C_INK }}
                label={{ value: "attendance", position: "insideBottom", offset: -4, fontSize: 11, fill: C_INK }}
              />
              <YAxis type="number" dataKey="y" name="Overall" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: number) => `${v}%`}
                labelFormatter={() => ""}
                content={({ payload }) =>
                  payload && payload.length ? (
                    <div className="panel" style={{ padding: "6px 10px", marginBottom: 0 }}>
                      <b>{(payload[0].payload as { name: string }).name}</b>
                      <div className="muted">
                        attendance {(payload[0].payload as { x: number }).x}% · overall {(payload[0].payload as { y: number }).y}%
                      </div>
                    </div>
                  ) : null
                }
              />
              <Scatter data={scatterData} fill={C_PRIMARY} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {categoryData.length > 1 && (
          <div className="panel">
            <h3>Mean by category</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={categoryData} barCategoryGap="25%">
                <CartesianGrid stroke={C_GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C_INK }} interval={0} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="mean" name="Mean" fill={C_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="panel">
          <h3>Students needing attention</h3>
          {atRisk.length === 0 ? (
            <p className="muted">No students flagged — nice.</p>
          ) : (
            <table className="data">
              <tbody>
                {atRisk.map((f) => {
                  const s = byId.get(f.studentId);
                  return (
                    <tr key={f.studentId}>
                      <td style={{ width: 180 }}>
                        <span className="tag warn">⚠ flagged</span> {s ? studentName(s) : f.studentId}
                      </td>
                      <td className="muted">{f.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h2 className="section-heading">Seating insights</h2>
      <SeatingInsights />
    </div>
  );
}
