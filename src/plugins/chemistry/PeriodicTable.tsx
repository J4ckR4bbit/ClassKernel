import { useMemo, useState } from "react";
import Segmented from "../../components/Segmented";
import { formatFixed, formatNumber } from "../numbers";
import {
  CATEGORY_COLOURS,
  CATEGORY_NAMES,
  Category,
  ELEMENTS,
  Element,
  gridPosition,
  massInBrackets,
  metalCharacter,
  simplifiedPosition,
} from "./elements";

export type TableView = "full" | "simplified";
export type ColourBy = "category" | "state" | "metal";
export type Highlight = "diatomic" | "ferromagnetic" | "radioactive";

const STATE_COLOURS: Record<Element["state"], string> = { solid: "#dddddd", liquid: "#77aadd", gas: "#eedd88", unknown: "#f7f7f7" };
const STATE_NAMES: Record<Element["state"], string> = { solid: "Solid at 25 °C", liquid: "Liquid at 25 °C", gas: "Gas at 25 °C", unknown: "Unknown" };
const METAL_COLOURS = { metal: "#77aadd", metalloid: "#bbcc33", "non-metal": "#44bb99" };
const METAL_NAMES = { metal: "Metals", metalloid: "Metalloids", "non-metal": "Non-metals" };

const HIGHLIGHTS: Array<{ key: Highlight; label: string; test: (e: Element) => boolean }> = [
  { key: "diatomic", label: "Diatomic (X₂)", test: (e) => !!e.diatomic },
  { key: "ferromagnetic", label: "Ferromagnetic", test: (e) => !!e.ferromagnetic },
  { key: "radioactive", label: "Radioactive", test: (e) => !!e.radioactive },
];

/** The electronegativity as the data sheet prints it, or nothing. */
export function enText(e: Element): string {
  return e.en === undefined ? "" : formatFixed(e.en, 1);
}

/** The relative atomic mass as the data sheet prints it: "35,5", "(98)". */
export function massText(e: Element): string {
  const text = formatNumber(e.mass, 1);
  return massInBrackets(e) ? `(${text})` : text;
}

export function cellColour(e: Element, colourBy: ColourBy): string {
  if (colourBy === "state") return STATE_COLOURS[e.state];
  if (colourBy === "metal") return METAL_COLOURS[metalCharacter(e)];
  return CATEGORY_COLOURS[e.category];
}

/**
 * The periodic table: 18 columns, the f-block under it, coloured by category
 * (or by state or metal character), with highlights for the diatomic,
 * ferromagnetic and radioactive elements, and a simplified view of the
 * elements a school course actually meets. Tap an element to open it.
 */
