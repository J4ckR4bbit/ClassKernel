import { useMemo, useState } from "react";
import Icon from "@classkernel/ui/Icon";
import Modal from "@classkernel/ui/Modal";
import Segmented from "@classkernel/ui/Segmented";
import { formatNumber } from "@classkernel/ui/numbers";
import { layoutMolecule, lewisStructure, molarMass, parseStructure } from "./bonds";
import { POLYATOMIC_IONS, PolyatomicIon, chargeText } from "./ions";
import Molecule from "./Molecule";

type Filter = "all" | "syllabus" | "cations" | "-1" | "-2" | "-3";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "syllabus", label: "Syllabus table" },
  { value: "cations", label: "Cations" },
  { value: "-1", label: "1−" },
  { value: "-2", label: "2−" },
  { value: "-3", label: "3−" },
];

function matches(ion: PolyatomicIon, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "syllabus":
      return ion.syllabus;
    case "cations":
      return ion.charge > 0;
    default:
      return ion.charge === Number(filter);
  }
}

/** The formula with the charge as a superscript: "SO₄" + "2−". */
function FormulaText({ ion }: { ion: PolyatomicIon }) {
  const body = ion.formula.replace(/[⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+$/, "");
  return (
    <>
      {body}
      <sup>{chargeText(ion.charge)}</sup>
    </>
  );
}

/** Everything about one ion, in a pop-up: Lewis diagram, charge, where it is found, its properties. */
function IonDialog({ ion, onClose }: { ion: PolyatomicIon; onClose: () => void }) {
  const [lewis, setLewis] = useState(true);
  const electrons = useMemo(() => lewisStructure(layoutMolecule(parseStructure(ion.structure), ion.shape), ion.charge).totalValenceElectrons, [ion]);
  return (
    <Modal
      className="chem-element-modal ion-modal"
      onClose={onClose}
      title={
        <span className="chem-title">
          <span className={`ion-badge ${ion.charge > 0 ? "positive" : "negative"}`}>
            <FormulaText ion={ion} />
          </span>
          <span>
            {ion.name}
            <span className="chem-title-sub">
              Charge {Math.abs(ion.charge)}{ion.charge > 0 ? "+" : "−"} · {formatNumber(molarMass(ion.formula), 1)} g·mol⁻¹ · {electrons} valence electrons
              {ion.syllabus ? " · in the syllabus table" : ""}
            </span>
          </span>
        </span>
      }
    >
      <button className="icon-only chem-close" onClick={onClose} title="Back to the ions (Esc)" aria-label="Back to the ions">
        <Icon name="close" size={22} />
      </button>
      <div className="ion-body">
        <div className="chem-diagram ion-diagram">
          <div className="ion-diagram-head">
            <h4>{lewis ? "Lewis diagram" : "Structure"}</h4>
            <Segmented
              small
              label="Diagram"
              options={[
                { value: "lewis", label: "Lewis" },
                { value: "plain", label: "Bonds only" },
              ]}
              value={lewis ? "lewis" : "plain"}
              onChange={(v) => setLewis(v === "lewis")}
            />
          </div>
          <div className="ion-drawing">
            <span className="sub-ion-bracket ion-bracket">
              <Molecule structure={ion.structure} shape={ion.shape} showDeltas={false} showEN={false} scale={64} lewis={lewis ? { charge: ion.charge } : undefined} />
              <span className="sub-ion-charge">{chargeText(ion.charge)}</span>
            </span>
          </div>
          <p className="muted ion-small">
            {lewis
              ? "Dots are lone pairs; a circled sign is the formal charge on that atom. They add up to the ion's charge."
              : "The bonds as the course draws them, one double bond where resonance really spreads it over several."}
          </p>
        </div>
        <table className="data chem-facts ion-facts">
          <tbody>
            {ion.parent && (
              <tr>
                <th>Comes from</th>
                <td>{ion.parent}</td>
              </tr>
            )}
            <tr>
              <th>Found in</th>
              <td>
                <ul className="ion-list">
                  {ion.occurs.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </td>
            </tr>
            {ion.solubility && (
              <tr>
                <th>Solubility of its salts</th>
                <td>{ion.solubility}</td>
              </tr>
            )}
            {ion.colour && (
              <tr>
                <th>Colour</th>
                <td>{ion.colour}</td>
              </tr>
            )}
            {ion.test && (
              <tr>
                <th>Test</th>
                <td>{ion.test}</td>
              </tr>
            )}
            <tr>
              <th>Notes</th>
              <td>{ion.notes}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/**
 * Module 3: the polyatomic ions, as cards by charge; tap one for its Lewis
 * diagram, where it is found, the solubility of its salts, its test and
 * its notes.
 */
export default function Ions({ classView }: { classView: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<PolyatomicIon | null>(null);
  const shown = POLYATOMIC_IONS.filter((i) => matches(i, filter));
  const groups: Array<{ label: string; ions: PolyatomicIon[] }> = [
    { label: "Cations", ions: shown.filter((i) => i.charge > 0) },
    { label: "Anions with charge 1−", ions: shown.filter((i) => i.charge === -1) },
    { label: "Anions with charge 2−", ions: shown.filter((i) => i.charge === -2) },
    { label: "Anions with charge 3−", ions: shown.filter((i) => i.charge === -3) },
  ].filter((g) => g.ions.length > 0);

  return (
    <div className={`ions ${classView ? "class-view" : ""}`}>
      <div className="ion-filters">
        {FILTERS.map((f) => (
          <button key={f.value} className={`chip ${filter === f.value ? "selected" : ""}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.label} className="ion-group">
          <h3>{g.label}</h3>
          <div className="ion-cards">
            {g.ions.map((ion) => (
              <button key={ion.id} className={`ion-card ${ion.charge > 0 ? "positive" : "negative"} ${ion.syllabus ? "" : "extra"}`} onClick={() => setSelected(ion)} data-ion={ion.id}>
                <span className="ion-card-formula">
                  <FormulaText ion={ion} />
                </span>
                <span className="ion-card-name">{ion.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="muted ion-small">
        Ions with a dashed edge are not in the syllabus table but come up in practicals and questions. Tap an ion for its Lewis diagram, where it is found, and the solubility of its salts.
      </p>
      {selected && <IonDialog ion={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
