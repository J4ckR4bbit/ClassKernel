import { useMemo, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { newId, today } from "../lib/id";
import { Assessment, Mark, studentName } from "../lib/types";
import { assessmentStats } from "../lib/stats";

export default function AssessmentsView() {
  const { currentClass, students, assessments, setAssessments, marks, setMarks, showToast } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const marking = assessments.find((a) => a.id === markingId) ?? null;
  const ordered = [...assessments].sort((a, b) => b.date.localeCompare(a.date));

  const deleteAssessment = (a: Assessment) => {
    if (!confirm(`Delete "${a.title}" and its marks?`)) return;
    void setAssessments(assessments.filter((x) => x.id !== a.id));
    void setMarks(marks.filter((m) => m.assessmentId !== a.id));
  };

  if (marking) {
    return (
      <QuickMarking
        assessment={marking}
        onDone={() => {
          setMarkingId(null);
          showToast("Marks saved");
        }}
      />
    );
  }

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Assessments</h1>
        <div className="spacer" />
        <button className="primary" onClick={() => setShowNew(true)}>
          + New assessment
        </button>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>Title</th>
            <th style={{ width: 110 }}>Date</th>
            <th style={{ width: 100 }}>Category</th>
            <th style={{ width: 90 }}>Out of</th>
            <th style={{ width: 80 }}>Weight</th>
            <th style={{ width: 110 }}>Marked</th>
            <th style={{ width: 110 }}>Class mean</th>
            <th style={{ width: 200 }}></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((a) => {
            const stats = assessmentStats(a, marks);
            return (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.date}</td>
                <td>{a.category}</td>
                <td>{a.totalMarks}</td>
                <td>{a.weight}</td>
                <td>
                  {stats.entered}/{students.length}
                </td>
                <td>{stats.mean !== null ? `${Math.round(stats.mean)}%` : <span className="muted">—</span>}</td>
                <td>
                  <div className="row">
                    <button className="small primary" onClick={() => setMarkingId(a.id)}>
                      ✎ Enter marks
                    </button>
                    <button className="small danger" onClick={() => deleteAssessment(a)}>
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {assessments.length === 0 && (
            <tr>
              <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No assessments yet — create one, then use the quick-marking tool while you mark.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showNew && (
        <NewAssessmentModal
          onClose={() => setShowNew(false)}
          onCreate={(a) => {
            void setAssessments([...assessments, a]);
            setShowNew(false);
            setMarkingId(a.id);
          }}
        />
      )}
    </div>
  );
}

function NewAssessmentModal({ onClose, onCreate }: { onClose: () => void; onCreate: (a: Assessment) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [totalMarks, setTotalMarks] = useState("100");
  const [weight, setWeight] = useState("1");
  const [category, setCategory] = useState("Test");

  const valid = title.trim() && Number(totalMarks) > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New assessment</h2>
        <div className="form-grid">
          <label>Title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cells test" />
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label>Out of</label>
          <input type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
          <label>Weight</label>
          <input type="number" min={0} step={0.5} value={weight} onChange={(e) => setWeight(e.target.value)} title="Relative weight in the overall grade" />
          <label>Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Test / Quiz / Homework / Exam" />
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() =>
              onCreate({
                id: newId("a"),
                title: title.trim(),
                date,
                totalMarks: Number(totalMarks),
                weight: Number(weight) || 1,
                category: category.trim(),
              })
            }
          >
            Create & mark
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Keyboard-first mark entry: type a mark, press Enter, the next student is
 * focused. Built for entering marks while working through a pile of papers.
 */
function QuickMarking({ assessment, onDone }: { assessment: Assessment; onDone: () => void }) {
  const { students, marks, setMarks } = useApp();
  const sorted = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students],
  );
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const markOf = (studentId: string): Mark | undefined =>
    marks.find((m) => m.assessmentId === assessment.id && m.studentId === studentId);

  const setMark = (studentId: string, raw: string, comment?: string) => {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) return;
    const rest = marks.filter((m) => !(m.assessmentId === assessment.id && m.studentId === studentId));
    const existing = markOf(studentId);
    void setMarks([
      ...rest,
      {
        assessmentId: assessment.id,
        studentId,
        mark: value,
        comment: comment ?? existing?.comment ?? "",
      },
    ]);
  };

  const focusRow = (i: number) => inputs.current[i]?.focus();

  const entered = sorted.filter((s) => markOf(s.id)?.mark != null).length;

  return (
    <div>
      <div className="view-header">
        <h1>
          Marking: {assessment.title} <span className="muted">(out of {assessment.totalMarks})</span>
        </h1>
        <div className="spacer" />
        <span className="muted">
          {entered}/{sorted.length} entered
        </span>
        <button className="primary" onClick={onDone}>
          ✓ Done
        </button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {sorted.map((s, i) => {
          const m = markOf(s.id);
          const pct = m?.mark != null && assessment.totalMarks > 0 ? Math.round((m.mark / assessment.totalMarks) * 100) : null;
          const over = m?.mark != null && m.mark > assessment.totalMarks;
          return (
            <div key={s.id} className="quick-mark-row">
              <span className="name">
                {i + 1}. {studentName(s)}
              </span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className="mark-input"
                inputMode="decimal"
                autoFocus={i === 0}
                defaultValue={m?.mark ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setMark(s.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    focusRow(Math.min(i + 1, sorted.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusRow(Math.max(i - 1, 0));
                  }
                }}
              />
              <span className="muted" style={{ width: 60, color: over ? "var(--danger)" : undefined }}>
                {over ? "> max!" : pct !== null ? `${pct}%` : ""}
              </span>
              <input
                className="grow"
                placeholder="comment (optional)"
                defaultValue={m?.comment ?? ""}
                onChange={(e) => setMark(s.id, String(markOf(s.id)?.mark ?? ""), e.target.value)}
              />
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="muted" style={{ padding: 16 }}>
            Add students to the class first.
          </p>
        )}
      </div>
      <p className="muted">Type a mark and press Enter to jump to the next student. Leave blank for absent/not sat.</p>
    </div>
  );
}
