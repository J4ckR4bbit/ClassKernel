import { useMemo, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { newId, today } from "../../lib/id";
import { Assessment, AssessmentKind, defaultKind } from "../../lib/types";
import { parseDecimal } from "../../lib/format";
import { areasForGrade } from "../../lib/topics";
import Modal from "../Modal";

export default function NewAssessmentModal({ grade, onClose, onCreate }: { grade: string; onClose: () => void; onCreate: (a: Assessment) => void }) {
  const { topics } = useAppPick("topics");
  const areas = useMemo(() => areasForGrade(topics, grade), [topics, grade]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [totalMarks, setTotalMarks] = useState("100");
  const [questions, setQuestions] = useState("1");
  const [contentArea, setContentArea] = useState("");
  const [category, setCategory] = useState("Test");
  // Follows the category ("Exam" → Examination) until chosen by hand.
  const [kindChoice, setKindChoice] = useState<AssessmentKind | null>(null);
  const kind = kindChoice ?? defaultKind(category);
  const [weight, setWeight] = useState("1");

  const qCount = Math.max(1, Math.floor(Number(questions) || 1));
  const single = qCount === 1;
  const weightValue = parseDecimal(weight);
  const valid = title.trim() && (!single || parseDecimal(totalMarks) > 0) && weightValue >= 0;

  return (
    <Modal title="New assessment" onClose={onClose}>
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
            <input inputMode="decimal" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
          </>
        )}
        <label>Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Test / Quiz / Homework / Exam" />
        <label>Counts as</label>
        <select value={kind} onChange={(e) => setKindChoice(e.target.value as AssessmentKind)}>
          <option value="informal">Informal task</option>
          <option value="exam">Examination</option>
        </select>
        <label>Weight</label>
        <input
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          title="Among tasks of the same kind: 1 = normal, 2 = counts double, 0 = doesn't count"
        />
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
              totalMarks: single ? parseDecimal(totalMarks) : 0,
              category: category.trim(),
              questionCount: qCount,
              contentArea,
              kind,
              weight: weightValue,
            })
          }
        >
          {single ? "Create & mark" : "Set up questions"}
        </button>
      </div>
    </Modal>
  );
}