export default function PeriodicTable({
  view,
  onSelect,
  selected,
}: {
  view: TableView;
  onSelect: (e: Element) => void;
  selected?: Element | null;
}) {
  const [colourBy, setColourBy] = useState<ColourBy>("category");
  const [highlights, setHighlights] = useState<Set<Highlight>>(new Set());
  const [isolated, setIsolated] = useState<string | null>(null);

  const toggleHighlight = (h: Highlight) =>
    setHighlights((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });

  const legend = useMemo(() => {
    if (colourBy === "state") return (Object.keys(STATE_NAMES) as Element["state"][]).filter((s) => s !== "unknown").map((s) => ({ key: s, name: STATE_NAMES[s], colour: STATE_COLOURS[s] }));
    if (colourBy === "metal") return (Object.keys(METAL_NAMES) as Array<keyof typeof METAL_NAMES>).map((m) => ({ key: m, name: METAL_NAMES[m], colour: METAL_COLOURS[m] }));
    return (Object.keys(CATEGORY_NAMES) as Category[]).map((c) => ({ key: c, name: CATEGORY_NAMES[c], colour: CATEGORY_COLOURS[c] }));
  }, [colourBy]);

  const legendKey = (e: Element): string => (colourBy === "state" ? e.state : colourBy === "metal" ? metalCharacter(e) : e.category);

  const dimmed = (e: Element): boolean => {
    if (isolated && legendKey(e) !== isolated) return true;
    if (highlights.size === 0) return false;
    return !HIGHLIGHTS.some((h) => highlights.has(h.key) && h.test(e));
  };

  return (
    <div className="pt">
      <div className="pt-toolbar">
        <div className="pt-toolbar-group">
          <span className="pt-toolbar-label">Colour by</span>
          <Segmented
            small
            label="Colour the table by"
            options={[
              { value: "category", label: "Group" },
              { value: "state", label: "State at 25 °C" },
              { value: "metal", label: "Metal / non-metal" },
            ]}
            value={colourBy}
            onChange={(v) => {
              setColourBy(v);
              setIsolated(null);
            }}
          />
        </div>
        <div className="pt-toolbar-group">
          <span className="pt-toolbar-label">Highlight</span>
          {HIGHLIGHTS.map((h) => (
            <button key={h.key} className={`chip ${highlights.has(h.key) ? "selected" : ""}`} aria-pressed={highlights.has(h.key)} onClick={() => toggleHighlight(h.key)}>
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`pt-grid ${view}`} role="grid" aria-label={view === "full" ? "Periodic table" : "Simplified periodic table"}>
        {ELEMENTS.map((e) => {
          const position = view === "full" ? gridPosition(e) : simplifiedPosition(e);
          if (!position) return null;
          const marks = HIGHLIGHTS.filter((h) => highlights.has(h.key) && h.test(e)).map((h) => h.key);
          return (
            <button
              key={e.z}
              className={`pt-cell shown ${dimmed(e) ? "dim" : ""} ${marks.map((m) => `mark-${m}`).join(" ")} ${selected?.z === e.z ? "selected" : ""}`}
              style={{ gridColumn: position.column, gridRow: position.row, background: cellColour(e, colourBy) }}
              onClick={() => onSelect(e)}
              aria-label={`${e.name}, ${e.symbol}, atomic number ${e.z}`}
              title={`${e.name} (${e.z})`}
              data-z={e.z}
            >
              <span className="pt-top">
                <span className="pt-z">{e.z}</span>
                <span className="pt-en">{enText(e)}</span>
              </span>
              <span className="pt-symbol">{e.symbol}</span>
              <span className="pt-name">{e.name}</span>
              <span className="pt-mass">{massText(e)}</span>
              {e.diatomic && highlights.has("diatomic") && <span className="pt-badge">₂</span>}
            </button>
          );
        })}
        {view === "full" ? (
          <>
            <div className="pt-placeholder" style={{ gridColumn: 3, gridRow: 6 }} aria-hidden="true">
              57–71
            </div>
            <div className="pt-placeholder" style={{ gridColumn: 3, gridRow: 7 }} aria-hidden="true">
              89–103
            </div>
            <div className="pt-placeholder pt-fblock-label" style={{ gridColumn: "2 / 4", gridRow: 9 }} aria-hidden="true">
              Lanthanides
            </div>
            <div className="pt-placeholder pt-fblock-label" style={{ gridColumn: "2 / 4", gridRow: 10 }} aria-hidden="true">
              Actinides
            </div>
          </>
        ) : (
          <>
            <div className="pt-placeholder pt-gap-label" style={{ gridColumn: 3, gridRow: "1 / 5" }} aria-hidden="true">
              <span>groups 3–12</span>
            </div>
            <div className="pt-placeholder pt-extras-label" style={{ gridColumn: "1 / 10", gridRow: 5 }} aria-hidden="true">
              Other elements the course meets, in atomic-number order
            </div>
          </>
        )}
      </div>

      <div className="pt-legend" aria-label="Key">
        {legend.map((item) => (
          <button
            key={item.key}
            className={`pt-legend-item ${isolated === item.key ? "on" : ""}`}
            onClick={() => setIsolated((prev) => (prev === item.key ? null : item.key))}
            aria-pressed={isolated === item.key}
            title="Show only these"
          >
            <span className="pt-swatch" style={{ background: item.colour }} />
            {item.name}
          </button>
        ))}
        {isolated && (
          <button className="small" onClick={() => setIsolated(null)}>
            Show all
          </button>
        )}
      </div>
    </div>
  );
}
