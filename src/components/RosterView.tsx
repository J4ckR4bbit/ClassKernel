import { useState } from "react";
import { useApp } from "../store/appStore";
import { newId } from "../lib/id";
import { Student } from "../lib/types";
import { attendanceByStudent, behaviourByStudent } from "../lib/stats";
import PrivacyGate from "./PrivacyGate";
import { DASHBOARDS_ID } from "../plugins/registry";
import Icon from "./Icon";
import RosterSheetTools from "./RosterSheetTools";

export default function RosterView() {
  const { students, setStudents, attendance, behaviourEvents, showToast, confirmDialog, openStudentDashboard, userPrefs, currentClass } = useApp();
  // The dashboard shortcut is there only while the dashboards plugin is switched on.
  const dashboardsOn = userPrefs.enabledPlugins.includes(DASHBOARDS_ID);
  const [showImport, setShowImport] = useState(false);
  const attSummaries = attendanceByStudent(attendance);
  const bhSummaries = behaviourByStudent(behaviourEvents);

  const update = (id: string, patch: Partial<Student>) => {
    void setStudents(students.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStudent = () => {
    void setStudents([...students, { id: newId("s"), firstName: "", lastName: "", adamNo: "", gender: "", flags: "", notes: "" }]);
  };

  const remove = async (id: string) => {
    const s = students.find((s) => s.id === id);
    const ok = await confirmDialog({
      title: `Remove ${s?.firstName} ${s?.lastName}?`,
      body: "Their attendance, behaviour and mark history stays in the CSV files.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const previous = students;
    void setStudents(students.filter((s) => s.id !== id));
    showToast("Student removed", { label: "Undo", run: () => void setStudents(previous) });
  };

  return (
    <div>
      <PrivacyGate label="names, flags and notes">
      <div className="view-header">
        <span className="muted">{students.length} students</span>
        <div className="spacer" />
        {currentClass && <RosterSheetTools oneClass={currentClass} />}
        <button onClick={() => setShowImport(true)}>Import list…</button>
        <button className="primary" onClick={addStudent}>
          <Icon name="add" size={20} /> Add student
        </button>
      </div>

      <p className="muted field-hint">
        Flags are short tags separated by semicolons, e.g. <b>SEN;Medical</b> — notes are free text. Both stay off
        class-facing screens unless you choose otherwise in Settings.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 160 }}>First name</th>
            <th style={{ width: 160 }}>Last name</th>
            <th style={{ width: 110 }} title="The school's number for the student in Adam">
              Adam no.
            </th>
            <th style={{ width: 80 }}>Gender</th>
            <th style={{ width: 140 }}>Flags</th>
            <th>Notes</th>
            <th style={{ width: 110 }}>Attendance</th>
            <th style={{ width: 90 }}>Behaviour</th>
            <th style={{ width: dashboardsOn ? 96 : 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const att = attSummaries.get(s.id);
            const bh = bhSummaries.get(s.id);
            return (
              <tr key={s.id}>
                <td>
                  <input value={s.firstName} onChange={(e) => update(s.id, { firstName: e.target.value })} />
                </td>
                <td>
                  <input value={s.lastName} onChange={(e) => update(s.id, { lastName: e.target.value })} />
                </td>
                <td>
                  <input
                    value={s.adamNo}
                    onChange={(e) => update(s.id, { adamNo: e.target.value })}
                    placeholder="—"
                    aria-label={`Adam number for ${s.firstName} ${s.lastName}`}
                  />
                </td>
                <td>
                  <input value={s.gender} onChange={(e) => update(s.id, { gender: e.target.value })} placeholder="—" />
                </td>
                <td>
                  <input
                    value={s.flags}
                    onChange={(e) => update(s.id, { flags: e.target.value })}
                    title="Semicolon-separated tags, e.g. SEN;Medical"
                  />
                </td>
                <td>
                  <input value={s.notes} onChange={(e) => update(s.id, { notes: e.target.value })} />
                </td>
                <td>{att?.rate != null ? `${Math.round(att.rate * 100)}%` : <span className="muted">—</span>}</td>
                <td>
                  {bh ? (
                    <span title={`${bh.positive} positive, ${bh.negative} negative`}>
                      {bh.points >= 0 ? "+" : ""}
                      {bh.points}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {dashboardsOn && (
                    <>
                      <button
                        className="icon-only small"
                        onClick={() => openStudentDashboard(s.id)}
                        title="Open this student's dashboard"
                        aria-label={`Dashboard for ${s.firstName} ${s.lastName}`}
                      >
                        <Icon name="bar_chart" size={18} />
                      </button>{" "}
                    </>
                  )}
                  <button className="icon-only small danger" onClick={() => void remove(s.id)} title="Remove student">
                    <Icon name="close" size={18} />
                  </button>
                </td>
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No students yet — add them one by one or paste a whole list with “Import list…”.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      </PrivacyGate>
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={(imported) => {
            void setStudents([...students, ...imported]);
            showToast(`Imported ${imported.length} students`);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (students: Student[]) => void }) {
  const [text, setText] = useState("");

  // Accepts "First Last" per line, or CSV-ish "Last, First".
  const parse = (): Student[] => {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        let first = "";
        let last = "";
        if (line.includes(",")) {
          const [l, f] = line.split(",");
          last = l.trim();
          first = (f ?? "").trim();
        } else {
          const parts = line.split(/\s+/);
          first = parts[0] ?? "";
          last = parts.slice(1).join(" ");
        }
        return { id: newId("s"), firstName: first, lastName: last, adamNo: "", gender: "", flags: "", notes: "" };
      });
  };

  const preview = parse();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import students</h2>
        <p className="muted">
          Paste one student per line — either <b>First Last</b> or <b>Last, First</b> (as copied from a school report or
          spreadsheet column).
        </p>
        <textarea
          autoFocus
          rows={10}
          style={{ width: "100%" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Amelia Adams\nBen Baker\nClark, Chloe"}
        />
        <div className="actions">
          <span className="muted grow">{preview.length} students detected</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={preview.length === 0} onClick={() => onImport(preview)}>
            Import {preview.length || ""}
          </button>
        </div>
      </div>
    </div>
  );
}
