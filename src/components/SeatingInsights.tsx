import { useMemo } from "react";
import { useApp } from "../store/appStore";
import { studentName } from "../lib/types";
import { disruptivePairs, studentDeskStats, studentOverallAverages } from "../lib/lessons";

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

/**
 * Teacher-facing analysis of the per-lesson seating history: how often each
 * student has sat at each desk, where they behave best/worst, and which
 * pairings turn disruptive (candidates for the keep-apart list).
 */
export default function SeatingInsights() {
  const { students, lessons, seatingPrefs, setSeatingPrefs, showToast } = useApp();
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const nameOf = (id: string) => {
    const s = byId.get(id);
    return s ? studentName(s) : id;
  };

  const sessions = useMemo(() => new Set(lessons.map((l) => l.sessionId)).size, [lessons]);
  const pairs = useMemo(() => disruptivePairs(lessons), [lessons]);
  const overall = useMemo(() => studentOverallAverages(lessons), [lessons]);

  // Per-student desk breakdown, only for students who have sat at 2+ desks.
  const perStudent = useMemo(
    () =>
      students
        .map((s) => ({ student: s, desks: studentDeskStats(lessons, s.id) }))
        .filter((r) => r.desks.length > 0),
    [students, lessons],
  );

  const alreadyApart = (a: string, b: string) =>
    seatingPrefs.apartPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  const addApart = (a: string, b: string) => {
    if (alreadyApart(a, b)) return;
    void setSeatingPrefs({ ...seatingPrefs, apartPairs: [...seatingPrefs.apartPairs, [a, b]] });
    showToast(`${nameOf(a)} & ${nameOf(b)} added to keep-apart`);
  };

  if (lessons.length === 0) {
    return (
      <div className="panel">
        <h3>Seating insights</h3>
        <p className="muted">
          Use <b>End lesson</b> on the Live lesson screen to save where students sat and how they behaved. After a few
          lessons this panel shows which desks each student behaves best at, and which pairings tend to turn
          disruptive.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="value">{sessions}</div>
          <div className="label">lessons recorded</div>
        </div>
        <div className="stat-tile">
          <div className="value">{perStudent.length}</div>
          <div className="label">students with history</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ color: pairs.length ? "var(--danger)" : "var(--accent)" }}>
            {pairs.length}
          </div>
          <div className="label">pairings to review</div>
        </div>
      </div>

      <div className="panel">
        <h3>Pairings to review — worse together</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          These pairs earn notably fewer behaviour points when sharing a desk than they do on average. Consider adding
          them to the keep-apart list.
        </p>
        {pairs.length === 0 ? (
          <p className="muted">No problem pairings so far — nice.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Pair</th>
                <th style={{ width: 90 }}>Lessons</th>
                <th style={{ width: 120 }}>Together avg</th>
                <th style={{ width: 120 }}>Usual avg</th>
                <th style={{ width: 110 }}>Difference</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={`${p.a}|${p.b}`}>
                  <td>
                    <b>{nameOf(p.a)}</b> + <b>{nameOf(p.b)}</b>
                  </td>
                  <td>{p.sessions}</td>
                  <td>{fmt(p.avgTogether)}</td>
                  <td>{fmt(p.avgOverall)}</td>
                  <td style={{ color: "var(--danger)" }}>{fmt(p.delta)} pts</td>
                  <td>
                    {alreadyApart(p.a, p.b) ? (
                      <span className="muted">on keep-apart</span>
                    ) : (
                      <button className="small" onClick={() => addApart(p.a, p.b)}>
                        Keep apart
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Seat history &amp; behaviour by desk</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          How many times each student has sat at each desk, and their average behaviour points there. The desk where a
          student behaves best is highlighted green, worst red.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Student</th>
              <th style={{ width: 110 }}>Usual avg</th>
              <th>Desks sat at (times · avg points)</th>
            </tr>
          </thead>
          <tbody>
            {perStudent.map(({ student, desks }) => {
              const multi = desks.length > 1;
              const best = multi ? [...desks].sort((a, b) => b.avgPoints - a.avgPoints)[0] : null;
              const worst = multi ? [...desks].sort((a, b) => a.avgPoints - b.avgPoints)[0] : null;
              return (
                <tr key={student.id}>
                  <td>{studentName(student)}</td>
                  <td>{overall.has(student.id) ? fmt(overall.get(student.id)!) : "—"}</td>
                  <td>
                    <div className="roster-chips">
                      {desks.map((d) => {
                        const tone =
                          best && d.deskLabel === best.deskLabel && best.avgPoints > (worst?.avgPoints ?? 0)
                            ? "good"
                            : worst && d.deskLabel === worst.deskLabel && worst.avgPoints < (best?.avgPoints ?? 0)
                              ? "bad"
                              : "";
                        return (
                          <span key={d.deskLabel} className={`desk-pill ${tone}`}>
                            {d.deskLabel} · ×{d.sessions} · {fmt(d.avgPoints)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
