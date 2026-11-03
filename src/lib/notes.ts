// Notes about students and lessons (the Notes page), kept per class in
// notes.csv, one row per piece:
//   quick     a short note written during a lesson, with tags; one row
//   detailed  a dated entry about one student, a row per section filled in
//   formF     the IEB Form F teacher comment, a row per field (see formF.ts)
// The rows of one entry share its id and move together when two copies of the
// file are joined.

export type NoteKind = "quick" | "detailed" | "formF";

export interface Note {
  id: string;
  /** When it was written (detailed notes and Form F: the date chosen for it). ISO 8601, UTC. */
  timestamp: string;
  /** "" = about the whole lesson (quick notes only). */
  studentId: string;
  kind: NoteKind;
  /** A quick note's text. */
  text: string;
  /** A quick note's tags: names from the shared sections list. */
  tags: string[];
  /** A detailed note's text per section, or a Form F's value per field. */
  sections: Record<string, string>;
}

/** One line of notes.csv. */
export interface NoteRow {
  id: string;
  timestamp: string;
  studentId: string;
  kind: NoteKind;
  section: string;
  text: string;
  tags: string;
}

/** The shared list: a detailed note's sections, and a quick note's tags. */
export const DEFAULT_NOTE_SECTIONS = [
  "Work ethic",
  "Behaviour",
  "Assessment",
  "Homework",
  "Attendance",
  "Parent contact",
  "Wellbeing",
  "Follow up",
];

const KINDS: NoteKind[] = ["quick", "detailed", "formF"];
export const asKind = (k: string): NoteKind => (KINDS.includes(k as NoteKind) ? (k as NoteKind) : "quick");

/** "Behaviour;Homework" → ["Behaviour", "Homework"]. */
export const splitTags = (tags: string): string[] =>
  tags
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);

/** The rows of the file as notes, in file order (each entry where its first row was). */
export function rowsToNotes(rows: NoteRow[]): Note[] {
  const byId = new Map<string, Note>();
  for (const r of rows) {
    if (!r.id) continue;
    let n = byId.get(r.id);
    if (!n) {
      n = { id: r.id, timestamp: r.timestamp, studentId: r.studentId, kind: r.kind, text: "", tags: [], sections: {} };
      byId.set(r.id, n);
    }
    if (n.kind === "quick") {
      n.text = r.text;
      n.tags = splitTags(r.tags);
    } else if (r.section) {
      n.sections[r.section] = r.text;
    }
  }
  return [...byId.values()];
}

/** The notes as rows: one for a quick note, one per filled section or field otherwise. */
export function notesToRows(notes: Note[]): NoteRow[] {
  const rows: NoteRow[] = [];
  for (const n of notes) {
    const base = { id: n.id, timestamp: n.timestamp, studentId: n.studentId, kind: n.kind };
    if (n.kind === "quick") {
      rows.push({ ...base, section: "", text: n.text, tags: n.tags.join(";") });
      continue;
    }
    const filled = Object.entries(n.sections).filter(([, text]) => text.trim() !== "");
    // An entry with nothing in it still keeps its place (and its date).
    if (filled.length === 0) rows.push({ ...base, section: "", text: "", tags: "" });
    for (const [section, text] of filled) rows.push({ ...base, section, text, tags: "" });
  }
  return rows;
}

/** A detailed note's sections in the list's order, then any no longer in the list. */
export function orderedSections(note: Note, list: string[]): Array<[string, string]> {
  const filled = Object.entries(note.sections).filter(([, t]) => t.trim() !== "");
  const known = list.filter((s) => note.sections[s]?.trim());
  const rest = filled.map(([s]) => s).filter((s) => !list.includes(s));
  return [...known, ...rest].map((s) => [s, note.sections[s]]);
}

/** Newest first. */
export const byNewest = (a: Note, b: Note) => b.timestamp.localeCompare(a.timestamp);

export interface SectionItem {
  note: Note;
  /** The text to show under the section: a detailed note's section, or a quick note's text. */
  text: string;
}

/**
 * One student's notes gathered under each section, newest first: a detailed
 * note's text for that section, and quick notes tagged with it. Quick notes
 * with no tag (or only tags no longer in the list) go under "Other". Sections
 * with nothing in them are left out. Form F entries aren't sections.
 */
export function notesBySection(notes: Note[], studentId: string, list: string[]): Array<{ section: string; items: SectionItem[] }> {
  const mine = notes.filter((n) => n.studentId === studentId && n.kind !== "formF").sort(byNewest);
  const groups = new Map<string, SectionItem[]>();
  const add = (section: string, item: SectionItem) => groups.set(section, [...(groups.get(section) ?? []), item]);
  for (const n of mine) {
    if (n.kind === "detailed") {
      for (const [section, text] of orderedSections(n, list)) add(section, { note: n, text });
    } else {
      const tags = n.tags.filter((t) => list.includes(t));
      if (tags.length === 0) add("Other", { note: n, text: n.text });
      for (const t of tags) add(t, { note: n, text: n.text });
    }
  }
  const order = [...list, ...[...groups.keys()].filter((s) => !list.includes(s) && s !== "Other"), "Other"];
  return order.filter((s) => groups.has(s)).map((section) => ({ section, items: groups.get(section)! }));
}

/** Whether a note mentions some text (any of its parts), ignoring case. */
export function noteMatches(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [note.text, ...note.tags, ...Object.keys(note.sections), ...Object.values(note.sections)].some((t) =>
    t.toLowerCase().includes(q),
  );
}

/** Whether a note belongs under a section: a detailed note with that section filled, or a quick note tagged with it. */
export function noteInSection(note: Note, section: string): boolean {
  if (note.kind === "quick") return note.tags.includes(section);
  if (note.kind === "detailed") return !!note.sections[section]?.trim();
  return false;
}

/** Renamed sections carried into notes: detailed notes' section names and quick notes' tags. */
export function renameSectionInNotes(notes: Note[], from: string, to: string): Note[] {
  return notes.map((n) => {
    if (n.kind === "quick") return n.tags.includes(from) ? { ...n, tags: n.tags.map((t) => (t === from ? to : t)) } : n;
    if (n.kind === "detailed" && from in n.sections) {
      const sections: Record<string, string> = {};
      for (const [s, t] of Object.entries(n.sections)) sections[s === from ? to : s] = t;
      return { ...n, sections };
    }
    return n;
  });
}
