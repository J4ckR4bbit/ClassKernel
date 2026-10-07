import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { today } from "../lib/id";
import { studentName } from "../lib/types";
import {
  ClassData,
  PERIODS,
  Period,
  classProfile,
  classSummary,
  filterToPeriod,
  previousPeriod,
  studentProfile,
  studentSummary,
} from "../lib/insights";
import ClassDashboard from "./dashboard/ClassDashboard";
import StudentDashboard from "./dashboard/StudentDashboard";
import PrivacyGate from "./PrivacyGate";

const PERIOD_KEY = "classkernel.dashboardPeriod";

function readPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (v === "2w" || v === "4w" || v === "all") return v;
  } catch {
    // Storage unavailable: fall back to everything.
  }
  return "all";
}

/**
 * Two dashboards in one screen: the Class tab (how the class behaves, who
 * stands out, the marks analysis) and the Student tab (everything recorded for
 * one child). Both read the same period filter.
 */
export default function DashboardView() {
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
    dashboardStudent,
    openStudentDashboard,
  } = useApp();
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // Not remembered this time; the filter still applies.
    }
  };
  const tab = dashboardStudent ? "student" : "class";
  const day = today();

  const all: ClassData = useMemo(
    () => ({ students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes }),
    [students, attendance, behaviourEvents, bathroomVisits, assessments, marks, assessmentQuestions, questionMarks, behaviourCodes],
  );
  const data = useMemo(() => filterToPeriod(all, period, day), [all, period, day]);
  const cls = useMemo(() => classProfile(data, period, day), [data, period, day]);
  const before = useMemo(() => {
    const prev = previousPeriod(all, period, day);
    return prev ? classProfile(prev, period, day) : null;
  }, [all, period, day]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const nameOf = (id: string) => {
    const s = byId.get(id);
    return s ? studentName(s) : "(removed student)";
  };
  const codes = useMemo(() => new Map(behaviourCodes.map((c) => [c.code, c])), [behaviourCodes]);
  const codeLabel = (code: string) => {
    const c = codes.get(code);
    return { label: c?.label ?? code, color: c?.color ?? "#4a5868" };
  };

  // The Student tab shows the chosen student, or the first by surname.
  const firstStudent = useMemo(
    () => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))[0],
    [students],
  );
  const student = (dashboardStudent && byId.get(dashboardStudent)) || null;
  useEffect(() => {
    // A student removed from the roster (or a stale id) falls back to the first.
    if (dashboardStudent && !byId.has(dashboardStudent) && firstStudent) openStudentDashboard(firstStudent.id);
  }, [dashboardStudent, byId, firstStudent, openStudentDashboard]);

  const profile = useMemo(() => (student ? studentProfile(student, data, cls, period, day) : null), [student, data, cls, period, day]);

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Dashboard</h1>
        <div className="spacer" />
        <div className="seg dash-tabs" role="tablist" aria-label="Dashboard">
          <button role="tab" aria-selected={tab === "class"} className={tab === "class" ? "on" : ""} onClick={() => openStudentDashboard(null)}>
            👥 Class
          </button>
          <button
            role="tab"
            aria-selected={tab === "student"}
            className={tab === "student" ? "on" : ""}
            onClick={() => firstStudent && openStudentDashboard(dashboardStudent ?? firstStudent.id)}
            disabled={!firstStudent}
          >
            👤 Student
          </button>
        </div>
        <div className="seg period-btns" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? "on" : ""} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <PrivacyGate label="behaviour, attendance and marks analysis">
        {students.length === 0 ? (
          <div className="panel muted">Add students to the class (Settings → Students) to see the dashboards.</div>
        ) : tab === "student" && profile ? (
          <StudentDashboard
            students={students}
            profile={profile}
            summary={studentSummary(profile, cls, period)}
            codeLabel={codeLabel}
            onPick={(id) => openStudentDashboard(id)}
          />
        ) : (
          <ClassDashboard
            data={data}
            profile={cls}
            summary={classSummary(cls, before, period, nameOf)}
            nameOf={nameOf}
            onOpenStudent={(id) => openStudentDashboard(id)}
          />
        )}
      </PrivacyGate>
    </div>
  );
}
