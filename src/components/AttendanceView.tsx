import { useMemo, useState } from "react";
import { useAppPick } from "../store/appStore";
import { today } from "../lib/id";
import { AttendanceStatus, studentName } from "../lib/types";
import { attendanceByStudent, attendanceSummary } from "../lib/stats";

const STATUSES: Array<{ code: AttendanceStatus; label: string }> = [
  { code: "P", label: "Present" },
  { code: "A", label: "Absent" },
  { code: "L", label: "Late" },
  { code: "E", label: "Excused" },
];

export default function AttendanceView() {
  const { students, attendance, setAttendance, showToast, userPrefs, sensitiveRevealed, revealSensitive } = useAppPick(
    "students",
    "attendance",
    "setAttendance",
    "showToast",
    "userPrefs",
    "sensitiveRevealed",
    "revealSensitive",
  );
  const [date, setDate] = useState(today());

  const todayEntries = useMemo(() => attendance.filter((e) => e.date === date), [attendance, date]);
  const statusOf = (studentId: string) => todayEntries.find((e) => e.studentId === studentId)?.status;
  const summary = attendanceSummary(todayEntries);
  const historical = useMemo(() => attendanceByStudent(attendance), [attendance]);

  // Register-taking happens front-of-class, so this screen is never gated —
  // but flags and per-student history stay hidden until explicitly revealed.
  const showDetails = !userPrefs.privacyMode || sensitiveRevealed;

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    const rest = attendance.filter((e) => !(e.date === date && e.studentId === studentId));
    void setAttendance([...rest, { date, studentId, status, note: "" }]);
  };

  const markAllPresent = () => {
    const previous = attendance;
    const rest = attendance.filter((e) => e.date !== date);
    void setAttendance([...rest, ...students.map((s) => ({ date, studentId: s.id, status: "P" as const, note: "" }))]);
    showToast("Everyone marked present — adjust the exceptions", {
      label: "Undo",
      run: () => void setAttendance(previous),
    });
  };

  const sorted = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

  return (
    <div>
      <div className="view-header">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="spacer" />
        <div className="att-summary">
          <span>✓ {summary.present} present</span>
          <span>✗ {summary.absent} absent</span>
          <span>⏱ {summary.late} late</span>
          <span>◦ {summary.excused} excused</span>
          <span>{students.length - todayEntries.length} unmarked</span>
        </div>
        <button className="primary" onClick={markAllPresent}>
          All present
        </button>
      </div>
      <p className="muted att-legend">P present · A absent · L late · E excused</p>

      <table className="data">
        <thead>
          <tr>
            <th>Student</th>
            <th style={{ width: 220 }}>Today</th>
            {showDetails && (
              <>
                <th style={{ width: 130 }}>Attendance rate</th>
                <th style={{ width: 90 }}>Absences</th>
                <th style={{ width: 80 }}>Lates</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const current = statusOf(s.id);
            const hist = historical.get(s.id);
            return (
              <tr key={s.id}>
                <td>
                  {studentName(s)}
                  {showDetails &&
                    s.flags &&
                    s.flags
                      .split(";")
                      .filter(Boolean)
                      .map((f) => (
                        <span key={f} className="tag warn" style={{ marginLeft: 6 }}>
                          {f}
                        </span>
                      ))}
                </td>
                <td>
                  <div className="att-seg" role="radiogroup" aria-label={`Attendance for ${studentName(s)}`}>
                    {STATUSES.map(({ code, label }) => (
                      <button
                        key={code}
                        title={label}
                        role="radio"
                        aria-checked={current === code}
                        className={`att-btn ${code} ${current === code ? "on" : ""}`}
                        onClick={() => setStatus(s.id, code)}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </td>
                {showDetails && (
                  <>
                    <td>{hist?.rate != null ? `${Math.round(hist.rate * 100)}%` : <span className="muted">—</span>}</td>
                    <td>{hist?.absent ?? 0}</td>
                    <td>{hist?.late ?? 0}</td>
                  </>
                )}
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={showDetails ? 5 : 2} className="muted" style={{ textAlign: "center", padding: 24 }}>
                Add students in Settings → Students first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!showDetails && (
        <p className="muted">
          Flags and attendance history are hidden while this screen may be visible to the class.{" "}
          <button className="small" onClick={revealSensitive}>
            Show details
          </button>
        </p>
      )}
    </div>
  );
}
