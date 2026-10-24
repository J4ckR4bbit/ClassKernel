import { useMemo, useRef } from "react";
import { useApp, useAppPick } from "../../store/appStore";
import { Assessment, Mark, studentName, sortByName } from "../../lib/types";
import { fmtDecimal, parseDecimal } from "../../lib/format";
import { positionTint } from "../../lib/listTint";
import MarkSheetTools from "../MarkSheetTools";
import Icon from "../Icon";

/**
 * Keyboard-first mark entry: type a mark, press Enter, the next student is
 * focused. Built for entering marks while working through a pile of papers.
 */
export default function QuickMarking({ assessment, onDone, onImported }: { assessment: Assessment; onDone: () => void; onImported: () => void }) {
  const { students, marks, setMarks } = useAppPick("students", "marks", "setMarks");
  const sorted = useMemo(
    () => sortByName(students),
    [students],
  );
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const byStudent = useMemo(() => {
    const m = new Map<string, Mark>();
    for (const x of marks) if (x.assessmentId === assessment.id && !m.has(x.studentId)) m.set(x.studentId, x);
    return m;
  }, [marks, assessment.id]);
  const markOf = (studentId: string): Mark | undefined => byStudent.get(studentId);

  // Reads fresh store state (as the per-question grid does), so fast typing
  // across rows never works from a list one keystroke out of date.
  const save = (studentId: string, patch: Partial<Pick<Mark, "mark" | "comment">>) => {
    const current = useApp.getState().marks;
    const mine = (m: Mark) => m.assessmentId === assessment.id && m.studentId === studentId;
    const existing = current.find(mine);
    void setMarks([
      ...current.filter((m) => !mine(m)),
      { assessmentId: assessment.id, studentId, mark: existing?.mark ?? null, comment: existing?.comment ?? "", ...patch },
    ]);
  };
  const setMark = (studentId: string, raw: string) => {
    const value = raw.trim() === "" ? null : parseDecimal(raw);
    if (value !== null && !Number.isFinite(value)) return;
    save(studentId, { mark: value });
  };

  const focusRow = (i: number) => inputs.current[i]?.focus();

  const entered = sorted.filter((s) => markOf(s.id)?.mark != null).length;

  return (
    <div className="marking-view">
      <div className="view-header">
        <div className="spacer" />
        <span className="muted">
          {entered}/{sorted.length} entered
        </span>
        <MarkSheetTools assessment={assessment} onImported={onImported} />
        <button className="primary" onClick={onDone}>
          <Icon name="check" size={18} /> Done
        </button>
      </div>

      <div className="panel quick-mark-list">
        {sorted.map((s, i) => {
          const m = markOf(s.id);
          const pct = m?.mark != null && assessment.totalMarks > 0 ? Math.round((m.mark / assessment.totalMarks) * 100) : null;
          const over = m?.mark != null && m.mark > assessment.totalMarks;
          return (
            <div key={s.id} className={`quick-mark-row ${m?.mark != null ? "done" : ""}`}>
              <span className="name" style={{ background: positionTint(i, sorted.length) }}>
                {i + 1}. {studentName(s)}
              </span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className="mark-input"
                inputMode="decimal"
                autoFocus={i === 0}
                defaultValue={m?.mark != null ? fmtDecimal(m.mark) : ""}
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
                onChange={(e) => save(s.id, { comment: e.target.value })}
              />
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="empty-row start">Add students to the class first.</p>
        )}
      </div>
    </div>
  );
}
