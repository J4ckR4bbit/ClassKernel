import { useMemo, useState } from "react";
import { useApp, useAppPick } from "../store/appStore";
import { DASHBOARDS_ID } from "../plugins/registry";
import { studentName } from "../lib/types";
import { behaviourByStudent, formatDuration, visitSeconds } from "../lib/stats";
import { dateInZone, dateTimeInZone, timeInZone } from "../lib/time";
import PrivacyGate from "./PrivacyGate";
import Icon from "./Icon";

export default function BehaviourLogView() {
  const {
    students,
    behaviourEvents,
    behaviourCodes,
    removeBehaviourEvent,
    addBehaviourEvent,
    bathroomVisits,
    setBathroomVisits,
    showToast,
  } = useAppPick(
    "students",
    "behaviourEvents",
    "behaviourCodes",
    "removeBehaviourEvent",
    "addBehaviourEvent",
    "bathroomVisits",
    "setBathroomVisits",
    "showToast",
  );
  const [studentFilter, setStudentFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const summaries = behaviourByStudent(behaviourEvents);

  const filtered = behaviourEvents
    .filter((e) => !studentFilter || e.studentId === studentFilter)
    .filter((e) => !codeFilter || e.code === codeFilter)
    .filter((e) => !from || dateInZone(e.timestamp) >= from)
    .filter((e) => !to || dateInZone(e.timestamp) <= to)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const codeOf = (code: string) => behaviourCodes.find((c) => c.code === code);

  // The bathroom log honours the same student and date filters as the events.
  const bathroomFiltered = bathroomVisits
    .filter((v) => !studentFilter || v.studentId === studentFilter)
    .filter((v) => !from || v.date >= from)
    .filter((v) => !to || v.date <= to)
    .sort((a, b) => b.start.localeCompare(a.start));

  const deleteVisit = (studentId: string, start: string) => {
    const previous = bathroomVisits;
    void setBathroomVisits(bathroomVisits.filter((v) => !(v.studentId === studentId && v.start === start)));
    showToast("Bathroom visit deleted", { label: "Undo", run: () => void setBathroomVisits(previous) });
  };

  return (
    <div>
      <PrivacyGate label="the behaviour history">
      <div className="view-header">
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
        <label className="field-label">
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field-label">
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
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
                <td className="muted">{dateTimeInZone(e.timestamp)}</td>
                <td>{s ? <StudentLink id={s.id} name={studentName(s)} /> : e.studentId}</td>
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
                    className="icon-only small danger"
                    title="Delete this event"
                    onClick={() => {
                      const deleted = { ...e };
                      void removeBehaviourEvent(e.timestamp, e.studentId, e.code);
                      showToast("Behaviour event deleted", { label: "Undo", run: () => void addBehaviourEvent(deleted) });
                    }}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No behaviour events match — log them from the Lesson screen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {filtered.length > 300 && <p className="muted">Showing the latest 300 of {filtered.length} events.</p>}

      <h2 className="section-heading">
        <Icon name="wc" size={20} /> Bathroom log
      </h2>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 110 }}>Date</th>
            <th style={{ width: 200 }}>Student</th>
            <th style={{ width: 90 }}>Out</th>
            <th style={{ width: 90 }}>Back</th>
            <th>Duration</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {bathroomFiltered.slice(0, 300).map((v) => {
            const s = byId.get(v.studentId);
            return (
              <tr key={`${v.studentId}-${v.start}`}>
                <td className="muted">{v.date}</td>
                <td>{s ? <StudentLink id={s.id} name={studentName(s)} /> : v.studentId}</td>
                <td className="muted">{timeInZone(v.start)}</td>
                <td className="muted">{v.end ? timeInZone(v.end) : "—"}</td>
                <td>
                  {v.end ? (
                    formatDuration(visitSeconds(v))
                  ) : (
                    <span className="tag warn">still out</span>
                  )}
                </td>
                <td>
                  <button
                    className="icon-only small danger"
                    title="Delete this visit"
                    onClick={() => deleteVisit(v.studentId, v.start)}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
          {bathroomFiltered.length === 0 && (
            <tr>
              <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No bathroom visits match — start a timer from a seat on the Lesson screen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </PrivacyGate>
    </div>
  );
}

/** A student's name; it opens their dashboard while the dashboards plugin is on. */
function StudentLink({ id, name }: { id: string; name: string }) {
  const openStudentDashboard = useApp((s) => s.openStudentDashboard);
  const dashboardsOn = useApp((s) => s.userPrefs.enabledPlugins.includes(DASHBOARDS_ID));
  if (!dashboardsOn) return <>{name}</>;
  return (
    <button className="link-btn" onClick={() => openStudentDashboard(id)} title="Open this student's dashboard">
      {name}
    </button>
  );
}
