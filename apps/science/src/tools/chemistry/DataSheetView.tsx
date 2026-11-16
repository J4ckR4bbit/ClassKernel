import { useMemo, useState } from "react";
import Segmented from "@classkernel/ui/Segmented";
import { CONSTANTS, FORMULAE, HalfReaction, REDUCTION_POTENTIALS, cellFromTable } from "./datasheet";
import { voltsText } from "../galvanic-cell/cell";

type Table = "potentials" | "constants" | "formulae";

/**
 * The data sheet's tables, searchable, with the reduction potentials
 * clickable: pick two half-reactions and the cell they make is worked out.
 */
export default function DataSheetView({ classView }: { classView: boolean }) {
  const [table, setTable] = useState<Table>("potentials");
  const [order, setOrder] = useState<"4a" | "4b">("4a");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = order === "4a" ? REDUCTION_POTENTIALS : [...REDUCTION_POTENTIALS].sort((a, b) => a.sortKey.localeCompare(b.sortKey) || b.E - a.E);
    return needle ? list.filter((r) => `${r.left} ${r.right} ${r.sortKey}`.toLowerCase().includes(needle)) : list;
  }, [order, needle]);

  const toggle = (r: HalfReaction) =>
    setPicked((prev) => (prev.includes(r.id) ? prev.filter((id) => id !== r.id) : prev.length >= 2 ? [prev[1], r.id] : [...prev, r.id]));
  const cell = picked.length === 2 ? cellFromTable(REDUCTION_POTENTIALS.find((r) => r.id === picked[0])!, REDUCTION_POTENTIALS.find((r) => r.id === picked[1])!) : null;

  return (
    <div className={`ds ${classView ? "class-view" : ""}`}>
      <div className="ds-bar">
        <Segmented
          label="Table"
          options={[
            { value: "potentials", label: "Reduction potentials" },
            { value: "constants", label: "Constants" },
            { value: "formulae", label: "Formulae" },
          ]}
          value={table}
          onChange={setTable}
        />
        {table === "potentials" && (
          <Segmented
            small
            label="Order"
            options={[
              { value: "4a", label: "4A: by E°" },
              { value: "4b", label: "4B: alphabetical" },
            ]}
            value={order}
            onChange={setOrder}
          />
        )}
        <input type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the table" className="ds-search" />
      </div>

      {table === "potentials" && (
        <div className="ds-potentials">
          <div className="ds-table-box">
            <p className="muted ds-note">Standard reduction potentials at 298 K, 1 mol·dm⁻³, 101,3 kPa. Tap two rows to make a cell.</p>
            <table className="data ds-table">
              <thead>
                <tr>
                  <th colSpan={3}>Half-reaction</th>
                  <th className="ds-num">E° (V)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={picked.includes(r.id) ? "picked" : ""} onClick={() => toggle(r)} data-id={r.id} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(r)}>
                    <td className="ds-left">{r.left}</td>
                    <td className="ds-arrow">⇌</td>
                    <td className="ds-right">{r.right}</td>
                    <td className="ds-num">{voltsText(r.E)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted ds-small">
              {order === "4a" ? "Increasing oxidising ability upwards; increasing reducing ability downwards." : "The same table in alphabetical order of the element, as Table 4B."}
            </p>
          </div>
          <div className="panel ds-cell">
            <h3>The cell from two rows</h3>
            {cell ? (
              <dl className="ti-facts">
                <dt>Cathode (reduction)</dt>
                <dd>
                  {cell.reductionText} · E° = {voltsText(cell.cathode.E)}
                </dd>
                <dt>Anode (oxidation)</dt>
                <dd>
                  {cell.oxidationText} · E° = {voltsText(cell.anode.E)}
                </dd>
                <dt>E°cell</dt>
                <dd>
                  E°cathode − E°anode = ({voltsText(cell.cathode.E)}) − ({voltsText(cell.anode.E)}) = <strong>{voltsText(cell.E0cell)}</strong>
                </dd>
                <dt>Agents</dt>
                <dd>{cell.agents}</dd>
                <dt>Spontaneous?</dt>
                <dd>{cell.E0cell > 0 ? "Yes: E°cell is positive, so the reaction goes as written." : "The two are equal: no cell."}</dd>
              </dl>
            ) : (
              <p className="muted">Tap a row for each half-cell. The higher one in the table is reduced (the cathode); the lower one is reversed and oxidised (the anode).</p>
            )}
            {picked.length > 0 && (
              <button className="small" onClick={() => setPicked([])} style={{ marginTop: 10 }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {table === "constants" && (
        <table className="data ds-table ds-constants">
          <thead>
            <tr>
              <th>Name</th>
              <th>Symbol</th>
              <th className="ds-num">Value</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {CONSTANTS.filter((c) => !needle || `${c.name} ${c.symbol}`.toLowerCase().includes(needle)).map((c) => (
              <tr key={c.symbol + c.name}>
                <td>{c.name}</td>
                <td>{c.symbol}</td>
                <td className="ds-num">{c.value}</td>
                <td>{c.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {table === "formulae" && (
        <table className="data ds-table ds-formulae">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Formula</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {FORMULAE.filter((f) => !needle || `${f.topic} ${f.formula} ${f.meaning}`.toLowerCase().includes(needle)).map((f) => (
              <tr key={f.formula}>
                <td className="muted">{f.topic}</td>
                <td className="ds-formula">{f.formula}</td>
                <td>{f.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {table !== "potentials" && <p className="muted ds-small">Values as printed on the data sheet; a wrong one is a one-line fix in apps/science/src/tools/chemistry/datasheet.ts.</p>}
    </div>
  );
}
