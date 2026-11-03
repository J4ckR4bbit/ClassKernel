import { beforeEach, describe, expect, it } from "vitest";
import { MemFS, setFS } from "./fs";
import * as repo from "./repo";
import { DEFAULT_NOTE_SECTIONS, Note, noteInSection, noteMatches, notesBySection, notesToRows, renameSectionInNotes, rowsToNotes } from "./notes";
import { FORM_F_QUESTIONS, formFAnswered } from "./formF";

const quick = (id: string, studentId: string, text: string, tags: string[] = [], timestamp = `2026-10-0${id.length}T08:00:00.000Z`): Note => ({
  id,
  timestamp,
  studentId,
  kind: "quick",
  text,
  tags,
  sections: {},
});
const detailed = (id: string, studentId: string, sections: Record<string, string>, timestamp: string): Note => ({
  id,
  timestamp,
  studentId,
  kind: "detailed",
  text: "",
  tags: [],
  sections,
});

describe("notes as rows", () => {
  it("keeps a quick note on one row and a detailed note on a row per filled section", () => {
    const notes = [
      quick("q1", "s1", "Forgot calculator", ["Homework", "Assessment"]),
      detailed("d1", "s2", { "Work ethic": "Steady", Behaviour: "", Assessment: "Strong" }, "2026-10-05T10:00:00.000Z"),
    ];
    const rows = notesToRows(notes);
    expect(rows.map((r) => [r.id, r.section, r.text, r.tags])).toEqual([
      ["q1", "", "Forgot calculator", "Homework;Assessment"],
      ["d1", "Work ethic", "Steady", ""],
      ["d1", "Assessment", "Strong", ""],
    ]);
    expect(rowsToNotes(rows)).toEqual([
      notes[0],
      { ...notes[1], sections: { "Work ethic": "Steady", Assessment: "Strong" } },
    ]);
  });

  it("round-trips through notes.csv, Form F too, and joins two copies by entry", async () => {
    setFS(new MemFS());
    const dir = "/data";
    await repo.ensureDataDir(dir);
    await repo.saveClassInfo(dir, { name: "7B", year: "7", subject: "", room: "", notes: "", archived: false, color: "" });
    const formF: Note = {
      id: "f1",
      timestamp: "2026-10-06T10:00:00.000Z",
      studentId: "s1",
      kind: "formF",
      text: "",
      tags: [],
      sections: { name: "Amelia Adams", applied_for: "Extra time", q_reading: "Yes", q_spelling: "No" },
    };
    const notes = [quick("q1", "", "Fire drill, finish next lesson", [], "2026-10-01T08:00:00.000Z"), formF];
    await repo.saveNotes(dir, "7B", notes);
    expect(await repo.loadNotes(dir, "7B")).toEqual(notes);
    expect(formFAnswered(formF.sections)).toBe(2);
    expect(FORM_F_QUESTIONS).toHaveLength(11);
    expect(repo.mergeRuleFor("classes/7B/notes.csv")).toMatchObject({ kind: "grouped", group: ["id"] });
    expect(repo.mergeRuleFor("note_sections.csv")).toEqual({ kind: "whole" });
  });
});

describe("the shared sections list", () => {
  beforeEach(() => setFS(new MemFS()));

  it("starts with the defaults, and keeps the teacher's own", async () => {
    expect(await repo.loadNoteSections("/data")).toEqual(DEFAULT_NOTE_SECTIONS);
    await repo.saveNoteSections("/data", ["Practical work", "Behaviour"]);
    expect(await repo.loadNoteSections("/data")).toEqual(["Practical work", "Behaviour"]);
  });

  it("renames a section in detailed notes and quick notes' tags", () => {
    const notes = [
      quick("q1", "s1", "x", ["Behaviour", "Homework"]),
      detailed("d1", "s1", { Behaviour: "Settled", Assessment: "Fine" }, "2026-10-05T10:00:00.000Z"),
      quick("q2", "s1", "y", ["Homework"]),
    ];
    const renamed = renameSectionInNotes(notes, "Behaviour", "Conduct");
    expect(renamed[0].tags).toEqual(["Conduct", "Homework"]);
    expect(renamed[1].sections).toEqual({ Conduct: "Settled", Assessment: "Fine" });
    expect(renamed[2]).toBe(notes[2]); // untouched notes stay the same object
  });
});

describe("a student's notes by section", () => {
  const list = ["Work ethic", "Behaviour", "Assessment"];
  const notes = [
    detailed("d1", "s1", { Behaviour: "Chatty", Assessment: "55%" }, "2026-10-05T10:00:00.000Z"),
    quick("q1", "s1", "Moved to the front", ["Behaviour"], "2026-10-07T08:00:00.000Z"),
    quick("q2", "s1", "Untagged thought", [], "2026-10-03T08:00:00.000Z"),
    quick("q3", "s2", "Someone else", ["Behaviour"], "2026-10-08T08:00:00.000Z"),
  ];

  it("gathers detailed sections and tagged quick notes under each section, newest first", () => {
    const groups = notesBySection(notes, "s1", list);
    expect(groups.map((g) => g.section)).toEqual(["Behaviour", "Assessment", "Other"]);
    expect(groups[0].items.map((i) => i.text)).toEqual(["Moved to the front", "Chatty"]);
    expect(groups[2].items.map((i) => i.text)).toEqual(["Untagged thought"]);
  });

  it("filters by section and search", () => {
    expect(noteInSection(notes[0], "Assessment")).toBe(true);
    expect(noteInSection(notes[1], "Assessment")).toBe(false);
    expect(noteMatches(notes[0], "55")).toBe(true);
    expect(noteMatches(notes[1], "FRONT")).toBe(true);
    expect(noteMatches(notes[1], "absent")).toBe(false);
  });
});
