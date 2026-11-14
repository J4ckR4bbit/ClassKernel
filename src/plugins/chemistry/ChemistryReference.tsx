import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import Segmented from "../../components/Segmented";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import { Element } from "./elements";
import ElementDialog from "./ElementDialog";
import PeriodicTable, { TableView } from "./PeriodicTable";
import "./chemistry.css";

type Module = "elements" | "substances" | "ions" | "more";

const MODULES: Array<{ key: Module; label: string; ready: boolean }> = [
  { key: "elements", label: "Periodic table", ready: true },
  { key: "substances", label: "Substances & bonds", ready: false },
  { key: "ions", label: "Polyatomic ions", ready: false },
  { key: "more", label: "More", ready: false },
];

/**
 * Chemistry reference: the periodic table (and, in later stages, substances
 * and their bonds, polyatomic ions and more), each a tab across the top.
 */
export default function ChemistryReference() {
  const [module, setModule] = useState<Module>("elements");
  const [view, setView] = useState<TableView>("full");
  const [selected, setSelected] = useState<Element | null>(null);
  const [classView, setClassView] = useState(false);

  // The class view owns the screen; Escape (or ✕) hands it back.
  const openClassView = () => {
    setClassView(true);
    void enterFullscreen();
  };
  const closeClassView = useCallback(() => {
    setClassView(false);
    void restoreWindow();
  }, []);
  useEffect(() => {
    if (!classView) return;
    const onKey = (e: KeyboardEvent) => {
      // A dialog on top takes Escape first.
      if (e.key === "Escape" && !document.querySelector('[aria-modal="true"]')) closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  return (
    <div className={`chemistry ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="md-tabs" role="tablist" aria-label="Chemistry reference">
          {MODULES.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={module === m.key}
              className={`md-tab ${module === m.key ? "active" : ""}`}
              disabled={!m.ready}
              title={m.ready ? undefined : "Coming in the next stage"}
              onClick={() => setModule(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {module === "elements" && (
        <div className="chem-module">
          <div className="chem-bar">
            <Segmented
              label="Which table"
              options={[
                { value: "full", label: "Full table" },
                { value: "simplified", label: "Simplified" },
              ]}
              value={view}
              onChange={setView}
            />
            <span className="muted chem-hint">
              {view === "full" ? "All 118 elements. Tap one for its details." : "The first 20 elements and the ones the course keeps meeting."}
            </span>
            <span className="grow" />
            {classView ? (
              <button onClick={closeClassView} title="Back (Esc)">
                <Icon name="close" size={20} /> Close
              </button>
            ) : (
              <button onClick={openClassView} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            )}
          </div>
          <PeriodicTable view={view} onSelect={setSelected} selected={selected} />
        </div>
      )}

      {selected && <ElementDialog element={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
