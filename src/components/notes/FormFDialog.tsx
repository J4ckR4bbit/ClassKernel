import { useState } from "react";
import { NoteEditorRequest, useAppPick } from "../../store/appStore";
import { newId, today } from "../../lib/id";
import { dateInZone } from "../../lib/time";
import { gradeLabel } from "../../lib/format";
import { studentName } from "../../lib/types";
import { Note } from "../../lib/notes";
import { FORM_F_DETAILS, FORM_F_HELPFUL, FORM_F_PERCENT, FORM_F_QUESTIONS, YES_NO, formFDefaults } from "../../lib/formF";
import Modal from "../Modal";
import Icon from "../Icon";
import { StudentSelect, TextSizeButtons, timestampFor } from "./shared";

/**
 * The IEB's Form F (teacher comment for an accommodation or exemption
 * application), filled in as a note: the details the app knows come filled in
 * (name, grade, subject, and the teacher from Settings → General), then the
 * teacher's answers. Save and print lays it out as the form, ready to sign.
 */
export default function FormFDialog({ request }: { request: NoteEditorRequest }) {
  const { notes, students, classes, currentClass, userPrefs, saveNote, closeNoteEditor, openNoteEditor, showToast } = useAppPick(
    "notes",
    "students",
    "classes",
    "currentClass",
    "userPrefs",
    "saveNote",
    "closeNoteEditor",
    "openNoteEditor",
    "showToast",
  );
  const editing = request.noteId ? notes.find((n) => n.id === request.noteId) : undefined;
  const info = classes.find((c) => c.name === currentClass);
  const fullName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? studentName(s) : "";
  };
  const [studentId, setStudentId] = useState(editing?.studentId ?? request.studentId);
  const [date, setDate] = useState(editing ? dateInZone(editing.timestamp) : today());
  const [fields, setFields] = useState<Record<string, string>>(
    () =>
      editing?.sections ??
      formFDefaults({
        name: fullName(request.studentId),
        grade: info?.year ? gradeLabel(info.year) : "",
        subject: info?.subject ?? "",
        teacher: userPrefs.reportTeacher,
      }),
  );
  const set = (key: string, value: string) => setFields((now) => ({ ...now, [key]: value }));
  const chooseStudent = (id: string) => {
    setStudentId(id);
    set("name", fullName(id));
  };
  const canSave = !!studentId && !!date;

  const save = async (print: boolean) => {
    if (!canSave) return;
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) if (v.trim()) kept[k] = v.trim();
    const note: Note = {
      id: editing?.id ?? newId("note"),
      timestamp: timestampFor(date, editing?.timestamp),
      studentId,
      kind: "formF",
      text: "",
      tags: [],
      sections: kept,
    };
    await saveNote(note);
    if (print) openNoteEditor({ kind: "formF", studentId, noteId: note.id, print: true });
    else {
      closeNoteEditor();
      showToast("Form F saved");
    }
  };

  const size = { fontSize: userPrefs.noteTextSize };
  // The teacher's name comes from the parent-report header; while it's blank here, say where to set it.
  const noTeacher = !fields.teacher?.trim() && !userPrefs.reportTeacher;

  return (
    <Modal title="Form F — teacher comment" onClose={closeNoteEditor} className="note-modal wide formf-modal">
      <p className="muted note-hint">
        IEB teacher comment form for an accommodation(s)/exemption application. Fill in what you know; Save and print
        lays it out as the form to sign.
      </p>
      <div className="note-toolbar">
        {request.fixedStudent ? <span /> : <StudentSelect value={studentId} onChange={chooseStudent} />}
        <label className="note-field">
          <span>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <TextSizeButtons />
      </div>

      <div className="formf-details">
        {FORM_F_DETAILS.map((f) => (
          <label key={f.key} className="formf-row">
            <span>{f.label}</span>
            <input style={size} value={fields[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
          </label>
        ))}
      </div>
      {noTeacher && <p className="muted note-hint">Tip: add your name under Settings → General → Parent reports and it fills in here.</p>}

      <label className="note-section">
        <span>{FORM_F_HELPFUL.label}</span>
        <textarea rows={4} style={size} value={fields[FORM_F_HELPFUL.key] ?? ""} onChange={(e) => set(FORM_F_HELPFUL.key, e.target.value)} />
      </label>

      <table className="data formf-checklist">
        <thead>
          <tr>
            <th>Please complete the table</th>
            {YES_NO.map((a) => (
              <th key={a} className="formf-answer">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FORM_F_QUESTIONS.map((q) => (
            <tr key={q.key}>
              <td>{q.text}</td>
              {YES_NO.map((a) => {
                const on = fields[q.key] === a;
                return (
                  <td key={a} className="formf-answer">
                    <button
                      className={`small icon-only formf-tick ${on ? "on" : ""}`}
                      aria-pressed={on}
                      aria-label={`${a}: ${q.text}`}
                      title={on ? "Tap again to clear" : a}
                      onClick={() => set(q.key, on ? "" : a)}
                    >
                      {on && <Icon name="check" size={18} />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td>{FORM_F_PERCENT.label}</td>
            <td colSpan={3}>
              <input
                aria-label={FORM_F_PERCENT.label}
                style={size}
                value={fields[FORM_F_PERCENT.key] ?? ""}
                placeholder="e.g. 10%"
                onChange={(e) => set(FORM_F_PERCENT.key, e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <div className="actions">
        <button onClick={closeNoteEditor}>Cancel</button>
        <button disabled={!canSave} onClick={() => void save(false)} title={studentId ? undefined : "Choose a student first"}>
          Save
        </button>
        <button className="primary" disabled={!canSave} onClick={() => void save(true)}>
          <Icon name="print" size={20} /> Save and print
        </button>
      </div>
    </Modal>
  );
}
