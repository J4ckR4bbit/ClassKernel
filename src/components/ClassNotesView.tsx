import { useEffect, useState } from "react";
import { marked } from "marked";
import { useApp } from "../store/appStore";
import { BEHAVIOUR_COLOURS } from "../lib/behaviourColours";

/** Class details + free-form markdown notes (stored as class.md). */
export default function ClassNotesView() {
  const { currentClass, classes, updateClassInfo, renameClass, showToast, promptDialog } = useApp();
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
    const next = (
      await promptDialog({ title: "Rename class", body: "Also renames the class's folder on disk.", initial: info.name })
    )?.trim();
    if (!next || next === info.name) return;
    await renameClass(info.name, next.replace(/[<>:"/\\|?*]/g, ""));
    showToast("Class renamed");
  };

  // The colour saves straight away, like a toggle; the text fields wait for Save.
  const setColour = async (color: string) => {
    await updateClassInfo({ ...info, color });
    showToast(color ? "Class colour saved" : "Class colour removed");
  };

  const toggleArchive = async () => {
    await updateClassInfo({ ...info, archived: !info.archived });
    showToast(info.archived ? "Class restored" : "Class archived (now under Archived in the class menu)");
  };

  return (
    <div>
      <div className="view-header">
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
        <div className="row class-colour-row">
          <label>Colour</label>
          <div className="swatch-row bh-swatches" role="group" aria-label="Class colour">
            {BEHAVIOUR_COLOURS.map((c) => (
              <button
                key={c.hex}
                className={`swatch ${info.color === c.hex ? "on" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={c.name}
                aria-pressed={info.color === c.hex}
                onClick={() => void setColour(c.hex)}
              />
            ))}
          </div>
          <button className={`small ${info.color ? "" : "primary"}`} onClick={() => void setColour("")} aria-pressed={!info.color}>
            None
          </button>
          <span className="muted">Shows on the Home card and beside the class in the menu.</span>
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
