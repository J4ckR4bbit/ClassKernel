import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { BehaviourCode, CognitiveLevel, DEFAULT_TOPIC_AREAS, SeatingPrefs, Student, TopicEntry, studentName } from "../lib/types";
import { areasForGrade, gradesInTopics, subtopicsForGrade } from "../lib/topics";
import RosterView from "./RosterView";
import LayoutDesigner from "./LayoutDesigner";

type SettingsTab = "general" | "students" | "layout" | "seating" | "assessments";

const TABS: Array<{ id: SettingsTab; label: string; perClass: boolean }> = [
  { id: "general", label: "General", perClass: false },
  { id: "students", label: "Students", perClass: true },
  { id: "layout", label: "Room layout", perClass: true },
  { id: "seating", label: "Seating rules", perClass: true },
  { id: "assessments", label: "Assessments", perClass: false },
];

export default function SettingsView() {
  const { classes, currentClass, openClass } = useApp();
  const active = useMemo(() => classes.filter((c) => !c.archived), [classes]);
  const [tab, setTab] = useState<SettingsTab>("general");
  const perClass = TABS.find((t) => t.id === tab)?.perClass;

  return (
    <div>
      <div className="view-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`settings-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {perClass && active.length > 0 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted">Editing class:</span>
          <select value={currentClass ?? ""} onChange={(e) => void openClass(e.target.value)}>
            {!currentClass && <option value="">— pick a class —</option>}
            {active.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === "general" && <GeneralSettings />}
      {tab === "assessments" && <AssessmentSettings />}
      {perClass &&
        (active.length === 0 ? (
          <div className="panel muted">Create a class first, then set it up here.</div>
        ) : !currentClass ? (
          <div className="panel muted">Pick a class above to edit its {TABS.find((t) => t.id === tab)?.label.toLowerCase()}.</div>
        ) : tab === "students" ? (
          <RosterView />
        ) : tab === "layout" ? (
          <LayoutDesigner />
        ) : (
          <ClassSeatingSettings />
        ))}
    </div>
  );
}

