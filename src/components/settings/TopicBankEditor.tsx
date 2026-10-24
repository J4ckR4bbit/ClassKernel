import { useState } from "react";
import { useAppPick } from "../../store/appStore";
import { DEFAULT_TOPIC_AREAS, TopicEntry } from "../../lib/types";
import { gradeLabel, joinAnd } from "../../lib/format";
import {
  TopicBank,
  areasForGrade,
  deleteGrade,
  shareTopics,
  subtopicsForGrade,
  topicGrade,
  topicGroup,
  parseTopicPaste,
  unshareTopics,
} from "../../lib/topics";
import Icon from "../Icon";

/**
 * The per-grade topic bank (topics.csv) that question dropdowns offer: grades,
 * content areas and their subtopics, and grades that share one list.
 */
export default function TopicBankEditor({ grades }: { grades: string[] }) {
  const { classes, topics, setTopics, userPrefs, setUserPrefs, showToast, confirmDialog, promptDialog } = useAppPick(
    "classes",
    "topics",
    "setTopics",
    "userPrefs",
    "setUserPrefs",
    "showToast",
    "confirmDialog",
    "promptDialog",
  );
  const links = userPrefs.topicLinks;

  const [pickedGrade, setPickedGrade] = useState("");
  const grade = pickedGrade || grades[0] || "";
  // The grade whose rows hold this grade's list: itself, or the grade it shares with.
  const list = topicGrade(links, grade);
  const group = topicGroup(links, grade);
  const groupLabel = joinAnd(group.map(gradeLabel));
  const areas = areasForGrade(topics, list);

  const saveBank = (bank: TopicBank) => {
    if (bank.topics !== topics) void setTopics(bank.topics);
    if (bank.links !== links) void setUserPrefs({ ...userPrefs, topicLinks: bank.links });
  };

  const addGrade = async () => {
    const g = (await promptDialog({ title: "Add a grade / year", placeholder: "e.g. 8 or 12" }))?.trim();
    if (!g) return;
    setPickedGrade(g);
    if (!areasForGrade(topics, topicGrade(links, g)).length) {
      void setTopics([...topics, ...DEFAULT_TOPIC_AREAS.map((area) => ({ grade: g, area, subtopic: "", short: "" }))]);
    }
  };

  const removeGrade = async () => {
    const usedBy = classes.filter((c) => c.year === grade).map((c) => c.name);
    const others = group.filter((g) => g !== grade);
    const own = list === grade ? subtopicsForGrade(topics, grade).length : 0;
    const body = [
      list !== grade
        ? `It only shares ${gradeLabel(list)}'s topics, which stay as they are.`
        : others.length
          ? `${joinAnd(others.map(gradeLabel))} keep${others.length === 1 ? "s" : ""} its topics.`
          : own
            ? `Its ${own} subtopic${own === 1 ? " is" : "s are"} removed.`
            : "",
      usedBy.length
        ? `${joinAnd(usedBy)} still ${usedBy.length === 1 ? "has" : "have"} this grade, so it stays in the list until that is changed on the Class notes page.`
        : "",
    ];
    const ok = await confirmDialog({
      title: `Delete grade ${gradeLabel(grade)}?`,
      body: body.filter(Boolean).join(" ") || undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    saveBank(deleteGrade({ topics, links }, grade));
    setPickedGrade("");
  };

  const shareWith = async (source: string) => {
    if (!source) {
      saveBank(unshareTopics({ topics, links }, grade));
      showToast(`${gradeLabel(grade)} has its own copy of the topics now`);
      return;
    }
    const own = list === grade ? subtopicsForGrade(topics, grade).length : 0;
    if (own) {
      const movers = group.length > 1 ? joinAnd(group.map(gradeLabel)) : gradeLabel(grade);
      const ok = await confirmDialog({
        title: `Use ${gradeLabel(source)}'s topics?`,
        body: `${movers} will use ${gradeLabel(source)}'s list, and ${gradeLabel(grade)}'s own ${own} subtopic${own === 1 ? " is" : "s are"} removed.`,
        confirmLabel: "Use the same topics",
        danger: true,
      });
      if (!ok) return;
    }
    saveBank(shareTopics({ topics, links }, grade, source));
  };

  const addArea = async () => {
    const area = (await promptDialog({ title: "New content area", placeholder: "e.g. Chemistry" }))?.trim();
    if (!area || !list || topics.some((t) => t.grade === list && t.area === area)) return;
    void setTopics([...topics, { grade: list, area, subtopic: "", short: "" }]);
  };

  const removeArea = async (area: string) => {
    const ok = await confirmDialog({
      title: `Remove "${area}"?`,
      body: `The area and its subtopics are removed for ${group.length > 1 ? groupLabel : `grade ${grade}`}.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    void setTopics(topics.filter((t) => !(t.grade === list && t.area === area)));
  };

  // Add one or many subtopics to an area (used by the table's row + paste input).
  const addSubtopics = (area: string, rows: Array<{ subtopic: string; short: string }>) => {
    const existing = new Set(subtopicsForGrade(topics, list, area).map((s) => s.subtopic));
    const toAdd: TopicEntry[] = [];
    for (const r of rows) {
      const subtopic = r.subtopic.trim();
      if (!subtopic || existing.has(subtopic) || toAdd.some((t) => t.subtopic === subtopic)) continue;
      toAdd.push({ grade: list, area, subtopic, short: r.short.trim() });
    }
    if (toAdd.length === 0) return;
    // drop the area placeholder now that it has real subtopics
    const cleaned = topics.filter((t) => !(t.grade === list && t.area === area && t.subtopic === ""));
    void setTopics([...cleaned, ...toAdd]);
  };

  const renameSubtopic = (area: string, oldSub: string, raw: string) => {
    const newSub = raw.trim();
    if (!newSub || newSub === oldSub) return;
    if (topics.some((t) => t.grade === list && t.area === area && t.subtopic === newSub)) {
      showToast(`"${newSub}" already exists in ${area}`);
      return;
    }
    void setTopics(
      topics.map((t) => (t.grade === list && t.area === area && t.subtopic === oldSub ? { ...t, subtopic: newSub } : t)),
    );
  };

  const setShort = (area: string, subtopic: string, short: string) =>
    void setTopics(
      topics.map((t) => (t.grade === list && t.area === area && t.subtopic === subtopic ? { ...t, short: short.trim() } : t)),
    );

  const removeSubtopic = (area: string, subtopic: string) => {
    let next = topics.filter((t) => !(t.grade === list && t.area === area && t.subtopic === subtopic));
    if (!next.some((t) => t.grade === list && t.area === area)) {
      next = [...next, { grade: list, area, subtopic: "", short: "" } as TopicEntry];
    }
    void setTopics(next);
  };

  // Grades this one can share with: any other grade that keeps its own list.
  const sources = grades.filter((g) => g !== grade && !links[g]);

  return (
    <div className="panel">
      <h3>Assessable topics by grade</h3>
      <p className="muted lead">
        Shared across all classes and used to tag each question. Each class's grade is set on its Class notes page. Stored in{" "}
        <code>topics.csv</code>.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">Grade:</span>
        <select value={grade} onChange={(e) => setPickedGrade(e.target.value)} aria-label="Grade">
          {grades.length === 0 && <option value="">— none —</option>}
          {grades.map((g) => (
            <option key={g} value={g}>
              {gradeLabel(g)}
            </option>
          ))}
        </select>
        {grade && (
          <button className="icon-only small danger" onClick={() => void removeGrade()} title="Delete grade">
            <Icon name="close" size={18} />
          </button>
        )}
        <button className="small" onClick={() => void addGrade()}>
          <Icon name="add" size={20} /> Grade
        </button>
        {grade && (links[grade] || sources.length > 0) && (
          <label className="row topic-share">
            <span className="muted">Same topics as:</span>
            <select value={list === grade ? "" : list} onChange={(e) => void shareWith(e.target.value)}>
              <option value="">— its own list —</option>
              {sources.map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!grade ? (
        <p className="muted">Add a grade to start building its topic list.</p>
      ) : (
        <>
          {group.length > 1 && (
            <p className="topic-shared-note">
              <Icon name="groups" size={18} /> One list for {groupLabel}: a change here changes it for all of them.
            </p>
          )}
          <p className="muted lead">
            Type subtopics into a table, or paste a column straight from a spreadsheet. Paste two tab-separated
            columns to fill Subtopic and Short at once.
          </p>
          {areas.map((area) => (
            <div key={area} className="topic-area">
              <div className="row">
                <b>{area}</b>
                <button className="icon-only small danger" onClick={() => void removeArea(area)} title="Delete content area">
                  <Icon name="close" size={18} />
                </button>
              </div>
              <TopicAreaTable
                rows={subtopicsForGrade(topics, list, area)}
                onRename={(oldSub, val) => renameSubtopic(area, oldSub, val)}
                onSetShort={(sub, val) => setShort(area, sub, val)}
                onRemove={(sub) => removeSubtopic(area, sub)}
                onAdd={(rows) => addSubtopics(area, rows)}
              />
            </div>
          ))}
          <button onClick={() => void addArea()}>
            <Icon name="add" size={20} /> Content area
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Editable, paste-friendly table of subtopics for one content area. Existing
 * rows commit on blur (rename / set short); the bottom row accepts a single
 * entry or a whole pasted column/spreadsheet selection.
 */
function TopicAreaTable({
  rows,
  onRename,
  onSetShort,
  onRemove,
  onAdd,
}: {
  rows: Array<{ subtopic: string; short: string }>;
  onRename: (oldSub: string, value: string) => void;
  onSetShort: (sub: string, value: string) => void;
  onRemove: (sub: string) => void;
  onAdd: (rows: Array<{ subtopic: string; short: string }>) => void;
}) {
  const [newSub, setNewSub] = useState("");
  const [newShort, setNewShort] = useState("");

  const addOne = () => {
    if (!newSub.trim()) return;
    onAdd([{ subtopic: newSub, short: newShort }]);
    setNewSub("");
    setNewShort("");
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text)) return; // single value → let the normal paste happen
    e.preventDefault();
    const parsed = parseTopicPaste(text);
    if (parsed.length) onAdd(parsed);
  };

  return (
    <table className="data topic-table">
      <thead>
        <tr>
          <th>Subtopic</th>
          <th style={{ width: 150 }}>Short label</th>
          <th style={{ width: 36 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.subtopic}>
            <td>
              <input
                key={`sub-${r.subtopic}`}
                defaultValue={r.subtopic}
                onBlur={(e) => {
                  // A successful rename remounts this row (its key changes); a
                  // rejected one leaves state untouched, so revert the field.
                  onRename(r.subtopic, e.target.value);
                  e.target.value = r.subtopic;
                }}
              />
            </td>
            <td>
              <input
                key={`short-${r.subtopic}`}
                defaultValue={r.short}
                placeholder="—"
                onBlur={(e) => onSetShort(r.subtopic, e.target.value)}
              />
            </td>
            <td>
              <button className="icon-only small danger" onClick={() => onRemove(r.subtopic)} title="Remove subtopic">
                <Icon name="close" size={18} />
              </button>
            </td>
          </tr>
        ))}
        <tr className="topic-add-row">
          <td>
            <input
              placeholder="add a subtopic — or paste a list"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOne();
                }
              }}
            />
          </td>
          <td>
            <input
              placeholder="short"
              value={newShort}
              onChange={(e) => setNewShort(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOne();
                }
              }}
            />
          </td>
          <td>
            <button className="small" onClick={addOne} title="Add subtopic">
              +
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
