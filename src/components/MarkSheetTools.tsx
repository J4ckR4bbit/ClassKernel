import { useRef, useState } from "react";
import Papa from "papaparse";
import { useApp } from "../store/appStore";
import { Assessment } from "../lib/types";
import { ImportPlan, MARKS_SHEET, applyImport, markTemplate, planImport, templateFileName } from "../lib/markSheet";
import { buildXlsx } from "../lib/xlsx";
import { readXlsx } from "../lib/xlsxRead";
import { savePluginFile } from "../plugins/host";
import Icon from "./Icon";

/** The rows of a chosen file: the template's Marks sheet (else the first sheet), or a .csv. */
async function readRows(file: File): Promise<{ rows: string[][]; about: string[][] | null }> {
  if (/\.csv$/i.test(file.name)) {
    // Papa works out the separator, so a semicolon .csv from SA-locale Excel reads too.
    return { rows: Papa.parse<string[]>(await file.text()).data, about: null };
  }
  const sheets = await readXlsx(new Uint8Array(await file.arrayBuffer()));
  const marks = sheets.find((s) => s.name === MARKS_SHEET) ?? sheets[0];
  return { rows: marks?.rows ?? [], about: sheets.find((s) => s.name === "About")?.rows ?? null };
}

/**
 * Template and Import marks buttons for one assessment: download a spreadsheet
 * of the class (with any marks so far) to fill in elsewhere, then read it back.
 * The import shows what will change, and what it skipped and why, before
 * anything is saved.
 */
export default function MarkSheetTools({ assessment, onImported }: { assessment: Assessment; onImported: () => void }) {
  const { currentClass, students, marks, questionMarks, assessmentQuestions, showToast } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ plan: ImportPlan; fileName: string } | null>(null);
  const questions = assessmentQuestions.filter((q) => q.assessmentId === assessment.id).sort((a, b) => a.number - b.number);

  const download = async () => {
    const bytes = buildXlsx(markTemplate(assessment, currentClass ?? "", students, questions, marks, questionMarks));
    const outcome = await savePluginFile({ name: templateFileName(assessment), extension: "xlsx", label: "Excel workbook", bytes });
    showToast(outcome.message);
  };

  const read = async (file: File) => {
    try {
      const { rows, about } = await readRows(file);
      setPending({ plan: planImport(rows, about, assessment, questions, students, marks, questionMarks), fileName: file.name });
    } catch (e) {
      showToast(`Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const confirm = () => {
    if (!pending) return;
    // Apply to the store as it is now, not as it was when the file was chosen.
    const store = useApp.getState();
    const next = applyImport(pending.plan, assessment, store.marks, store.questionMarks);
    void store.setMarks(next.marks);
    if (assessment.questionCount > 1) void store.setQuestionMarks(next.questionMarks);
    const n = pending.plan.added + pending.plan.changed;
    showToast(n ? `Imported ${n} mark${n === 1 ? "" : "s"}` : "Import done: no marks changed");
    setPending(null);
    onImported();
  };

  const plan = pending?.plan;
  return (
    <>
      <button className="small" onClick={() => void download()} title="A spreadsheet of the class for this assessment, with any marks so far, to fill in and import">
        <Icon name="download" size={18} /> Template
      </button>
      <button className="small" onClick={() => fileInput.current?.click()} title="Read marks from a filled-in template (.xlsx or .csv)">
        <Icon name="unarchive" size={18} /> Import marks
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.csv"
        hidden
        data-testid="mark-import-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // choosing the same file again still triggers a read
          if (file) void read(file);
        }}
      />

      {pending && plan && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div className="modal import-preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import marks">
            <h2>Import marks</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              From <b>{pending.fileName}</b> into <b>{assessment.title}</b>.
            </p>
            {plan.otherAssessment && (
              <p className="import-warning">
                <Icon name="warning" size={18} /> This file was made for <b>{plan.otherAssessment}</b>. Check that it's the right file before you import.
              </p>
            )}
            <div className="stat-tiles compact">
              <div className="stat-tile">
                <div className="value">{plan.added}</div>
                <div className="label">new</div>
              </div>
              <div className="stat-tile">
                <div className="value">{plan.changed}</div>
                <div className="label">changed</div>
              </div>
              <div className="stat-tile">
                <div className="value">{plan.same}</div>
                <div className="label">already the same</div>
              </div>
            </div>
            <p className="muted">Blank cells leave the marks in ClassKernel as they are.</p>
            {plan.problems.length > 0 && (
              <>
                <h3>Skipped ({plan.problems.length})</h3>
                <ul className="import-problems">
                  {plan.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="actions">
              <button onClick={() => setPending(null)}>Cancel</button>
              <button className="primary" disabled={plan.rows.length === 0} onClick={confirm}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
