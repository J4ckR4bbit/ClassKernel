import { useEffect, useState } from "react";
import { marked } from "marked";
import { useApp } from "../store/appStore";

/** Class details + free-form markdown notes (stored as class.md). */
export default function ClassNotesView() {
  const { currentClass, classes, updateClassInfo, renameClass, showToast } = useApp();
  const info = classes.find((c) => c.name === currentClass);
  const [notes, setNotes] = useState(info?.notes ?? "");
  const [year, setYear] = useState(info?.year ?? "");
  const [subject, setSubject] = useState(info?.subject ?? "");
  const [room, setRoom] = useState(info?.room ?? "");
  const [preview, setPreview] = useState(true);

  useEffect(() => {
    setNotes(info?.notes ?? "");
    setYear(info?.year ?? "");
    setSubject(info?.subject ?? "");
    setRoom(info?.room ?? "");
  }, [info?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;

  const save = async () => {
    await updateClassInfo({ ...info, year, subject, room, notes });
    showToast("Class details saved");
  };

  const rename = async () => {
    const next = prompt("New class name (also renames its folder):", info.name)?.trim();
    if (!next || next === info.name) return;
    await renameClass(info.name, next.replace(/[<>:"/\\|?*]/g, ""));
    showToast("Class renamed");
  };

  const toggleArchive = async () => {
    await updateClassInfo({ ...info, archived: !info.archived });
    showToast(info.archived ? "Class restored" : "Class archived (hidden from the sidebar)");
  };

  return (
    <div>
      <div className="view-header">
        <h1>{info.name} — Class notes</h1>
        <div className="spacer" />
        <button onClick={() => void rename()}>Rename class</button>
        <button onClick={() => void toggleArchive()}>{info.archived ? "Restore" : "Archive class"}</button>
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
      </div>

      <div className="panel">
        <div className="row">
          <label>Year</label>
          <input style={{ width: 80 }} value={year} onChange={(e) => setYear(e.target.value)} />
          <label>Subject</label>
          <input style={{ width: 160 }} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label>Room</label>
          <input style={{ width: 120 }} value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="grow" style={{ minWidth: 320 }}>
          <textarea
            style={{ width: "100%", minHeight: 380, fontFamily: "Consolas, monospace", fontSize: 13 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void save()}
            placeholder={"# Notes\n\nAnything you like — schemes of work, links, reminders. Plain markdown, stored in class.md."}
          />
        </div>
        {preview && (
          <div className="panel grow" style={{ minWidth: 320, marginBottom: 0 }}>
            <div dangerouslySetInnerHTML={{ __html: marked.parse(notes || "*Nothing yet*") as string }} />
          </div>
        )}
      </div>
      <p className="muted">
        <label>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> show preview
        </label>{" "}
        · Notes auto-save when you click away.
      </p>
    </div>
  );
}
