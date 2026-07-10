import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { studentName } from "../lib/types";
import { behaviourByStudent } from "../lib/stats";

export default function BehaviourLogView() {
  const { currentClass, students, behaviourEvents, behaviourCodes, removeBehaviourEvent } = useApp();
  const [studentFilter, setStudentFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const summaries = behaviourByStudent(behaviourEvents);

  const filtered = behaviourEvents
    .filter((e) => !studentFilter || e.studentId === studentFilter)
    .filter((e) => !codeFilter || e.code === codeFilter)
    .filter((e) => !from || e.timestamp.slice(0, 10) >= from)
    .filter((e) => !to || e.timestamp.slice(0, 10) <= to)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const codeOf = (code: string) => behaviourCodes.find((c) => c.code === code);

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Behaviour log</h1>
        <div className="spacer" />
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="">All students</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {studentName(s)}
            </option>
          ))}
        </select>
        <select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)}>
          <option value="">All behaviours</option>
          {behaviourCodes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
      </div>

      {studentFilter && summaries.get(studentFilter) && (
        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="value">{summaries.get(studentFilter)!.positive}</div>
            <div className="label">positive events</div>
          </div>
          <div className="stat-tile">
            <div className="value">{summaries.get(studentFilter)!.negative}</div>
            <div className="label">negative events</div>
          </div>
          <div className="stat-tile">
            <div className="value">
              {summaries.get(studentFilter)!.points > 0 ? "+" : ""}
              {summaries.get(studentFilter)!.points}
            </div>
            <div className="label">net points</div>
          </div>
        </div>
      )}

      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 170 }}>When</th>
            <th style={{ width: 200 }}>Student</th>
            <th>Behaviour</th>
            <th style={{ width: 70 }}>Points</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 300).map((e, i) => {
            const s = byId.get(e.studentId);
            const c = codeOf(e.code);
            return (
              <tr key={`${e.timestamp}-${e.studentId}-${i}`}>
                <td className="muted">{e.timestamp.slice(0, 16).replace("T", " ")}</td>
                <td>{s ? studentName(s) : e.studentId}</td>
                <td>
                  <span className="tag" style={{ background: (c?.color ?? "#888") + "22", color: c?.color ?? "#555" }}>
                    {c?.label ?? e.code}
                  </span>
                  {e.note && <span className="muted"> {e.note}</span>}
                </td>
                <td style={{ color: e.points >= 0 ? "var(--accent)" : "var(--danger)", fontWeight: 600 }}>
                  {e.points > 0 ? `+${e.points}` : e.points}
                </td>
                <td>
                  <button
                    className="small danger"
                    title="Delete this event"
                    onClick={() => void removeBehaviourEvent(e.timestamp, e.studentId, e.code)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No behaviour events match — log them from the Live lesson view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {filtered.length > 300 && <p className="muted">Showing the latest 300 of {filtered.length} events.</p>}
    </div>
  );
}
