import { useCallback, useMemo } from "react";
import { sortByName } from "../../lib/types";
import { useExamWeight, useAppPick } from "../../store/appStore";
import { today } from "../../lib/id";
import { ClassData } from "../../lib/insights";
import PrivacyGate from "../PrivacyGate";
import ReportPreview from "./ReportPreview";
import EmptyState from "../EmptyState";

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
  } = useAppPick(
    "currentClass",
    "students",
    "attendance",
    "behaviourEvents",
    "bathroomVisits",
    "assessments",
    "marks",
    "assessmentQuestions",
    "questionMarks",
    "behaviourCodes",
    "userPrefs",
    "sensitiveRevealed",
    "setView",
  );
  const examWeight = useExamWeight();
  const data: ClassData = useMemo(
    () => ({ students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes, examWeight }),
    [students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes, examWeight],
  );
  const ids = useMemo(
    () => sortByName(students).map((s) => s.id),
    [students],
  );
  const goHome = useCallback(() => setView("home"), [setView]);
  const revealed = !userPrefs.privacyMode || sensitiveRevealed;

  return (
    <div>
      {!currentClass ? (
        <EmptyState icon="print" title="No class selected">
          Pick a class from the menu at the top right to print its parent reports.
        </EmptyState>
      ) : (
        <PrivacyGate label="marks, behaviour and attendance reports">
          {revealed && <ReportPreview standalone studentIds={ids} data={data} initialFrom="" today={today()} onClose={goHome} />}
        </PrivacyGate>
      )}
    </div>
  );
}
