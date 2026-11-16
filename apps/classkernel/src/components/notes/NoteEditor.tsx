import { useAppPick } from "../../store/appStore";
import QuickNoteDialog from "./QuickNoteDialog";
import DetailedNoteDialog from "./DetailedNoteDialog";
import FormFDialog from "./FormFDialog";
import FormFPreview from "./FormFPreview";

/**
 * Whichever note box is open (store.noteEditor): a quick note, a detailed note
 * or a Form F, or a Form F laid out to print. It sits over every screen, so a
 * seat's Note button works in teaching mode too.
 */
export default function NoteEditor() {
  const { noteEditor, notes, closeNoteEditor } = useAppPick("noteEditor", "notes", "closeNoteEditor");
  if (!noteEditor) return null;
  // A fresh box each time one opens, so it starts from that note (or draft).
  const key = `${noteEditor.kind}|${noteEditor.studentId}|${noteEditor.noteId ?? "new"}|${noteEditor.print ? "print" : ""}`;
  if (noteEditor.print) {
    const note = notes.find((n) => n.id === noteEditor.noteId);
    return note ? <FormFPreview key={key} note={note} onClose={closeNoteEditor} /> : null;
  }
  if (noteEditor.kind === "detailed") return <DetailedNoteDialog key={key} request={noteEditor} />;
  if (noteEditor.kind === "formF") return <FormFDialog key={key} request={noteEditor} />;
  return <QuickNoteDialog key={key} request={noteEditor} />;
}
