import { useState } from "react";
import { useAppPick } from "../../store/appStore";
import { useRowReorder } from "../../hooks/useRowReorder";
import Segmented from "../Segmented";
import Icon from "../Icon";

const SIZES = [
  { value: 14, label: "S" },
  { value: 16, label: "M" },
  { value: 20, label: "L" },
  { value: 24, label: "XL" },
];

/**
 * How notes work, app-wide: the sections (Work ethic, Behaviour, …), which
 * are also the quick notes' tags, and the note boxes' text size.
 */
export default function NoteSettings() {
  const { noteSections, setNoteSections, renameNoteSection, userPrefs, setUserPrefs, showToast, confirmDialog } = useAppPick(
    "noteSections",
    "setNoteSections",
    "renameNoteSection",
    "userPrefs",
    "setUserPrefs",
    "showToast",
    "confirmDialog",
  );
  const [adding, setAdding] = useState("");

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...noteSections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void setNoteSections(next);
  };
  const reorder = useRowReorder<HTMLTableRowElement>(move);

  const commit = (from: string, raw: string): string => {
    const to = raw.trim();
    if (!to || to === from) return from;
    if (noteSections.includes(to)) {
      showToast(`There's already a section called "${to}"`);
      return from;
    }
    void renameNoteSection(from, to);
    return to;
  };

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    if (noteSections.includes(name)) {
      showToast(`There's already a section called "${name}"`);
      return;
    }
    void setNoteSections([...noteSections, name]);
    setAdding("");
  };

  const remove = async (name: string) => {
    const ok = await confirmDialog({
      title: `Remove the section "${name}"?`,
      body: "Notes already written keep it; it just isn't offered for new ones.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) void setNoteSections(noteSections.filter((s) => s !== name));
  };

  // A size that isn't one of the four (set with A− / A+ in a note box) shows none chosen.
  const sizeValue = SIZES.some((s) => s.value === userPrefs.noteTextSize) ? userPrefs.noteTextSize : -1;

  return (
    <div className="panel note-settings">
      <h3>Notes settings</h3>
      <h4>Sections and tags</h4>
      <p className="muted lead">
        A detailed note has a box for each of these; a quick note can be tagged with them. A quick note tagged{" "}
        <i>Behaviour</i> also shows under that student's Behaviour section. Shared by all your classes (
        <code>note_sections.csv</code>). Renaming one renames it in every note.
      </p>
      <table className="data fit">
        <tbody>
          {noteSections.map((s, i) => (
            <tr key={s} ref={reorder.rowRef(i)} className={reorder.rowClass(i)}>
              <td className="drag-handle" {...reorder.handle(i)} title="Drag to reorder" aria-label="Drag to reorder">
                ⠿
              </td>
              <td>
                <input
                  key={`section-${s}`}
                  defaultValue={s}
                  aria-label={`Section ${s}`}
                  onBlur={(e) => {
                    e.target.value = commit(s, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </td>
              <td style={{ width: 40 }}>
                <button className="icon-only small danger" onClick={() => void remove(s)} title="Remove section" aria-label={`Remove ${s}`}>
                  <Icon name="close" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row button-row">
        <input
          value={adding}
          placeholder="New section, e.g. Practical work"
          aria-label="New section"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button onClick={add} disabled={!adding.trim()}>
          <Icon name="add" size={20} /> Section
        </button>
      </div>

      <h4>Text size</h4>
      <p className="muted lead">How big the writing is in the note boxes. A− and A+ in a box change it too.</p>
      <Segmented
        label="Note text size"
        options={SIZES}
        value={sizeValue}
        onChange={(v) => void setUserPrefs({ ...userPrefs, noteTextSize: v })}
      />
    </div>
  );
}
