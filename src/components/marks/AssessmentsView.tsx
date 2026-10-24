import { useState } from "react";
import { useExamWeight, useAppPick } from "../../store/appStore";
import { Assessment, AssessmentKind } from "../../lib/types";
import { assessmentStats, taskShares } from "../../lib/stats";
import { fmtDecimal, shortDate } from "../../lib/format";
import { topicGrade } from "../../lib/topics";
import PrivacyGate from "../PrivacyGate";
import Icon from "../Icon";
import { useSubPage } from "../../store/subPage";
import Markbook from "./Markbook";
import NewAssessmentModal from "./NewAssessmentModal";
import QuestionSetup from "./QuestionSetup";
import QuestionGrid from "./QuestionGrid";
import QuickMarking from "./QuickMarking";
import MarkListView from "./MarkListView";
import WeightInput from "./WeightInput";

export default function AssessmentsView() {
  const {
    currentClass,
    classes,
    students,
    assessments,
    setAssessments,
    marks,
    setMarks,
    assessmentQuestions,
    setAssessmentQuestions,
    questionMarks,
    setQuestionMarks,
    showToast,
    confirmDialog,
    userPrefs,
  } = useAppPick(
    "currentClass",
    "classes",
    "students",
    "assessments",
    "setAssessments",
    "marks",
    "setMarks",
    "assessmentQuestions",
    "setAssessmentQuestions",
    "questionMarks",
    "setQuestionMarks",
    "showToast",
    "confirmDialog",
    "userPrefs",
  );
  const [showNew, setShowNew] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showMarkbook, setShowMarkbook] = useState(false);
  // Bumped by an import so the marking screens re-read their (uncontrolled) inputs.
  const [sheetVersion, setSheetVersion] = useState(0);
  const imported = () => setSheetVersion((v) => v + 1);

  // The grade whose topic list this class tags questions from (its own, or one it shares).
  const grade = topicGrade(userPrefs.topicLinks, classes.find((c) => c.name === currentClass)?.year ?? "");
  const marking = assessments.find((a) => a.id === markingId) ?? null;
  const setup = assessments.find((a) => a.id === setupId) ?? null;
  const viewing = assessments.find((a) => a.id === viewingId) ?? null;
  const ordered = [...assessments].sort((a, b) => b.date.localeCompare(a.date));
  const shares = taskShares(assessments, useExamWeight());
  const update = (a: Assessment, patch: Partial<Assessment>) =>
    void setAssessments(assessments.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));

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

  const done = () => { setMarkingId(null); showToast("Marks saved"); };

  // Whichever screen is open within Marks is named in the top bar, with its Back.
  const outOf = (a: Assessment) => `out of ${fmtDecimal(a.totalMarks, 1)}`;
  const [subTitle, subDetail, subBack]: [string | null, string | undefined, () => void] = setup
    ? [setup.title, "questions", () => setSetupId(null)]
    : marking
      ? [`Marking: ${marking.title}`, outOf(marking), done]
      : viewing
        ? [viewing.title, outOf(viewing), () => setViewingId(null)]
        : showMarkbook
          ? ["Markbook", undefined, () => setShowMarkbook(false)]
          : [null, undefined, () => {}];
  useSubPage(subTitle, subBack, subDetail);

  if (setup) {
    return <QuestionSetup assessment={setup} grade={grade} onStart={() => { setSetupId(null); setMarkingId(setup.id); }} />;
  }

  if (marking) {
    return (
      <PrivacyGate label="marks and rankings">
        {marking.questionCount > 1 ? (
          <QuestionGrid
            key={sheetVersion}
            assessment={marking}
            grade={grade}
            onDone={done}
            onEditQuestions={() => { setMarkingId(null); setSetupId(marking.id); }}
            onImported={imported}
          />
        ) : (
          <QuickMarking key={sheetVersion} assessment={marking} onDone={done} onImported={imported} />
        )}
      </PrivacyGate>
    );
  }

  // Read-only pages: one test's marks, or every test in the markbook. Marking a
  // test opened from here comes back here when done (marking is checked first).
  if (viewing) {
    return (
      <PrivacyGate label="marks and rankings">
        {viewing.questionCount > 1 ? (
          <QuestionGrid
            assessment={viewing}
            grade={grade}
            readOnly
            onEditQuestions={() => setSetupId(viewing.id)}
            onEnterMarks={() => enterMarks(viewing)}
            onImported={imported}
          />
        ) : (
          <MarkListView assessment={viewing} onEnterMarks={() => enterMarks(viewing)} onImported={imported} />
        )}
      </PrivacyGate>
    );
  }

  if (showMarkbook) {
    return (
      <PrivacyGate label="marks and rankings">
        <Markbook onOpen={(a) => setViewingId(a.id)} />
      </PrivacyGate>
    );
  }

  return (
    <div>
      <div className="view-header">
        <div className="spacer" />
        <button onClick={() => setShowMarkbook(true)} disabled={assessments.length === 0}>
          <Icon name="grid_on" size={20} /> Markbook
        </button>
        <button className="primary" onClick={() => setShowNew(true)}>
          <Icon name="add" size={20} /> New assessment
        </button>
      </div>

      <div className="table-scroll">
        <table className="data marks-list">
          <thead>
            <tr>
              <th>Title</th>
              <th style={{ width: 100 }}>Date</th>
              <th style={{ width: 100 }}>Content area</th>
              <th style={{ width: 64 }}>Out of</th>
              <th style={{ width: 80 }}>Questions</th>
              <th style={{ width: 140 }}>Counts as</th>
              <th style={{ width: 120 }} title="Its weight among tasks of the same kind (1 = normal, 2 = counts double, 0 = doesn't count), and the share of the final mark that gives it">
                Weight · share
              </th>
              <th style={{ width: 80 }}>Marked</th>
              <th style={{ width: 90 }}>Class mean</th>
              <th></th>
              <th style={{ width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((a) => {
              const stats = assessmentStats(a, marks);
              return (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td className="nowrap" title={a.date}>
                    {shortDate(a.date)}
                  </td>
                  <td>{a.contentArea || <span className="muted">—</span>}</td>
                  <td className="nowrap">{a.totalMarks}</td>
                  <td>
                    {a.questionCount > 1 ? (
                      <button className="small" onClick={() => setSetupId(a.id)} title="Set up the questions: topics and marks">
                        {a.questionCount} <Icon name="edit" size={16} />
                      </button>
                    ) : (
                      <span className="muted">1</span>
                    )}
                  </td>
                  <td>
                    <select value={a.kind} onChange={(e) => update(a, { kind: e.target.value as AssessmentKind })} aria-label="Counts as">
                      <option value="informal">Informal</option>
                      <option value="exam">Examination</option>
                    </select>
                  </td>
                  <td>
                    <div className="row nowrap">
                      <WeightInput value={a.weight} onChange={(weight) => update(a, { weight })} />
                      <span className="muted">{fmtDecimal(shares.get(a.id) ?? 0, 1)}%</span>
                    </div>
                  </td>
                  <td className="nowrap">
                    {stats.entered}/{students.length}
                  </td>
                  <td className="nowrap">{stats.mean !== null ? `${Math.round(stats.mean)}%` : <span className="muted">—</span>}</td>
                  <td>
                    <div className="row nowrap">
                      <button className="small" onClick={() => setViewingId(a.id)} title="See the marks without changing them">
                        <Icon name="visibility" size={18} /> View
                      </button>
                      <button className="small primary" onClick={() => enterMarks(a)}>
                        <Icon name="edit" size={18} /> Enter marks
                      </button>
                    </div>
                  </td>
                  <td>
                    <button className="icon-only small danger" onClick={() => void deleteAssessment(a)} title="Delete assessment">
                      <Icon name="close" size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {assessments.length === 0 && (
              <tr>
                <td colSpan={11} className="empty-row">
                  No assessments yet — create one, then use the quick-marking tool while you mark.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
