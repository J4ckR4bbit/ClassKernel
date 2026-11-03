import { useMemo, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { dateTimeInZone, dateInZone } from "../../lib/time";
import { shortDate } from "../../lib/format";
import { Note, NoteKind, byNewest, noteInSection, noteMatches, notesBySection, orderedSections } from "../../lib/notes";
import { FORM_F_HELPFUL, FORM_F_QUESTIONS, formFAnswered } from "../../lib/formF";
import PrivacyGate from "../PrivacyGate";
import Segmented from "../Segmented";
import Icon from "../Icon";
import EmptyState from "../EmptyState";
import NoteSettings from "./NoteSettings";
import { useNoteName } from "./shared";

const KIND_LABEL: Record<NoteKind, string> = { quick: "Quick note", detailed: "Detailed note", formF: "Form F" };
type Layout = "timeline" | "sections";

/**
 * The Notes page: every note about the open class, newest first, or one
 * student's notes gathered under each section. Quick notes come from the
 * lesson (a seat's Note button, or Quick note for the whole lesson); detailed
 * notes and Form F are written here. Below, the sections (also the quick
 * notes' tags) and the text size.
 */
export default function StudentNotesView() {
  const { notes, noteSections, students, openNoteEditor, deleteNote, saveNote, showToast } = useAppPick(
    "notes",
    "noteSections",
    "students",
    "openNoteEditor",
    "deleteNote",
    "saveNote",
    "showToast",
  );
  const name = useNoteName();
  const [student, setStudent] = useState("all");
  const [section, setSection] = useState("all");
  const [kind, setKind] = useState<"all" | NoteKind>("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>("timeline");
  const oneStudent = student !== "all" && student !== "";

  const shown = useMemo(
    () =>
      notes
        .filter((n) => student === "all" || n.studentId === student)
        .filter((n) => kind === "all" || n.kind === kind)
        .filter((n) => section === "all" || noteInSection(n, section))
        .filter((n) => noteMatches(n, query))
        .sort(byNewest),
    [notes, student, kind, section, query],
  );

  const remove = async (n: Note) => {
    const gone = await deleteNote(n.id);
    if (gone) showToast(`${KIND_LABEL[n.kind]} deleted`, { label: "Undo", run: () => void saveNote(gone) });
  };

  const forWhom = oneStudent ? student : "";
  const studentsWithNotes = useMemo(() => new Set(notes.map((n) => n.studentId)), [notes]);

  return (
    <div className="notes-view">
      <div className="view-header">
        <button className="primary" onClick={() => openNoteEditor({ kind: "quick", studentId: forWhom })}>
          <Icon name="edit_note" size={20} /> Quick note
        </button>
        <button onClick={() => openNoteEditor({ kind: "detailed", studentId: forWhom })}>
          <Icon name="note_add" size={20} /> Detailed note
        </button>
        <button onClick={() => openNoteEditor({ kind: "formF", studentId: forWhom })} title="IEB teacher comment form for an accommodation/exemption application">
          <Icon name="description" size={20} /> Form F
        </button>
      </div>

      <PrivacyGate label="notes">
        <div className="notes-filters">
          <select value={student} onChange={(e) => setStudent(e.target.value)} aria-label="Whose notes">
            <option value="all">Every student</option>
            <option value="">The lesson (no student)</option>
            {[...students]
              .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s.id)}
                  {studentsWithNotes.has(s.id) ? "" : " (no notes)"}
                </option>
              ))}
          </select>
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section or tag">
            <option value="all">Every section</option>
            {noteSections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as "all" | NoteKind)} aria-label="Kind of note">
            <option value="all">Every kind</option>
            <option value="quick">Quick notes</option>
            <option value="detailed">Detailed notes</option>
            <option value="formF">Form F</option>
          </select>
          <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the notes" />
          <span className="spacer" />
          <Segmented
            small
            label="Layout"
            options={[
              { value: "timeline", label: "Timeline" },
              { value: "sections", label: "By section" },
            ]}
            value={oneStudent ? layout : "timeline"}
            onChange={(v) => {
              if (v === "sections" && !oneStudent) showToast("Choose a student first, to see their notes by section");
              else setLayout(v);
            }}
          />
        </div>

        {layout === "sections" && oneStudent ? (
          <BySection studentId={student} notes={shown} onEdit={(n) => openNoteEditor({ kind: n.kind, studentId: n.studentId, noteId: n.id })} />
        ) : shown.length === 0 ? (
          <EmptyState icon="sticky_note_2" title={notes.length ? "No notes match" : "No notes yet"}>
            {notes.length
              ? "Try another student, section or search."
              : "Write one with Quick note, Detailed note or Form F above — or tap a student in a lesson and press Note."}
          </EmptyState>
        ) : (
          <ul className="note-list">
            {shown.map((n) => (
              <li key={n.id} className={`note-card ${n.kind}`}>
                <div className="note-head">
                  <span className="note-when">{dateTimeInZone(n.timestamp).replace(" ", " · ")}</span>
                  <b>{name(n.studentId)}</b>
                  <span className={`tag note-kind ${n.kind}`}>{KIND_LABEL[n.kind]}</span>
                  <span className="spacer" />
                  {n.kind === "formF" && (
                    <button
                      className="small icon-only"
                      title="Print Form F"
                      aria-label="Print Form F"
                      onClick={() => openNoteEditor({ kind: "formF", studentId: n.studentId, noteId: n.id, print: true })}
                    >
                      <Icon name="print" size={18} />
                    </button>
                  )}
                  <button
                    className="small icon-only"
                    title="Edit"
                    aria-label="Edit note"
                    onClick={() => openNoteEditor({ kind: n.kind, studentId: n.studentId, noteId: n.id })}
                  >
                    <Icon name="edit" size={18} />
                  </button>
                  <button className="small icon-only danger" title="Delete" aria-label="Delete note" onClick={() => void remove(n)}>
                    <Icon name="delete" size={18} />
                  </button>
                </div>
                <NoteBody note={n} section={section} sections={noteSections} />
              </li>
            ))}
          </ul>
        )}
      </PrivacyGate>

      <NoteSettings />
    </div>
  );
}

