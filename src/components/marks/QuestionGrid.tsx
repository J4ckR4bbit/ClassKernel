import { type KeyboardEvent as ReactKeyboardEvent, useMemo, useRef } from "react";
import { useApp, useAppPick } from "../../store/appStore";
import { Assessment, Mark, QuestionMark, studentName, sortByName } from "../../lib/types";
import {
  GRADE_SCALES,
  gradeForPct,
  gridCompletion,
  markIndex,
  questionAverages,
  rankStudents,
  studentProvisional,
} from "../../lib/stats";
import { fmtDecimal, parseDecimal } from "../../lib/format";
import { shortLabel } from "../../lib/topics";
import { positionTint, rankTints } from "../../lib/listTint";
import MarkSheetTools from "../MarkSheetTools";
import Icon from "../Icon";
import StatTile from "../StatTile";
import MarkCalculator, { CalculatorButton, useCalculatorShown } from "./MarkCalculator";

/**
 * Clamp a typed grid cell to [0, max], mirroring the reference app: over-max or
 * negative entries are silently corrected rather than flagged. In-range text is
 * returned untouched so part-typed values (e.g. "1,") aren't disturbed. A
 * decimal comma or point both work.
 */
function clampCell(raw: string, max: number): string {
  const t = raw.trim();
  if (t === "") return "";
  const n = parseDecimal(t);
  if (!Number.isFinite(n)) return raw;
  if (n > max) return fmtDecimal(max);
  if (n < 0) return "0";
  return raw;
}

/**
 * The spreadsheet-style marking grid for a multi-question test. Frozen name
 * columns on the left and total/percentage/rank on the right; a Marks (out-of)
 * row and a topic row in the header; live per-question and per-student stats.
 * `readOnly` shows the same grid with the marks as plain text, to look at the
 * results without the risk of changing one (its Back is in the top bar).
 */
