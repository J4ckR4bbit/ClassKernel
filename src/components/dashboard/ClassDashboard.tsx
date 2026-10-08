import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { studentName } from "../../lib/types";
import { assessmentStats, attendanceByStudent, histogram, percentage } from "../../lib/stats";
import { ClassData, ClassProfile, fmtSigned } from "../../lib/insights";
import SeatingInsights from "../SeatingInsights";
import {
  C_GRID,
  C_INK,
  C_PRIMARY,
  CodeCountChart,
  PeopleList,
  StatTile,
  SummaryCard,
  WeeklyBehaviourChart,
  fmtPct,
} from "./shared";

/**
 * How the class is doing: a written summary, behaviour over time and its most
 * common issues, the students who stand out (for good and bad reasons), and
 * the marks analysis.
 */
export default function ClassDashboard({
  data,
  profile: p,
  summary,
  nameOf,
  onOpenStudent,
}: {
  data: ClassData;
  profile: ClassProfile;
  summary: string[];
  nameOf: (id: string) => string;
  onOpenStudent: (id: string) => void;
}) {
  const b = p.behaviour;
  const issues = b.byCode.filter((c) => c.kind === "negative");
  const positives = b.byCode.filter((c) => c.kind === "positive");

  return (
    <div className="dash-class">
      <SummaryCard title="How the class is doing" lines={summary} />

      <div className="stat-tiles">
        <StatTile value={fmtPct(p.classAverage)} label="class average" />
        <StatTile value={p.attendanceRate !== null ? fmtPct(p.attendanceRate * 100) : "—"} label="attendance" />
        <StatTile value={String(b.positive)} label="positive entries" tone="good" />
        <StatTile value={String(b.negative)} label="negative entries" tone={b.negative ? "bad" : undefined} />
        <StatTile value={fmtSigned(b.net)} label="net points" />
        <StatTile
          value={p.answers.rate !== null ? fmtPct(p.answers.rate * 100) : "—"}
          label={`questions answered (${p.answers.answered}/${p.answers.asked})`}
        />
        <StatTile value={String(p.bathroom.trips)} label="bathroom trips" />
      </div>

      <h2 className="section-heading">Behaviour</h2>
      <div className="dash-grid">
        <div className="panel">
          <h3>Week by week</h3>
          <WeeklyBehaviourChart weeks={b.weekly} />
        </div>
        <div className="panel">
          <h3>Top issues</h3>
          <CodeCountChart counts={issues} />
        </div>
        {positives.length > 0 && (
          <div className="panel">
            <h3>What's going well</h3>
            <CodeCountChart counts={positives} />
          </div>
        )}
      </div>

      <h2 className="section-heading">Students</h2>
      <div className="people-grid">
        <PeopleList
          icon="warning"
          title="Students to watch"
          hint="3 or more negative entries and below the class on points, or far below everyone else."
          people={p.watch}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty="No one stands out — nice."
          tone="warn"
        />
        <PeopleList
          icon="star"
          title="Stars"
          hint="Most positive entries."
          people={p.stars}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty="No positive entries yet."
          tone="good"
        />
        <PeopleList
          icon="person_raised_hand"
          title="Best answerers"
          hint="Answered at least half the questions they were asked (asked 3 or more times)."
          people={p.answerers}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty="Use Pick a student to build up answer data."
          tone="good"
        />
        <PeopleList
          icon="voice_over_off"
          title="Rarely asked"
          hint="Not picked to answer yet, or far less than most."
          people={p.rarelyAsked}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty={p.answers.asked ? "Everyone has had a turn." : "No questions asked yet."}
          max={10}
        />
        <PeopleList
          icon="wc"
          title="Bathroom trips"
          people={p.bathroomUsers}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty="No bathroom trips."
        />
        <PeopleList
          icon="event_busy"
          title="Attendance below 90%"
          people={p.lowAttendance}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty={p.attendanceRate === null ? "No attendance taken." : "Everyone is above 90%."}
          tone="warn"
        />
        <PeopleList
          icon="trophy"
          title="Top marks"
          people={p.topPerformers}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty="No marks entered."
          tone="good"
        />
        <PeopleList
          icon="trending_down"
          title="Flagged on marks"
          hint="Latest result well below their own average, far below the class, or three drops in a row."
          people={p.atRisk.map((f) => ({ studentId: f.studentId, value: 0, detail: f.reason }))}
          nameOf={nameOf}
          onOpen={onOpenStudent}
          empty={p.overalls.size ? "No one flagged — nice." : "No marks entered."}
          tone="warn"
        />
      </div>

      <h2 className="section-heading">Marks</h2>
      <MarksCharts data={data} />

      <h2 className="section-heading">Seating insights</h2>
      <SeatingInsights />
    </div>
  );
}

/** The marks analysis that was the whole dashboard before, now for the chosen period. */
function MarksCharts({ data }: { data: ClassData }) {
  const { students, assessments, marks, attendance } = data;
  const [histAssessment, setHistAssessment] = useState("");
  const ordered = [...assessments].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length === 0) {
    return <div className="panel muted">No assessments in this period. Enter marks under Assessments to see the analysis.</div>;
  }

  const meanSeries = ordered.map((a) => {
    const s = assessmentStats(a, marks);
    return { name: a.title, mean: s.mean !== null ? Math.round(s.mean) : null };
  });

  const histTarget = ordered.find((a) => a.id === histAssessment) ?? ordered[ordered.length - 1];
  const histData = histogram(
    marks
      .filter((m) => m.assessmentId === histTarget.id)
      .map((m) => percentage(m, histTarget))
      .filter((v): v is number => v !== null),
  );

  const attSummaries = attendanceByStudent(attendance);
  const scatterData = students
    .map((s) => {
      const pcts = ordered
        .map((a) => {
          const m = marks.find((x) => x.assessmentId === a.id && x.studentId === s.id);
          return m ? percentage(m, a) : null;
        })
        .filter((v): v is number => v !== null);
      const att = attSummaries.get(s.id)?.rate;
      if (!pcts.length || att == null) return null;
      return { x: Math.round(att * 100), y: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length), name: studentName(s) };
    })
    .filter((d): d is { x: number; y: number; name: string } => d !== null);

  const categories = [...new Set(assessments.map((a) => a.category).filter(Boolean))];
  const categoryData = categories.map((cat) => {
    const pcts = assessments
      .filter((a) => a.category === cat)
      .flatMap((a) =>
        marks
          .filter((m) => m.assessmentId === a.id)
          .map((m) => percentage(m, a))
          .filter((v): v is number => v !== null),
      );
    return { name: cat, mean: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0 };
  });

  return (
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
          <select value={histTarget.id} onChange={(e) => setHistAssessment(e.target.value)}>
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
        <h3>Attendance vs marks</h3>
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
            <YAxis type="number" dataKey="y" name="Average" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: C_INK }} width={44} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) =>
                payload && payload.length ? (
                  <div className="panel" style={{ padding: "6px 10px", marginBottom: 0 }}>
                    <b>{(payload[0].payload as { name: string }).name}</b>
                    <div className="muted">
                      attendance {(payload[0].payload as { x: number }).x}% · average {(payload[0].payload as { y: number }).y}%
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
    </div>
  );
}
