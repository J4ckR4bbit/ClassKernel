import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../store/appStore";
import { dateInZone } from "../../lib/time";
import {
  ClassData,
  REPORT_SECTIONS,
  ReportSection,
  classProfile,
  filterToRange,
  parentSummary,
  studentProfile,
} from "../../lib/insights";
import ParentReport, { longDate } from "./ParentReport";
import ClassPicker from "../ClassPicker";
import Icon from "../Icon";

const SECTIONS_KEY = "classkernel.reportSections";

function readSections(): Set<ReportSection> {
  const all = REPORT_SECTIONS.map((s) => s.id);
  try {
    const saved = localStorage.getItem(SECTIONS_KEY);
    if (saved !== null) return new Set(saved.split(",").filter((s): s is ReportSection => all.includes(s as ReportSection)));
  } catch {
    // Storage unavailable: everything on.
  }
  return new Set(all);
}

/** The earliest date anything was recorded, so "from the start" has a date to print. */
function firstRecord(data: ClassData): string | null {
  const dates = [
    ...data.assessments.map((a) => a.date),
    ...data.attendance.map((e) => e.date),
    ...data.bathroomVisits.map((v) => v.date),
    ...data.behaviourEvents.map((e) => dateInZone(e.timestamp)),
  ].filter(Boolean);
  return dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null;
}

/**
 * Full-screen print preview for parent reports: options on the left, the A4
 * pages on the right exactly as they'll print. One student, or the whole class
 * with a page each. Printing hides the app and the options (see styles.css).
 */
export default function ReportPreview({
  studentIds,
  data,
  initialFrom,
  today,
  onClose,
  standalone = false,
}: {
  studentIds: string[];
  data: ClassData;
  /** "" = from the first record. */
  initialFrom: string;
  today: string;
  onClose: () => void;
  /**
   * Opened as the Parent reports tool rather than from a dashboard: adds the
   * class menu (the preview covers the top bar's) and a whole-class /
   * one-student choice to the options.
   */
  standalone?: boolean;
}) {
  const { classes, currentClass, userPrefs, reportComments, setReportComment } = useApp();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(today);
  const [sections, setSectionsState] = useState<Set<ReportSection>>(readSections);
  // Comments being typed, saved to the class when the box loses focus.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const toggleSection = (id: ReportSection) => {
    const next = new Set(sections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSectionsState(next);
    try {
      localStorage.setItem(SECTIONS_KEY, [...next].join(","));
    } catch {
      // Not remembered this time.
    }
  };

  // Hide the app while the preview is open, so printing gives only the reports.
  useEffect(() => {
    document.body.classList.add("report-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("report-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const ranged = useMemo(() => filterToRange(data, from, to || today), [data, from, to, today]);
  const cls = useMemo(() => classProfile(ranged, "all", to || today), [ranged, to, today]);
  const byId = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  // In the tool, "" = the whole class, or one student's id.
  const [only, setOnly] = useState("");
  const chosen = standalone && only && byId.has(only) ? [only] : studentIds;
  const students = chosen.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);

  const start = from || firstRecord(ranged);
  const periodLabel = start ? `${longDate(start)} – ${longDate(to || today)}` : `Up to ${longDate(to || today)}`;
  const classInfo = classes.find((c) => c.name === currentClass);
  const commentOf = (id: string) => drafts[id] ?? reportComments[id] ?? "";
  const saveComment = (id: string) => {
    if (drafts[id] === undefined || drafts[id] === (reportComments[id] ?? "")) return;
    void setReportComment(id, drafts[id]);
  };

  return createPortal(
    <div className="report-portal" role="dialog" aria-label="Parent report preview">
      <aside className="report-options">
        <h2>Parent report{students.length === 1 ? "" : "s"}</h2>
        <p className="muted">
          {students.length === 1 ? "One page" : `${students.length} pages, one per student`}. Type a comment on each page — it's saved for next
          time.
        </p>

        {standalone && (
          <>
            <h3>Class</h3>
            <ClassPicker inPanel />
            <h3>Students</h3>
            <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Students">
              <option value="">Whole class ({studentIds.length})</option>
              {studentIds.map((id) => {
                const s = byId.get(id);
                return s ? (
                  <option key={id} value={id}>
                    {s.lastName}, {s.firstName}
                  </option>
                ) : null;
              })}
            </select>
          </>
        )}

        <h3>Period</h3>
        <label className="report-field">
          From
          <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="report-field">
          To
          <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value || today)} />
        </label>
        {from && (
          <button className="small" onClick={() => setFrom("")}>
            From the start
          </button>
        )}

        <h3>Include</h3>
        {REPORT_SECTIONS.map((s) => (
          <label key={s.id} className="report-check">
            <input type="checkbox" checked={sections.has(s.id)} onChange={() => toggleSection(s.id)} /> {s.label}
          </label>
        ))}

        {(!userPrefs.reportSchool || !userPrefs.reportTeacher) && (
          <p className="muted report-hint">Add your school and your name to the top of the page under Settings → General → Parent reports.</p>
        )}

        <div className="report-actions">
          <button className="primary" onClick={() => window.print()} disabled={students.length === 0}>
            <Icon name="print" size={20} /> Print
          </button>
          <button onClick={onClose}>
            <Icon name={standalone ? "arrow_back" : "close"} size={20} /> {standalone ? "Home" : "Close"}
          </button>
        </div>
      </aside>

      <div className="report-pages">
        {students.length === 0 && <div className="report-empty muted">There are no students in this class yet.</div>}
        {students.map((s) => {
          const profile = studentProfile(s, ranged, cls, "all", to || today);
          return (
            <ParentReport
              key={s.id}
              profile={profile}
              summary={parentSummary(profile, cls, sections)}
              sections={sections}
              classInfo={classInfo}
              school={userPrefs.reportSchool}
              teacher={userPrefs.reportTeacher}
              periodLabel={periodLabel}
              printedOn={longDate(today)}
              comment={commentOf(s.id)}
              onComment={(text) => setDrafts((d) => ({ ...d, [s.id]: text }))}
              onCommentDone={() => saveComment(s.id)}
              gradeScale={userPrefs.gradeScale}
            />
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