function GeneralSettings() {
  const { behaviourCodes, setBehaviourCodes, dataDir, classes } = useApp();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const update = (code: string, patch: Partial<BehaviourCode>) => {
    void setBehaviourCodes(behaviourCodes.map((c) => (c.code === code ? { ...c, ...patch } : c)));
  };

  // Reorder by drag: the array order is the button order everywhere (and how
  // it's written to behaviours.csv), so moving a row persists immediately.
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...behaviourCodes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void setBehaviourCodes(next);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const add = (kind: "positive" | "negative") => {
    const code = prompt("Short code for the new behaviour (e.g. KIND):")?.trim().toUpperCase();
    if (!code || behaviourCodes.some((c) => c.code === code)) return;
    void setBehaviourCodes([
      ...behaviourCodes,
      { code, label: code, kind, points: kind === "positive" ? 1 : -1, color: kind === "positive" ? "#2e9e5b" : "#d65c5c" },
    ]);
  };

  const remove = (code: string) => {
    if (!confirm(`Remove behaviour "${code}"? Existing logged events keep their points.`)) return;
    void setBehaviourCodes(behaviourCodes.filter((c) => c.code !== code));
  };

  return (
    <>
      <div className="panel">
        <h3>Behaviour buttons</h3>
        <p className="muted">
          These are the buttons shown on the seating plan during a lesson. Shared across all your classes (stored in{" "}
          <code>behaviours.csv</code>). Drag the <span aria-hidden>⠿</span> handle to reorder them.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 26 }}></th>
              <th style={{ width: 90 }}>Code</th>
              <th>Label</th>
              <th style={{ width: 110 }}>Type</th>
              <th style={{ width: 90 }}>Points</th>
              <th style={{ width: 90 }}>Color</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {behaviourCodes.map((c, i) => (
              <tr
                key={c.code}
                className={`${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "drag-over" : ""}`}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  endDrag();
                }}
              >
                <td
                  className="drag-handle"
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={endDrag}
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                >
                  ⠿
                </td>
                <td>
                  <b>{c.code}</b>
                </td>
                <td>
                  <input value={c.label} onChange={(e) => update(c.code, { label: e.target.value })} />
                </td>
                <td>
                  <select
                    value={c.kind}
                    onChange={(e) => update(c.code, { kind: e.target.value as "positive" | "negative" })}
                  >
                    <option value="positive">positive</option>
                    <option value="negative">negative</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    style={{ width: 64 }}
                    value={c.points}
                    onChange={(e) => update(c.code, { points: Number(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => update(c.code, { color: e.target.value })}
                    style={{ padding: 1, width: 44, height: 28 }}
                  />
                </td>
                <td>
                  <button className="small danger" onClick={() => remove(c.code)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={() => add("positive")}>+ Positive behaviour</button>
          <button onClick={() => add("negative")}>+ Negative behaviour</button>
        </div>
      </div>

      <div className="panel">
        <h3>Data</h3>
        <p>
          Data folder: <code>{dataDir}</code>
        </p>
        <p className="muted">
          Everything lives in plain .csv / .md files in that folder — open them in Excel or Notepad any time. Put the
          folder inside OneDrive or Google Drive and the sync client backs it up automatically. A snapshot copy is
          made into <code>backups/</code> every time the app starts (the newest 14 are kept).
        </p>
        <p className="muted">
          Classes: {classes.filter((c) => !c.archived).length} active, {classes.filter((c) => c.archived).length}{" "}
          archived. Archived classes stay on disk in <code>classes/</code>; restore them from Class notes.
        </p>
      </div>
    </>
  );
}

/**
 * Per-class random-seating rules. Kept here in Settings (rather than on the
 * seating plan) so the constraints stay out of sight of the class — students
 * only ever see the "Randomise" button reroll.
 */
function ClassSeatingSettings() {
  const { students, seatingPrefs, setSeatingPrefs } = useApp();
  return <SeatingPrefsEditor students={students} prefs={seatingPrefs} onChange={setSeatingPrefs} />;
}

function SeatingPrefsEditor({
  students,
  prefs,
  onChange,
}: {
  students: Student[];
  prefs: SeatingPrefs;
  onChange: (prefs: SeatingPrefs) => void | Promise<void>;
}) {
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");

  const nameOf = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? studentName(s) : id;
  };

  const addPair = (kind: "apart" | "together") => {
    if (!pairA || !pairB || pairA === pairB) return;
    const pair: [string, string] = [pairA, pairB];
    if (kind === "apart") void onChange({ ...prefs, apartPairs: [...prefs.apartPairs, pair] });
    else void onChange({ ...prefs, togetherPairs: [...prefs.togetherPairs, pair] });
    setPairA("");
    setPairB("");
  };

  const toggleFront = (id: string) =>
    void onChange({
      ...prefs,
      frontIds: prefs.frontIds.includes(id) ? prefs.frontIds.filter((f) => f !== id) : [...prefs.frontIds, id],
    });

  if (students.length === 0) {
    return (
      <div className="panel">
        <p className="muted">Add students to this class first, then set up its seating rules here.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Random seating rules</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        These rules are applied every time you press <b>Randomise</b> on the seating plan. They are saved per class and
        stay here in Settings, so the class never sees who is being kept apart or moved to the front.
      </p>

      <b>Keep students together or apart</b>
      <div className="row" style={{ margin: "8px 0" }}>
        <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
          <option value="">— student —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {studentName(s)}
            </option>
          ))}
        </select>
        <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
          <option value="">— student —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {studentName(s)}
            </option>
          ))}
        </select>
        <button onClick={() => addPair("apart")} disabled={!pairA || !pairB || pairA === pairB}>
          Keep apart
        </button>
        <button onClick={() => addPair("together")} disabled={!pairA || !pairB || pairA === pairB}>
          Keep together
        </button>
      </div>

      {(prefs.apartPairs.length > 0 || prefs.togetherPairs.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          {prefs.apartPairs.map((p, i) => (
            <span
              key={`a${i}`}
              className="tag warn"
              style={{ cursor: "pointer" }}
              onClick={() => onChange({ ...prefs, apartPairs: prefs.apartPairs.filter((_, j) => j !== i) })}
              title="Click to remove"
            >
              ⇹ {nameOf(p[0])} ↔ {nameOf(p[1])} ✕
            </span>
          ))}
          {prefs.togetherPairs.map((p, i) => (
            <span
              key={`t${i}`}
              className="tag"
              style={{ cursor: "pointer" }}
              onClick={() => onChange({ ...prefs, togetherPairs: prefs.togetherPairs.filter((_, j) => j !== i) })}
              title="Click to remove"
            >
              ⇆ {nameOf(p[0])} + {nameOf(p[1])} ✕
            </span>
          ))}
        </div>
      )}

      <b>Sit near the front</b>{" "}
      <span className="muted">click students who should be pinned to the front band of the room</span>
      <div className="roster-chips" style={{ margin: "8px 0 12px" }}>
        {students.map((s) => (
          <span
            key={s.id}
            className={`chip ${prefs.frontIds.includes(s.id) ? "selected" : ""}`}
            onClick={() => toggleFront(s.id)}
          >
            {studentName(s)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * App-wide assessment settings: the per-grade topic bank used by question
 * dropdowns, the editable cognitive-level list, and the marking-grid key
 * behaviour. All shared across classes.
 */
function AssessmentSettings() {
  const { classes, topics, setTopics, cognitiveLevels, setCognitiveLevels, userPrefs, setUserPrefs } = useApp();

  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const c of classes) if (c.year) set.add(c.year);
    for (const g of gradesInTopics(topics)) set.add(g);
    return [...set].sort();
  }, [classes, topics]);

  const [pickedGrade, setPickedGrade] = useState("");
  const grade = pickedGrade || grades[0] || "";
  const areas = areasForGrade(topics, grade);

  const addGrade = () => {
    const g = prompt("Grade / year (e.g. 8 or 12):")?.trim();
    if (!g) return;
    setPickedGrade(g);
    if (!areasForGrade(topics, g).length) {
      void setTopics([...topics, ...DEFAULT_TOPIC_AREAS.map((area) => ({ grade: g, area, subtopic: "", short: "" }))]);
    }
  };

  const addArea = () => {
    const area = prompt("New content area (e.g. Chemistry):")?.trim();
    if (!area || !grade || topics.some((t) => t.grade === grade && t.area === area)) return;
    void setTopics([...topics, { grade, area, subtopic: "", short: "" }]);
  };

  const removeArea = (area: string) => {
    if (!confirm(`Remove "${area}" and its subtopics for grade ${grade}?`)) return;
    void setTopics(topics.filter((t) => !(t.grade === grade && t.area === area)));
  };

  const addSubtopic = (area: string) => {
    const subtopic = prompt(`New subtopic under ${area}:`)?.trim();
    if (!subtopic || topics.some((t) => t.grade === grade && t.area === area && t.subtopic === subtopic)) return;
    const short = prompt("Short label shown in the marking grid (optional):")?.trim() ?? "";
    // drop the area placeholder now that it has a real subtopic
    const cleaned = topics.filter((t) => !(t.grade === grade && t.area === area && t.subtopic === ""));
    void setTopics([...cleaned, { grade, area, subtopic, short }]);
  };

  const removeSubtopic = (area: string, subtopic: string) => {
    let next = topics.filter((t) => !(t.grade === grade && t.area === area && t.subtopic === subtopic));
    if (!next.some((t) => t.grade === grade && t.area === area)) {
      next = [...next, { grade, area, subtopic: "", short: "" } as TopicEntry];
    }
    void setTopics(next);
  };

  const updateLevel = (i: number, patch: Partial<CognitiveLevel>) =>
    void setCognitiveLevels(cognitiveLevels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLevel = () => void setCognitiveLevels([...cognitiveLevels, { code: `L${cognitiveLevels.length + 1}`, label: "" }]);
  const removeLevel = (i: number) => void setCognitiveLevels(cognitiveLevels.filter((_, j) => j !== i));

  return (
    <>
      <div className="panel">
        <h3>Assessable topics by grade</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Shared across all classes and used to tag each question. Grade comes from a class's Year. Stored in{" "}
          <code>topics.csv</code>.
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="muted">Grade:</span>
          <select value={grade} onChange={(e) => setPickedGrade(e.target.value)}>
            {grades.length === 0 && <option value="">— none —</option>}
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button className="small" onClick={addGrade}>
            + Grade
          </button>
        </div>

        {!grade ? (
          <p className="muted">Add a grade to start building its topic list.</p>
        ) : (
          <>
            {areas.map((area) => (
              <div key={area} style={{ marginBottom: 12 }}>
                <div className="row">
                  <b>{area}</b>
                  <button className="small danger" onClick={() => removeArea(area)}>
                    ✕
                  </button>
                </div>
                <div className="roster-chips" style={{ margin: "6px 0" }}>
                  {subtopicsForGrade(topics, grade, area).map((s) => (
                    <span
                      key={s.subtopic}
                      className="chip"
                      style={{ cursor: "pointer" }}
                      title={s.short ? `short: ${s.short} — click to remove` : "click to remove"}
                      onClick={() => removeSubtopic(area, s.subtopic)}
                    >
                      {s.subtopic}
                      {s.short ? ` (${s.short})` : ""} ✕
                    </span>
                  ))}
                  <button className="small" onClick={() => addSubtopic(area)}>
                    + subtopic
                  </button>
                </div>
              </div>
            ))}
            <button onClick={addArea}>+ Content area</button>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Cognitive levels</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Offered when tagging each question. Stored in <code>cognitive_levels.csv</code>.
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Code</th>
              <th>Label</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {cognitiveLevels.map((l, i) => (
              <tr key={i}>
                <td>
                  <input value={l.code} onChange={(e) => updateLevel(i, { code: e.target.value })} />
                </td>
                <td>
                  <input value={l.label} onChange={(e) => updateLevel(i, { label: e.target.value })} />
                </td>
                <td>
                  <button className="small danger" onClick={() => removeLevel(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={addLevel}>+ Level</button>
        </div>
      </div>

      <div className="panel">
        <h3>Mark entry</h3>
        <label className="row">
          <span>After typing a mark in the grid, Enter moves</span>
          <select value={userPrefs.markGridEnter} onChange={(e) => void setUserPrefs({ ...userPrefs, markGridEnter: e.target.value as "across" | "down" })}>
            <option value="across">across (to the next question)</option>
            <option value="down">down (to the next student)</option>
          </select>
        </label>
        <p className="muted" style={{ marginBottom: 0 }}>
          Tab always moves the other way. Arrow keys move one cell.
        </p>
      </div>
    </>
  );
}
