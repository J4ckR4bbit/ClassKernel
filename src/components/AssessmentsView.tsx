import { type KeyboardEvent as ReactKeyboardEvent, useMemo, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { newId, today } from "../lib/id";
import { Assessment, AssessmentQuestion, Mark, QuestionMark, studentName } from "../lib/types";
import { GRADE_SCALES, assessmentStats, gradeForPct, gridCompletion, questionAverages, rankStudents, studentProvisional } from "../lib/stats";
import { areasForGrade, shortLabel, subtopicsForGrade } from "../lib/topics";
import PrivacyGate from "./PrivacyGate";
import Icon from "./Icon";

export default function AssessmentsView() {
  const { currentClass, classes, students, assessments, setAssessments, marks, setMarks, assessmentQuestions, setAssessmentQuestions, questionMarks, setQuestionMarks, showToast, confirmDialog } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);

  const grade = classes.find((c) => c.name === currentClass)?.year ?? "";
  const marking = assessments.find((a) => a.id === markingId) ?? null;
  const setup = assessments.find((a) => a.id === setupId) ?? null;
  const ordered = [...assessments].sort((a, b) => b.date.localeCompare(a.date));

  const questionsFor = (id: string) =>
    assessmentQuestions.filter((q) => q.assessmentId === id).sort((a, b) => a.number - b.number);

  const deleteAssessment = async (a: Assessment) => {
    const ok = await confirmDialog({
      title: `Delete "${a.title}"?`,
      body: "The assessment and every mark entered for it are deleted.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    void setAssessments(assessments.filter((x) => x.id !== a.id));
    void setMarks(marks.filter((m) => m.assessmentId !== a.id));
    void setAssessmentQuestions(assessmentQuestions.filter((q) => q.assessmentId !== a.id));
    void setQuestionMarks(questionMarks.filter((m) => m.assessmentId !== a.id));
  };

  // Open the marking screen for an assessment: the per-question grid for
  // multi-question tests (defining questions first if none exist yet), or the
  // single-mark quick-marking list otherwise.
  const enterMarks = (a: Assessment) => {
    if (a.questionCount > 1 && questionsFor(a.id).length === 0) setSetupId(a.id);
    else setMarkingId(a.id);
  };

  if (setup) {
    return <QuestionSetup assessment={setup} grade={grade} onBack={() => setSetupId(null)} onStart={() => { setSetupId(null); setMarkingId(setup.id); }} />;
  }

  if (marking) {
    const done = () => { setMarkingId(null); showToast("Marks saved"); };
    return (
      <PrivacyGate label="marks and rankings">
        {marking.questionCount > 1 ? (
          <QuestionGrid assessment={marking} grade={grade} onDone={done} onEditQuestions={() => { setMarkingId(null); setSetupId(marking.id); }} />
        ) : (
          <QuickMarking assessment={marking} onDone={done} />
        )}
      </PrivacyGate>
    );
  }

  return (
    <div>
      <div className="view-header">
        <div className="spacer" />
        <button className="primary" onClick={() => setShowNew(true)}>
          <Icon name="add" size={20} /> New assessment
        </button>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>Title</th>
            <th style={{ width: 110 }}>Date</th>
            <th style={{ width: 110 }}>Content area</th>
            <th style={{ width: 90 }}>Out of</th>
            <th style={{ width: 90 }}>Questions</th>
            <th style={{ width: 110 }}>Marked</th>
            <th style={{ width: 100 }}>Class mean</th>
            <th style={{ width: 230 }}></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((a) => {
            const stats = assessmentStats(a, marks);
            return (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.date}</td>
                <td>{a.contentArea || <span className="muted">—</span>}</td>
                <td>{a.totalMarks}</td>
                <td>{a.questionCount > 1 ? a.questionCount : <span className="muted">1</span>}</td>
                <td>
                  {stats.entered}/{students.length}
                </td>
                <td>{stats.mean !== null ? `${Math.round(stats.mean)}%` : <span className="muted">—</span>}</td>
                <td>
                  <div className="row nowrap">
                    <button className="small primary" onClick={() => enterMarks(a)}>
                      <Icon name="edit" size={18} /> Enter marks
                    </button>
                    {a.questionCount > 1 && (
                      <button className="small" onClick={() => setSetupId(a.id)}>
                        Questions
                      </button>
                    )}
                    <button className="icon-only small danger" onClick={() => void deleteAssessment(a)} title="Delete assessment">
                      <Icon name="close" size={18} />
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
          grade={grade}
          onClose={() => setShowNew(false)}
          onCreate={(a) => {
            void setAssessments([...assessments, a]);
            setShowNew(false);
            if (a.questionCount > 1) setSetupId(a.id);
            else setMarkingId(a.id);
          }}
        />
      )}
    </div>
  );
}

function NewAssessmentModal({ grade, onClose, onCreate }: { grade: string; onClose: () => void; onCreate: (a: Assessment) => void }) {
  const { topics } = useApp();
  const areas = useMemo(() => areasForGrade(topics, grade), [topics, grade]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [totalMarks, setTotalMarks] = useState("100");
  const [questions, setQuestions] = useState("1");
  const [contentArea, setContentArea] = useState("");
  const [category, setCategory] = useState("Test");

  const qCount = Math.max(1, Math.floor(Number(questions) || 1));
  const single = qCount === 1;
  const valid = title.trim() && (!single || Number(totalMarks) > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New assessment</h2>
        <div className="form-grid">
          <label>Title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Phys Test 1" />
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label>Content area</label>
          <select value={contentArea} onChange={(e) => setContentArea(e.target.value)}>
            <option value="">— none / mixed —</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label>Number of questions</label>
          <input type="number" min={1} value={questions} onChange={(e) => setQuestions(e.target.value)} />
          {single && (
            <>
              <label>Out of</label>
              <input type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
            </>
          )}
          <label>Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Test / Quiz / Homework / Exam" />
        </div>
        {!single && (
          <p className="muted" style={{ margin: "0 0 4px" }}>
            You'll set each question's topic and marks next; the total is added up from those.
          </p>
        )}
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
                totalMarks: single ? Number(totalMarks) : 0,
                category: category.trim(),
                questionCount: qCount,
                contentArea,
              })
            }
          >
            {single ? "Create & mark" : "Set up questions"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface QRow {
  topic: string;
  marks: string;
  cognitiveLevel: string;
}

/**
 * Clamp a typed grid cell to [0, max], mirroring the reference app: over-max or
 * negative entries are silently corrected rather than flagged. In-range text is
 * returned untouched so part-typed values (e.g. "1.") aren't disturbed.
 */
function clampCell(raw: string, max: number): string {
  const t = raw.trim();
  if (t === "") return "";
  const n = Number(t);
  if (!Number.isFinite(n)) return raw;
  if (n > max) return String(max);
  if (n < 0) return "0";
  return raw;
}

/**
 * Define the questions of a multi-question test: each question's topic (from the
 * grade's topic bank, filtered to the test's content area), marks and cognitive
 * level. Saving writes the question list and sets the test's total to their sum.
 */
function QuestionSetup({ assessment, grade, onBack, onStart }: { assessment: Assessment; grade: string; onBack: () => void; onStart: () => void }) {
  const { topics, cognitiveLevels, assessmentQuestions, setAssessmentQuestions, assessments, setAssessments } = useApp();
  const existing = useMemo(
    () => assessmentQuestions.filter((q) => q.assessmentId === assessment.id).sort((a, b) => a.number - b.number),
    [assessmentQuestions, assessment.id],
  );
  const subtopics = useMemo(
    () => subtopicsForGrade(topics, grade, assessment.contentArea || undefined),
    [topics, grade, assessment.contentArea],
  );

  const [rows, setRows] = useState<QRow[]>(() =>
    existing.length
      ? existing.map((q) => ({ topic: q.topic, marks: String(q.marks), cognitiveLevel: q.cognitiveLevel }))
      : Array.from({ length: assessment.questionCount }, () => ({ topic: "", marks: "", cognitiveLevel: cognitiveLevels[0]?.code ?? "" })),
  );

  const update = (i: number, patch: Partial<QRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, { topic: "", marks: "", cognitiveLevel: cognitiveLevels[0]?.code ?? "" }]);
  const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i));

  const total = rows.reduce((s, r) => s + (Number(r.marks) || 0), 0);
  const valid = rows.length > 0 && rows.every((r) => Number(r.marks) > 0);

  const save = () => {
    const questions: AssessmentQuestion[] = rows.map((r, i) => ({
      assessmentId: assessment.id,
      number: i + 1,
      topic: r.topic,
      marks: Number(r.marks) || 0,
      cognitiveLevel: r.cognitiveLevel,
    }));
    void setAssessmentQuestions([...assessmentQuestions.filter((q) => q.assessmentId !== assessment.id), ...questions]);
    void setAssessments(assessments.map((a) => (a.id === assessment.id ? { ...a, totalMarks: total, questionCount: questions.length } : a)));
    onStart();
  };

  return (
    <div>
      <div className="view-header">
        <button className="small" onClick={onBack}>
          <Icon name="arrow_back" size={18} /> Back
        </button>
        <h1>
          {assessment.title} <span className="muted">— questions</span>
        </h1>
        <div className="spacer" />
        <span className="muted">Total: {total} marks</span>
      </div>

      {subtopics.length === 0 && (
        <p className="muted">
          No topics defined for {grade ? `grade ${grade}` : "this grade"}
          {assessment.contentArea ? ` in ${assessment.contentArea}` : ""} yet — add them under Settings › Assessments, or type a topic below.
        </p>
      )}

      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 50 }}>Q</th>
            <th>Topic</th>
            <th style={{ width: 110 }}>Marks</th>
            <th style={{ width: 170 }}>Cognitive level</th>
            <th style={{ width: 50 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <b>{i + 1}</b>
              </td>
              <td>
                <input
                  list={`topics-${assessment.id}`}
                  value={r.topic}
                  onChange={(e) => update(i, { topic: e.target.value })}
                  placeholder="topic"
                />
              </td>
              <td>
                <input type="number" min={0} style={{ width: 70 }} value={r.marks} onChange={(e) => update(i, { marks: e.target.value })} />
              </td>
              <td>
                <select value={r.cognitiveLevel} onChange={(e) => update(i, { cognitiveLevel: e.target.value })}>
                  <option value="">—</option>
                  {cognitiveLevels.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.code} — {l.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="icon-only small danger"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                  title="Remove question"
                >
                  <Icon name="close" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id={`topics-${assessment.id}`}>
        {subtopics.map((s) => (
          <option key={`${s.area}:${s.subtopic}`} value={s.subtopic}>
            {assessment.contentArea ? s.subtopic : `${s.area} · ${s.subtopic}`}
          </option>
        ))}
      </datalist>

      <div className="row" style={{ marginTop: 10 }}>
        <button onClick={addRow}>
          <Icon name="add" size={20} /> Add question
        </button>
        <div className="spacer" />
        <button className="primary" disabled={!valid} onClick={save}>
          Start marking <Icon name="chevron_right" size={20} />
        </button>
      </div>
    </div>
  );
}

/**
 * The spreadsheet-style marking grid for a multi-question test. Frozen name
 * columns on the left and total/percentage/rank on the right; a Marks (out-of)
 * row and a topic row in the header; live per-question and per-student stats.
 */
function QuestionGrid({ assessment, grade, onDone, onEditQuestions }: { assessment: Assessment; grade: string; onDone: () => void; onEditQuestions: () => void }) {
  const { students, questionMarks, topics, userPrefs, assessmentQuestions } = useApp();
  const scale = userPrefs.gradeScale;
  const scaleInfo = GRADE_SCALES[scale];
  const questions = useMemo(
    () => assessmentQuestions.filter((q) => q.assessmentId === assessment.id).sort((a, b) => a.number - b.number),
    [assessmentQuestions, assessment.id],
  );
  const sorted = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [students],
  );
  const cells = useRef<Array<Array<HTMLInputElement | null>>>([]);

  const qm = questionMarks.filter((m) => m.assessmentId === assessment.id);
  const markOf = (studentId: string, number: number) =>
    qm.find((m) => m.studentId === studentId && m.number === number)?.mark ?? null;

  // Write a single cell: update per-question marks and recompute that student's
  // total into marks.csv so the dashboard stays in sync. Reads fresh store state
  // so fast typing across cells never loses an edit.
  const setCell = (studentId: string, number: number, raw: string) => {
    const value = raw.trim() === "" ? null : Number(raw);
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
  const ranks = rankStudents(studentIds, questions, qm);
  const qAvg = questionAverages(questions, qm);
  const completion = gridCompletion(studentIds, questions, qm);
  const provisionals = new Map(sorted.map((s) => [s.id, studentProvisional(s.id, questions, qm)]));
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
          <h1>{assessment.title}</h1>
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
    <div>
      <div className="view-header">
        <h1>
          Marking: {assessment.title} <span className="muted">(out of {assessment.totalMarks})</span>
        </h1>
        <div className="spacer" />
        <button className="small" onClick={onEditQuestions}>
          <Icon name="edit" size={18} /> Edit questions
        </button>
        <button className="primary" onClick={onDone}>
          <Icon name="check" size={18} /> Done
        </button>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="value">{Math.round((1 - completion) * 100)}%</div>
          <div className="label">left to enter</div>
        </div>
        <div className="stat-tile">
          <div className="value">{classMean !== null ? `${classMean}%` : "—"}</div>
          <div className="label">class mean (entered)</div>
        </div>
        <div className="stat-tile">
          <div className="value">{topStudent ? `${topStudent.pct}%` : "—"}</div>
          <div className="label">{topStudent ? `top: ${topStudent.name}` : "top of class"}</div>
        </div>
      </div>

      <div className="mark-grid-wrap">
        <table className="mark-grid">
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
              // Every question has a mark: the row greys out (the one being typed in is yellow, see styles.css).
              const done = questions.length > 0 && questions.every((q) => markOf(s.id, q.number) != null);
              return (
                <tr key={s.id} className={done ? "done" : undefined}>
                  <td className="col-no sticky-left">{r + 1}</td>
                  <td className="col-name sticky-left second">{s.lastName}</td>
                  <td className="col-name sticky-left third">{s.firstName}</td>
                  {questions.map((q, c) => {
                    const v = markOf(s.id, q.number);
                    const over = v != null && v > q.marks;
                    return (
                      <td key={q.number} className="col-q">
                        <input
                          ref={(el) => {
                            (cells.current[r] ??= [])[c] = el;
                          }}
                          className={`grid-input ${over ? "over" : ""}`}
                          inputMode="decimal"
                          autoFocus={r === 0 && c === 0}
                          defaultValue={v ?? ""}
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
                  <td className="col-total sticky-right fourth">{p.answered ? p.total : ""}</td>
                  <td className="col-total sticky-right third">{p.pct !== null ? `${Math.round(p.pct)}` : ""}</td>
                  <td className="col-total sticky-right second">{p.answered ? gradeForPct(p.pct, scale) : ""}</td>
                  <td className="col-total sticky-right">{rank ?? ""}</td>
                </tr>
              );
            })}
            {nRows === 0 && (
              <tr>
                <td colSpan={nCols + 7} className="muted" style={{ padding: 16 }}>
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
                  {a.meanMark !== null ? Math.round(a.meanMark * 10) / 10 : ""}
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
      <p className="muted">
        <b>{scaleInfo.short}</b> is the {scale === "level" ? "SA achievement level" : "symbol"}: {scaleInfo.key}. Switch
        between levels and symbols under Settings › Assessments.
      </p>
      <p className="muted">
        {userPrefs.markGridEnter === "across"
          ? "Enter moves across the questions; Tab moves down to the next student."
          : "Enter moves down to the next student; Tab moves across the questions."}{" "}
        Leave a cell blank for a question not answered. Change this under Settings › Assessments.
      </p>
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
          <Icon name="check" size={18} /> Done
        </button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {sorted.map((s, i) => {
          const m = markOf(s.id);
          const pct = m?.mark != null && assessment.totalMarks > 0 ? Math.round((m.mark / assessment.totalMarks) * 100) : null;
          const over = m?.mark != null && m.mark > assessment.totalMarks;
          return (
            <div key={s.id} className={`quick-mark-row ${m?.mark != null ? "done" : ""}`}>
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
