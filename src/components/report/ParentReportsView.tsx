import { useCallback, useMemo } from "react";
import { useApp } from "../../store/appStore";
import { today } from "../../lib/id";
import { ClassData } from "../../lib/insights";
import PrivacyGate from "../PrivacyGate";
import ReportPreview from "./ReportPreview";

/**
 * The Parent reports tool: once the privacy cover is lifted, the full-screen
 * print preview for the open class, with the whole class or one student.
 */
export default function ParentReportsView() {
  const {
    currentClass,
    students,
    attendance,
    behaviourEvents,
    bathroomVisits,
    assessments,
    marks,
    assessmentQuestions,
    questionMarks,
    behaviourCodes,
    userPrefs,
    sensitiveRevealed,
    setView,
  } = useApp();
  const data: ClassData = useMemo(
    () => ({ students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes }),
    [students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes],
  );
  const ids = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)).map((s) => s.id),
    [students],
  );
  const goHome = useCallback(() => setView("home"), [setView]);
  const revealed = !userPrefs.privacyMode || sensitiveRevealed;

  return (
    <div>
      {!currentClass ? (
        <div className="panel muted">Pick a class from the menu at the top right to print its parent reports.</div>
      ) : (
        <PrivacyGate label="marks, behaviour and attendance reports">
          {revealed && <ReportPreview standalone studentIds={ids} data={data} initialFrom="" today={today()} onClose={goHome} />}
        </PrivacyGate>
      )}
    </div>
  );
}