export default function QuestionGrid({
  assessment,
  grade,
  readOnly = false,
  onDone,
  onEditQuestions,
  onEnterMarks,
  onImported,
}: {
  assessment: Assessment;
  grade: string;
  readOnly?: boolean;
  /** Marking only: back to the list. */
  onDone?: () => void;
  onEditQuestions: () => void;
  onEnterMarks?: () => void;
  /** After marks were imported from a spreadsheet. */
  onImported: () => void;
}) {
  const { students, questionMarks, topics, userPrefs, assessmentQuestions } = useAppPick(
    "students",
    "questionMarks",
    "topics",
    "userPrefs",
    "assessmentQuestions",
  );
  const scale = userPrefs.gradeScale;
  const scaleInfo = GRADE_SCALES[scale];
  const questions = useMemo(
    () => assessmentQuestions.filter((q) => q.assessmentId === assessment.id).sort((a, b) => a.number - b.number),
    [assessmentQuestions, assessment.id],
  );
  const sorted = useMemo(
    () => sortByName(students),
    [students],
  );
  const cells = useRef<Array<Array<HTMLInputElement | null>>>([]);
  const [calculator, setCalculator] = useCalculatorShown();
  const showCalculator = calculator && !readOnly;

  const qm = useMemo(() => questionMarks.filter((m) => m.assessmentId === assessment.id), [questionMarks, assessment.id]);
  // One lookup for every cell, shared with the live stats below.
  const qIdx = useMemo(() => markIndex(qm), [qm]);
  const markOf = (studentId: string, number: number) => qIdx.get(`${studentId}|${number}`) ?? null;

  // Write a single cell: update per-question marks and recompute that student's
  // total into marks.csv so the dashboard stays in sync. Reads fresh store state
  // so fast typing across cells never loses an edit.
  const setCell = (studentId: string, number: number, raw: string) => {
    const value = raw.trim() === "" ? null : parseDecimal(raw);
    if (value !== null && !Number.isFinite(value)) return;
    const store = useApp.getState();
    const restQM = store.questionMarks.filter(
      (m) => !(m.assessmentId === assessment.id && m.studentId === studentId && m.number === number),
    );
    const nextQM: QuestionMark[] =
      value === null ? restQM : [...restQM, { assessmentId: assessment.id, studentId, number, mark: value }];
    void store.setQuestionMarks(nextQM);

    // Recompute this student's assessment total from their entered questions.
    const mine = nextQM.filter((m) => m.assessmentId === assessment.id && m.studentId === studentId && m.mark != null);
    const total = mine.reduce((s, m) => s + (m.mark as number), 0);
    const existing = store.marks.find((m) => m.assessmentId === assessment.id && m.studentId === studentId);
    const restMarks = store.marks.filter((m) => !(m.assessmentId === assessment.id && m.studentId === studentId));
    const nextMarks: Mark[] =
      mine.length === 0
        ? restMarks
        : [...restMarks, { assessmentId: assessment.id, studentId, mark: total, comment: existing?.comment ?? "" }];
    void store.setMarks(nextMarks);
  };

  const focusCell = (r: number, c: number) => cells.current[r]?.[c]?.focus();
  const nRows = sorted.length;
  const nCols = questions.length;
  const moveAcross = (r: number, c: number, back = false) => {
    if (back) {
      if (c > 0) focusCell(r, c - 1);
      else if (r > 0) focusCell(r - 1, nCols - 1);
    } else if (c < nCols - 1) focusCell(r, c + 1);
    else if (r < nRows - 1) focusCell(r + 1, 0);
  };
  const moveDown = (r: number, c: number, back = false) => focusCell(Math.min(Math.max(r + (back ? -1 : 1), 0), nRows - 1), c);

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const enterAcross = userPrefs.markGridEnter === "across";
    if (e.key === "Enter") {
      e.preventDefault();
      enterAcross ? moveAcross(r, c, e.shiftKey) : moveDown(r, c, e.shiftKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
      enterAcross ? moveDown(r, c, e.shiftKey) : moveAcross(r, c, e.shiftKey);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveDown(r, c);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveDown(r, c, true);
    } else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) {
      e.preventDefault();
      moveAcross(r, c);
    } else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      moveAcross(r, c, true);
    }
  };

  // Live stats from the current store state.
  const studentIds = sorted.map((s) => s.id);
  const ranks = rankStudents(studentIds, questions, qm, qIdx);
  const rankTint = rankTints(ranks);
  const qAvg = questionAverages(questions, qm, qIdx);
  const completion = gridCompletion(studentIds, questions, qm, qIdx);
  const provisionals = new Map(sorted.map((s) => [s.id, studentProvisional(s.id, questions, qm, qIdx)]));
  const classMean = (() => {
    const pcts = [...provisionals.values()].filter((p) => p.answered > 0 && p.pct !== null).map((p) => p.pct as number);
    return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  })();
  const topStudent = (() => {
    let best: { name: string; pct: number } | null = null;
    for (const s of sorted) {
      if (ranks.get(s.id) === 1) {
        const p = provisionals.get(s.id);
        if (p?.pct != null) best = { name: studentName(s), pct: Math.round(p.pct) };
      }
    }
    return best;
  })();

  if (nCols === 0) {
    return (
      <div>
        <div className="view-header">
          <div className="spacer" />
          <button className="primary" onClick={onEditQuestions}>
            Set up questions
          </button>
        </div>
        <p className="muted">This test has no questions defined yet.</p>
      </div>
    );
  }

  return (
    <div className="marking-view">
      {readOnly ? (
        <div className="view-header">
          <div className="spacer" />
          <MarkSheetTools assessment={assessment} onImported={onImported} />
          <button className="small" onClick={onEnterMarks}>
            <Icon name="edit" size={18} /> Enter marks
          </button>
        </div>
      ) : (
        <div className="view-header">
          <div className="spacer" />
          <CalculatorButton shown={calculator} onToggle={() => setCalculator(!calculator)} />
          <MarkSheetTools assessment={assessment} onImported={onImported} />
          <button className="small" onClick={onEditQuestions}>
            <Icon name="edit" size={18} /> Edit questions
          </button>
          <button className="primary" onClick={onDone}>
            <Icon name="check" size={18} /> Done
          </button>
        </div>
      )}

      <div className="stat-tiles compact">
        <StatTile value={`${Math.round((1 - completion) * 100)}%`} label="left to enter" />
        <StatTile value={classMean !== null ? `${classMean}%` : "—"} label="class mean (entered)" />
        <StatTile value={topStudent ? `${topStudent.pct}%` : "—"} label={topStudent ? `top: ${topStudent.name}` : "top of class"} />
      </div>

      <div className="marking-body">
        <div className="mark-grid-wrap">
          <table className={`mark-grid ${readOnly ? "read-only" : ""}`}>
            <thead>
              <tr>
                <th className="col-no sticky-left">No</th>
                <th className="col-name sticky-left second">Surname</th>
                <th className="col-name sticky-left third">Name</th>
                {questions.map((q) => (
                  <th key={q.number} className="col-q" title={`${q.topic || "—"}${q.cognitiveLevel ? ` · ${q.cognitiveLevel}` : ""}`}>
                    Q{q.number}
                    <div className="q-sub">/{q.marks}</div>
                  </th>
                ))}
                <th className="col-total sticky-right fourth">Total</th>
                <th className="col-total sticky-right third">%</th>
                <th className="col-total sticky-right second" title={`${scaleInfo.label}: ${scaleInfo.key}`}>
                  {scaleInfo.short}
                </th>
                <th className="col-total sticky-right">Rank</th>
              </tr>
              <tr className="topic-row">
                <th className="sticky-left" colSpan={3}>
                  Topic
                </th>
                {questions.map((q) => (
                  <th key={q.number} className="col-q" title={q.topic}>
                    {shortLabel(topics, grade, q.topic)}
                  </th>
                ))}
                <th className="sticky-right fourth"></th>
                <th className="sticky-right third"></th>
                <th className="sticky-right second"></th>
                <th className="sticky-right"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, r) => {
                const p = provisionals.get(s.id)!;
                const rank = ranks.get(s.id);
                // Every question has a mark: the row greys out while marking (the one being typed in is yellow, see styles.css).
                const done = !readOnly && questions.length > 0 && questions.every((q) => markOf(s.id, q.number) != null);
                return (
                  <tr key={s.id} className={done ? "done" : undefined}>
                    <td className="col-no sticky-left">{r + 1}</td>
                    {/* The tint shows how far down the list this student is. */}
                    <td className="col-name sticky-left second" style={{ background: positionTint(r, nRows) }}>
                      {s.lastName}
                    </td>
                    <td className="col-name sticky-left third">{s.firstName}</td>
                    {questions.map((q, c) => {
                      const v = markOf(s.id, q.number);
                      const over = v != null && v > q.marks;
                      if (readOnly) {
                        return (
                          <td key={q.number} className="col-q">
                            {v != null ? fmtDecimal(v) : ""}
                          </td>
                        );
                      }
                      return (
                        <td key={q.number} className="col-q">
                          <input
                            ref={(el) => {
                              (cells.current[r] ??= [])[c] = el;
                            }}
                            className={`grid-input ${over ? "over" : ""}`}
                            aria-label={`Q${q.number} for ${studentName(s)}`}
                            inputMode="decimal"
                            autoFocus={r === 0 && c === 0}
                            defaultValue={v != null ? fmtDecimal(v) : ""}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const fixed = clampCell(e.target.value, q.marks);
                              if (fixed !== e.target.value) e.target.value = fixed;
                              setCell(s.id, q.number, fixed);
                            }}
                            onKeyDown={(e) => onKey(e, r, c)}
                          />
                        </td>
                      );
                    })}
                    <td className="col-total sticky-right fourth">{p.answered ? fmtDecimal(p.total) : ""}</td>
                    <td className="col-total sticky-right third">{p.pct !== null ? `${Math.round(p.pct)}` : ""}</td>
                    <td className="col-total sticky-right second">{p.answered ? gradeForPct(p.pct, scale) : ""}</td>
                    {/* Tinted by rank: green for the top student to red for the lowest. */}
                    <td className="col-total sticky-right" style={rank != null ? { background: rankTint.get(s.id) } : undefined}>
                      {rank ?? ""}
                    </td>
                  </tr>
                );
              })}
              {nRows === 0 && (
                <tr>
                  <td colSpan={nCols + 7} className="empty-row start">
                    Add students to the class first.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="avg-row">
                <th className="sticky-left" colSpan={3}>
                  Average (mark)
                </th>
                {qAvg.map((a) => (
                  <td key={a.number} className="col-q">
                    {a.meanMark !== null ? fmtDecimal(a.meanMark, 1) : ""}
                  </td>
                ))}
                <td className="sticky-right fourth"></td>
                <td className="sticky-right third"></td>
                <td className="sticky-right second"></td>
                <td className="sticky-right"></td>
              </tr>
              <tr className="avg-row">
                <th className="sticky-left" colSpan={3}>
                  Average (%)
                </th>
                {qAvg.map((a) => (
                  <td key={a.number} className="col-q">
                    {a.meanPct !== null ? Math.round(a.meanPct) : ""}
                  </td>
                ))}
                <td className="sticky-right fourth"></td>
                <td className="sticky-right third">{classMean ?? ""}</td>
                <td className="sticky-right second">{classMean !== null ? gradeForPct(classMean, scale) : ""}</td>
                <td className="sticky-right"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {showCalculator && <MarkCalculator onClose={() => setCalculator(false)} />}
      </div>
    </div>
  );
}
