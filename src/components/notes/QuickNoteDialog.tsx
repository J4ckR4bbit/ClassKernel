import { useState } from "react";
import { NoteEditorRequest, useAppPick } from "../../store/appStore";
import { newId, nowIso } from "../../lib/id";
import { Note } from "../../lib/notes";
import Modal from "../Modal";
import { StudentSelect, TextSizeButtons, useNoteName } from "./shared";

/**
 * A short note, quickly: a text box at the size the teacher chose, the shared
 * sections as tag buttons, and
 *   Submit  saves it, clears the box and closes;
 *   Draft   closes, keeping the text until the student is opened again or the
 *           lesson ends (as do Esc and a tap outside, so a slip loses nothing);
 *   Escape  clears everything and saves nothing.
 * Opened on an existing note (from the Notes page) it's Save / Cancel instead.
 */
export default function QuickNoteDialog({ request }: { request: NoteEditorRequest }) {
  const { notes, noteDrafts, noteSections, userPrefs, saveNote, setNoteDraft, closeNoteEditor, showToast } = useAppPick(
    "notes",
    "noteDrafts",
    "noteSections",
    "userPrefs",
    "saveNote",
    "setNoteDraft",
    "closeNoteEditor",
    "showToast",
  );
  const name = useNoteName();
  const editing = request.noteId ? notes.find((n) => n.id === request.noteId) : undefined;
  const draft = editing ? undefined : noteDrafts[request.studentId];
  const [studentId, setStudentId] = useState(editing?.studentId ?? request.studentId);
  const [text, setText] = useState(editing?.text ?? draft?.text ?? "");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? draft?.tags ?? []);
  // Tags on the note that are no longer in the list still show, so they can be taken off.
  const tagChoices = [...noteSections, ...tags.filter((t) => !noteSections.includes(t))];

  const toggle = (tag: string) => setTags((now) => (now.includes(tag) ? now.filter((t) => t !== tag) : [...now, tag]));

  const submit = async () => {
    if (!text.trim()) return;
    const note: Note = editing
      ? { ...editing, studentId, text: text.trim(), tags }
      : { id: newId("note"), timestamp: nowIso(), studentId, kind: "quick", text: text.trim(), tags, sections: {} };
    if (!editing) setNoteDraft(request.studentId, null);
    closeNoteEditor();
    await saveNote(note);
    showToast(editing ? "Note saved" : `Note saved — ${userPrefs.privacyMode ? "added to Notes" : name(studentId)}`);
  };

  const keepDraft = () => {
    if (!editing) {
      if (studentId !== request.studentId) setNoteDraft(request.studentId, null);
      setNoteDraft(studentId, { text, tags });
      if (text.trim() || tags.length) showToast("Kept as a draft until the lesson ends");
    }
    closeNoteEditor();
  };

  const escape = () => {
    if (!editing) setNoteDraft(request.studentId, null);
    closeNoteEditor();
  };

  const title = editing ? "Edit note" : studentId ? `Note — ${name(studentId)}` : "Lesson note";

  return (
    <Modal title={title} onClose={editing ? closeNoteEditor : keepDraft} className="note-modal">
      <div className="note-toolbar">
        {request.fixedStudent ? <span /> : <StudentSelect value={studentId} onChange={setStudentId} allowLesson />}
        <TextSizeButtons />
      </div>
      <textarea
        autoFocus
        className="note-text"
        style={{ fontSize: userPrefs.noteTextSize }}
        rows={4}
        value={text}
        placeholder="Type the note…"
        aria-label="Note"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl + Enter sends it, as in a message box.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {tagChoices.length > 0 && (
        <div className="note-tags" role="group" aria-label="Tags">
          {tagChoices.map((t) => (
            <button key={t} className={`small note-tag ${tags.includes(t) ? "on" : ""}`} aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        {editing ? (
          <>
            <button onClick={closeNoteEditor}>Cancel</button>
            <button className="primary" disabled={!text.trim()} onClick={() => void submit()}>
              Save
            </button>
          </>
        ) : (
          <>
            <button className="note-escape" onClick={escape} title="Clear the note and save nothing">
              Escape
            </button>
            <span className="spacer" />
            <button onClick={keepDraft} title="Close, keeping the text until you open this student again or the lesson ends">
              Draft
            </button>
            <button className="primary" disabled={!text.trim()} onClick={() => void submit()} title="Save the note (Ctrl + Enter)">
              Submit
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
