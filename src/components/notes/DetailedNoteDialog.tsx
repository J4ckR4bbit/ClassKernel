import { useState } from "react";
import { NoteEditorRequest, useAppPick } from "../../store/appStore";
import { newId, today } from "../../lib/id";
import { dateInZone } from "../../lib/time";
import { Note } from "../../lib/notes";
import Modal from "../Modal";
import { StudentSelect, TextSizeButtons, timestampFor } from "./shared";

/**
 * A detailed note: one student, a date, and a box for each section (Work
 * ethic, Behaviour, Assessment…). Only the boxes written in are kept.
 */
export default function DetailedNoteDialog({ request }: { request: NoteEditorRequest }) {
  const { notes, noteSections, userPrefs, saveNote, closeNoteEditor, showToast } = useAppPick(
    "notes",
    "noteSections",
    "userPrefs",
    "saveNote",
    "closeNoteEditor",
    "showToast",
  );
  const editing = request.noteId ? notes.find((n) => n.id === request.noteId) : undefined;
  const [studentId, setStudentId] = useState(editing?.studentId ?? request.studentId);
  const [date, setDate] = useState(editing ? dateInZone(editing.timestamp) : today());
  const [sections, setSections] = useState<Record<string, string>>(editing?.sections ?? {});
  // Sections since removed from the list still show on the note they were written in.
  const shown = [...noteSections, ...Object.keys(sections).filter((s) => !noteSections.includes(s) && sections[s]?.trim())];
  const filled = shown.some((s) => sections[s]?.trim());
  const canSave = !!studentId && !!date && filled;

  const save = async () => {
    if (!canSave) return;
    const kept: Record<string, string> = {};
    for (const s of shown) if (sections[s]?.trim()) kept[s] = sections[s].trim();
    const note: Note = {
      id: editing?.id ?? newId("note"),
      timestamp: timestampFor(date, editing?.timestamp),
      studentId,
      kind: "detailed",
      text: "",
      tags: [],
      sections: kept,
    };
    closeNoteEditor();
    await saveNote(note);
    showToast(editing ? "Detailed note saved" : "Detailed note added");
  };

  return (
    <Modal title={editing ? "Edit detailed note" : "Detailed note"} onClose={closeNoteEditor} className="note-modal wide">
      <div className="note-toolbar">
        {request.fixedStudent ? <span /> : <StudentSelect value={studentId} onChange={setStudentId} />}
        <label className="note-field">
          <span>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <TextSizeButtons />
      </div>
      <p className="muted note-hint">Write in the sections you need; empty ones aren't kept.</p>
      <div className="note-sections">
        {shown.map((s) => (
          <label key={s} className="note-section">
            <span>{s}</span>
            <textarea
              rows={2}
              style={{ fontSize: userPrefs.noteTextSize }}
              value={sections[s] ?? ""}
              onChange={(e) => setSections((now) => ({ ...now, [s]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={closeNoteEditor}>Cancel</button>
        <button className="primary" disabled={!canSave} onClick={() => void save()} title={studentId ? undefined : "Choose a student first"}>
          Save
        </button>
      </div>
    </Modal>
  );
}
