import { useRef, useState } from "react";
import { useAppPick } from "../store/appStore";
import { RosterPlan, applyRosterImport, planRosterImport, rosterFileName, rosterWorkbook } from "../lib/rosterSheet";
import { readSpreadsheetFile } from "../lib/spreadsheetFile";
import { buildXlsx } from "../lib/xlsx";
import { Student } from "../lib/types";
import { savePluginFile } from "../plugins/host";
import Icon from "./Icon";
import StatTile from "./StatTile";
import Modal from "./Modal";

/**
 * Template and Import buttons for classes and students: for one class (its
 * Students page) or for every class (Settings › General). The import shows what
 * it will add and change, and what it skipped and why, before saving anything.
 */
export default function RosterSheetTools({ oneClass }: { oneClass?: string }) {
  const { classes, showToast, loadAllStudents, importRoster } = useAppPick(
    "classes",
    "showToast",
    "loadAllStudents",
    "importRoster",
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ plan: RosterPlan; fileName: string; studentsByClass: Map<string, Student[]> } | null>(null);
  const label = oneClass ? "Import spreadsheet" : "Import classes and students";

  const download = async () => {
    const all = await loadAllStudents();
    const chosen = oneClass ? classes.filter((c) => c.name === oneClass) : classes.filter((c) => !c.archived);
    const bytes = buildXlsx(rosterWorkbook(chosen, all, !!oneClass));
    showToast((await savePluginFile({ name: rosterFileName(oneClass), extension: "xlsx", label: "Excel workbook", bytes })).message);
  };

  const read = async (file: File) => {
    try {
      const sheets = await readSpreadsheetFile(file);
      const studentsByClass = await loadAllStudents();
      setPending({ plan: planRosterImport(sheets, classes, studentsByClass, oneClass ?? null), fileName: file.name, studentsByClass });
    } catch (e) {
      showToast(`Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    const out = applyRosterImport(pending.plan, pending.studentsByClass);
    setPending(null);
    await importRoster(out.classes, out.students);
    const added = pending.plan.students.filter((s) => s.isNew).length;
    const updated = pending.plan.students.filter((s) => !s.isNew && s.changed.length).length;
    const newClasses = pending.plan.classes.filter((c) => c.isNew).length;
    showToast(
      [newClasses && `${newClasses} new class${newClasses === 1 ? "" : "es"}`, added && `${added} new student${added === 1 ? "" : "s"}`, updated && `${updated} updated`]
        .filter(Boolean)
        .join(", ") || "Import done: nothing changed",
    );
  };

  const plan = pending?.plan;
  const newClasses = plan?.classes.filter((c) => c.isNew) ?? [];
  const changedClasses = plan?.classes.filter((c) => !c.isNew && c.changed.length) ?? [];
  const newStudents = plan?.students.filter((s) => s.isNew) ?? [];
  const changedStudents = plan?.students.filter((s) => !s.isNew && s.changed.length) ?? [];
  const anything = newClasses.length + changedClasses.length + newStudents.length + changedStudents.length > 0;

  return (
    <>
      <button
        className={oneClass ? undefined : "small"}
        onClick={() => void download()}
        title={oneClass ? "A spreadsheet of this class's students to fill in and import" : "A spreadsheet of every class and its students to fill in and import"}
      >
        <Icon name="download" size={18} /> Template
      </button>
      <button className={oneClass ? undefined : "small"} onClick={() => fileInput.current?.click()} title="Read a filled-in template (.xlsx or .csv)">
        <Icon name="unarchive" size={18} /> {label}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.csv"
        hidden
        data-testid={oneClass ? "roster-import-file" : "classes-import-file"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />

      {pending && plan && (
        <Modal title={label} className="import-preview" onClose={() => setPending(null)}>
          <p className="muted lead">
            From <b>{pending.fileName}</b>
            {oneClass ? (
              <>
                {" "}
                into <b>{oneClass}</b>
              </>
            ) : null}
            .
          </p>
          <div className="stat-tiles compact">
            {!oneClass && (
              <StatTile value={newClasses.length} label="new classes" />
            )}
            <StatTile value={newStudents.length} label="new students" />
            <StatTile value={changedStudents.length + changedClasses.length} label="updated" />
          </div>
          <ul className="import-changes">
            {newClasses.map((c) => (
              <li key={`c:${c.info.name}`}>
                New class <b>{c.info.name}</b>
                {c.info.year ? `, grade ${c.info.year}` : ""}
              </li>
            ))}
            {changedClasses.map((c) => (
              <li key={`cc:${c.info.name}`}>
                <b>{c.info.name}</b>: {c.changed.join(", ").toLowerCase()}
              </li>
            ))}
            {newStudents.map((s) => (
              <li key={`s:${s.student.id}`}>
                New: <b>{s.student.firstName} {s.student.lastName}</b>
                {oneClass ? "" : ` in ${s.className}`}
              </li>
            ))}
            {changedStudents.map((s) => (
              <li key={`u:${s.student.id}`}>
                <b>
                  {s.student.firstName} {s.student.lastName}
                </b>
                : {s.changed.join(", ").toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="muted">Blank cells leave details as they are. Nobody is removed.</p>
          {plan.notInFile.length > 0 && (
            <details className="import-absent">
              <summary>
                {plan.notInFile.length} student{plan.notInFile.length === 1 ? " isn't" : "s aren't"} in the file and stay as they are
              </summary>
              <ul className="import-problems">
                {plan.notInFile.map((s, i) => (
                  <li key={i}>
                    {s.name}
                    {oneClass ? "" : ` (${s.className})`}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
            <button className="primary" disabled={!anything} onClick={() => void confirm()}>
              Import
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