function NoteBody({ note, section, sections }: { note: Note; section: string; sections: string[] }) {
  if (note.kind === "quick") {
    return (
      <>
        {note.tags.length > 0 && (
          <div className="note-tag-list">
            {note.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="note-text-shown">{note.text}</p>
      </>
    );
  }
  if (note.kind === "detailed") {
    const parts = orderedSections(note, sections).filter(([s]) => section === "all" || s === section);
    return (
      <dl className="note-sections-shown">
        {parts.map(([s, text]) => (
          <div key={s}>
            <dt>{s}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    );
  }
  const f = note.sections;
  return (
    <dl className="note-sections-shown">
      {f.applied_for && (
        <div>
          <dt>Applied for</dt>
          <dd>{f.applied_for}</dd>
        </div>
      )}
      {f[FORM_F_HELPFUL.key] && (
        <div>
          <dt>Would help</dt>
          <dd>{f[FORM_F_HELPFUL.key]}</dd>
        </div>
      )}
      <div>
        <dt>Checklist</dt>
        <dd>
          {formFAnswered(f)} of {FORM_F_QUESTIONS.length} answered
        </dd>
      </div>
    </dl>
  );
}

/** One student's notes under each section, newest first: detailed notes' sections and quick notes tagged with it. */
function BySection({ studentId, notes, onEdit }: { studentId: string; notes: Note[]; onEdit: (n: Note) => void }) {
  const { noteSections } = useAppPick("noteSections");
  const groups = notesBySection(notes, studentId, noteSections);
  if (groups.length === 0) {
    return (
      <EmptyState icon="sticky_note_2" title="Nothing in any section yet">
        Write a detailed note, or tag a quick note with a section.
      </EmptyState>
    );
  }
  return (
    <div className="note-groups">
      {groups.map((g) => (
        <section key={g.section} className="panel note-group">
          <h3>{g.section}</h3>
          <ul>
            {g.items.map((it, i) => (
              <li key={`${it.note.id}-${i}`}>
                <span className="note-when">
                  {shortDate(dateInZone(it.note.timestamp))}
                  {it.note.kind === "quick" ? " · quick note" : ""}
                </span>
                <span className="note-text-shown">{it.text}</span>
                <button className="small icon-only" title="Edit" aria-label="Edit note" onClick={() => onEdit(it.note)}>
                  <Icon name="edit" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
