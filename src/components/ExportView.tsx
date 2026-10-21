import { useEffect, useMemo, useState } from "react";
import { useAppPick } from "../store/appStore";
import { getFS, isTauri } from "../lib/fs";
import {
  DEFAULT_SECTIONS,
  EXPORT_SECTIONS,
  ExportData,
  ExportSection,
  buildSheets,
  exportFileName,
  loadExportData,
} from "../lib/exporter";
import { buildXlsx } from "../lib/xlsx";
import { fmtDecimal } from "../lib/format";

/** Hand the workbook to the browser as a download (dev / demo mode only). */
function downloadInBrowser(fileName: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Settings → Export. Turns the collected registers, behaviour log, marks and
 * seating history into a single .xlsx workbook — one sheet per dataset, one
 * row per record, with a Class column so several classes can go in together
 * and be pivoted afterwards.
 */
export default function ExportView() {
  const { dataDir, classes, currentClass, showToast, userPrefs } = useAppPick(
    "dataDir",
    "classes",
    "currentClass",
    "showToast",
    "userPrefs",
  );

  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => {
    if (currentClass) return [currentClass];
    const active = classes.filter((c) => !c.archived);
    return active.length ? [active[0].name] : [];
  });
  const [sections, setSections] = useState<ExportSection[]>(DEFAULT_SECTIONS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const classKey = selectedClasses.join("|");

  // Reload whenever the class selection changes: the store only ever holds the
  // open class, so an export of several classes reads them straight from disk.
  useEffect(() => {
    let cancelled = false;
    if (!dataDir || selectedClasses.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    loadExportData(dataDir, selectedClasses)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((e) => {
        if (!cancelled) showToast(`Could not read the class data: ${e}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // classKey is the joined selection: re-reading on identity changes alone
    // would reload the files on every render.
  }, [dataDir, classKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheets = useMemo(
    () => (data ? buildSheets(data, { sections, from, to, dataDir: dataDir ?? "", gradeScale: userPrefs.gradeScale }) : []),
    [data, sections, from, to, dataDir, userPrefs.gradeScale],
  );
  const rowsByName = useMemo(() => new Map(sheets.map((s) => [s.name, s.rows.length])), [sheets]);
  const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0);
  const canExport = !!data && selectedClasses.length > 0 && sections.length > 0 && !busy;

  const toggleClass = (name: string) =>
    setSelectedClasses((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const toggleSection = (id: ExportSection) =>
    setSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const build = () => buildXlsx(sheets);

  const exportAs = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const fileName = exportFileName(selectedClasses);
      const bytes = build();
      if (!isTauri()) {
        downloadInBrowser(fileName, bytes);
        showToast(`Downloaded ${fileName}`);
        return;
      }
      const path = await getFS().pickSaveFile(fileName, "xlsx", "Excel workbook");
      if (!path) return; // cancelled
      await getFS().writeBinary(path, bytes);
      showToast(`Exported ${sheets.length} sheets to ${path}`);
    } catch (e) {
      showToast(`Export failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const exportToDataFolder = async () => {
    if (!data || !dataDir) return;
    setBusy(true);
    try {
      const fileName = exportFileName(selectedClasses);
      const path = `${dataDir}/exports/${fileName}`;
      await getFS().writeBinary(path, build());
      showToast(`Saved to exports/${fileName}`);
    } catch (e) {
      showToast(`Export failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  if (classes.length === 0) {
    return <div className="panel muted">Create a class first — there is nothing to export yet.</div>;
  }

  return (
    <>
      <div className="panel">
        <h3>Classes to include</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Every sheet carries a <b>Class</b> column, so you can tick several classes and still get one workbook.
        </p>
        <div className="roster-chips">
          {classes.map((c) => (
            <span
              key={c.name}
              className={`chip ${selectedClasses.includes(c.name) ? "selected" : ""}`}
              onClick={() => toggleClass(c.name)}
            >
              {c.name}
              {c.archived ? " (archived)" : ""}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="small" onClick={() => setSelectedClasses(classes.filter((c) => !c.archived).map((c) => c.name))}>
            All active classes
          </button>
          <button className="small" onClick={() => setSelectedClasses([])}>
            None
          </button>
          {loading && <span className="muted">Reading class files…</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Date range</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Optional. Limits the register, behaviour log, lesson history and assessments to a term or a half-term. Leave
          both blank for everything on record.
        </p>
        <div className="row">
          <label className="row">
            <span className="muted">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="row">
            <span className="muted">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button
              className="small"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Sheets</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Each ticked dataset becomes its own sheet in the workbook. Row counts update as you change the selection.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>Sheet</th>
              <th>What it contains</th>
              <th style={{ width: 90 }}>Rows</th>
            </tr>
          </thead>
          <tbody>
            {EXPORT_SECTIONS.map((s) => {
              const on = sections.includes(s.id);
              // A section can produce more than one sheet (seating insights).
              const rows = s.sheetNames.reduce((n, name) => n + (rowsByName.get(name) ?? 0), 0);
              return (
                <tr key={s.id}>
                  <td>
                    <input type="checkbox" checked={on} onChange={() => toggleSection(s.id)} />
                  </td>
                  <td>{s.label}</td>
                  <td className="muted">{s.description}</td>
                  <td>{on ? (data ? fmtDecimal(rows) : "…") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="small" onClick={() => setSections(EXPORT_SECTIONS.map((s) => s.id))}>
            Select all
          </button>
          <button className="small" onClick={() => setSections(DEFAULT_SECTIONS)}>
            Reset
          </button>
          <button className="small" onClick={() => setSections([])}>
            None
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Export</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {data
            ? `${sheets.length} sheets · ${fmtDecimal(totalRows)} rows · opens in Excel, LibreOffice or Google Sheets.`
            : "Pick at least one class above."}
        </p>
        <div className="row">
          <button className="primary" disabled={!canExport} onClick={() => void exportAs()}>
            {busy ? "Working…" : "Export spreadsheet (.xlsx)"}
          </button>
          {isTauri() && (
            <button disabled={!canExport} onClick={() => void exportToDataFolder()}>
              Save to data folder
            </button>
          )}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {isTauri()
            ? "“Export” asks where to save; “Save to data folder” drops the file into exports/ next to your class files. Exports are snapshots — editing the spreadsheet never changes the app's data."
            : "In the browser demo the workbook is downloaded straight away. Exports are snapshots — editing the spreadsheet never changes the app's data."}
        </p>
      </div>
    </>
  );
}
