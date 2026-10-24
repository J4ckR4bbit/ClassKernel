import { useMemo, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { Assessment, AssessmentQuestion } from "../../lib/types";
import { subtopicsForGrade } from "../../lib/topics";
import Icon from "../Icon";

interface QRow {
  topic: string;
  marks: string;
  cognitiveLevel: string;
}

/**
 * Define the questions of a multi-question test: each question's topic (from the
 * grade's topic bank, filtered to the test's content area), marks and cognitive
 * level. Saving writes the question list and sets the test's total to their sum.
 */
export default function QuestionSetup({ assessment, grade, onStart }: { assessment: Assessment; grade: string; onStart: () => void }) {
  const {
    topics,
    cognitiveLevels,
    assessmentQuestions,
    setAssessmentQuestions,
    assessments,
    setAssessments,
  } = useAppPick(
    "topics",
    "cognitiveLevels",
    "assessmentQuestions",
    "setAssessmentQuestions",
    "assessments",
    "setAssessments",
  );
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

      <div className="row button-row">
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
