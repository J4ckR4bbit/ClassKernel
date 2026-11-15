import { useMemo, useState } from "react";
import Segmented from "../../components/Segmented";
import { formatFixed, formatNumber } from "../numbers";
import { IONIC_MIN, NON_POLAR_MAX, layoutMolecule, molarMass, parseStructure, polarity, summariseBonds, totalBondEnthalpy } from "./bonds";
import { ionById } from "./ions";
import Molecule from "./Molecule";
import { INORGANIC_GROUPS, ORGANIC_GROUPS, SUBSTANCES, Section, Substance, parseMonatomicIon } from "./substanceData";
import { elementBySymbol } from "./elements";

const STATE_WORD = { solid: "Solid", liquid: "Liquid", gas: "Gas", unknown: "—" };

/** "+2" / "−1" for a monatomic ion's charge, as printed. */
function chargeText(charge: number): string {
  const magnitude = Math.abs(charge) === 1 ? "" : String(Math.abs(charge));
  return `${magnitude}${charge > 0 ? "+" : "−"}`;
}

/** One ion of an ionic substance: a polyatomic one drawn, a monatomic one as a labelled disc. */
function IonBlock({ ion, count, showDeltas, showEN }: { ion: string; count: number; showDeltas: boolean; showEN: boolean }) {
  const mono = parseMonatomicIon(ion);
  const label = count > 1 ? `${count} ×` : "";
  if (mono) {
    return (
      <div className="sub-ion">
        <span className="sub-ion-count">{label}</span>
        <span className="sub-ion-disc">
          {mono.symbol}
          <sup>{chargeText(mono.charge)}</sup>
        </span>
        {showEN && elementBySymbol(mono.symbol)?.en !== undefined && <span className="muted sub-ion-en">EN {formatFixed(elementBySymbol(mono.symbol)!.en!, 1)}</span>}
      </div>
    );
  }
  const poly = ionById(ion);
  return (
    <div className="sub-ion">
      <span className="sub-ion-count">{label}</span>
      <span className="sub-ion-bracket">
        <Molecule structure={poly.structure} shape={poly.shape} showDeltas={showDeltas} showEN={showEN} scale={46} />
        <span className="sub-ion-charge">{chargeText(poly.charge)}</span>
      </span>
      <span className="sub-ion-name">{poly.name}</span>
    </div>
  );
}


/**
 * Module 2: common substances and their bonds. A list on the left, by
 * section and group; the chosen one on the right with its structure, the
 * bonds it contains and their enthalpies, the polarity of each, and notes.
 */
export default function Substances({ classView }: { classView: boolean }) {
  const [section, setSection] = useState<Section>("inorganic");
  const [group, setGroup] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("h2o");
  const [showDeltas, setShowDeltas] = useState(true);
  const [showEN, setShowEN] = useState(false);

  const groups = section === "inorganic" ? INORGANIC_GROUPS : ORGANIC_GROUPS;
  const list = useMemo(() => SUBSTANCES.filter((s) => s.section === section && (!group || s.group === group)), [section, group]);
  const substance: Substance = SUBSTANCES.find((s) => s.id === selectedId) ?? SUBSTANCES[0];

  const molecule = useMemo(() => (substance.structure ? layoutMolecule(parseStructure(substance.structure), substance.shape) : null), [substance]);
  const bonds = useMemo(() => (molecule ? summariseBonds(molecule) : []), [molecule]);
  const total = totalBondEnthalpy(bonds);
  // For an ionic substance: the bonds inside its polyatomic ions, and the ionic bond itself.
  const ionBonds = useMemo(() => {
    if (!substance.ions) return [];
    const all = substance.ions.flatMap((part) => {
      const mono = parseMonatomicIon(part.ion);
      if (mono) return [];
      const ion = ionById(part.ion);
      return summariseBonds(layoutMolecule(parseStructure(ion.structure), ion.shape)).map((b) => ({ ...b, count: b.count * part.count }));
    });
    return all;
  }, [substance]);
  // The lattice row: the electronegativity difference when both ions are single atoms, else just the ions.
  const ionicPair = useMemo(() => {
    if (!substance.ions) return null;
    const names = substance.ions.map((p) => parseMonatomicIon(p.ion)?.symbol ?? ionById(p.ion).formula);
    const label = `between ${names.map((n, i) => (parseMonatomicIon(substance.ions![i].ion) ? substance.ions![i].ion : n)).join(" and ")}`;
    const cation = substance.ions.map((p) => parseMonatomicIon(p.ion)).find((m) => m && m.charge > 0);
    const anion = substance.ions.map((p) => parseMonatomicIon(p.ion)).find((m) => m && m.charge < 0);
    return { label, polarity: cation && anion ? polarity(cation.symbol, anion.symbol) : null };
  }, [substance]);

  const choose = (s: Section) => {
    setSection(s);
    setGroup(null);
    const first = SUBSTANCES.find((x) => x.section === s);
    if (first) setSelectedId(first.id);
  };

  return (
    <div className={`sub ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="sub-list">
          <Segmented
            label="Section"
            options={[
              { value: "inorganic", label: "Inorganic" },
              { value: "organic", label: "Organic" },
            ]}
            value={section}
            onChange={choose}
          />
          <div className="sub-groups">
            <button className={`chip ${group === null ? "selected" : ""}`} onClick={() => setGroup(null)}>
              All
            </button>
            {groups.map((g) => (
              <button key={g} className={`chip ${group === g ? "selected" : ""}`} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          <div className="sub-cards" role="listbox" aria-label="Substances">
            {list.map((s) => (
              <button key={s.id} role="option" aria-selected={s.id === substance.id} className={`sub-card ${s.id === substance.id ? "on" : ""}`} onClick={() => setSelectedId(s.id)}>
                <span className="sub-card-formula">{s.formula}</span>
                <span className="sub-card-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sub-detail">
        <div className="sub-head">
          <div>
            <div className="sub-formula">{substance.formula}</div>
            <div className="sub-name">{substance.name}</div>
          </div>
          <div className="sub-head-facts">
            <div>
              <span className="muted">Molar mass </span>
              <strong>{formatNumber(molarMass(substance.formula), 1)} g·mol⁻¹</strong>
            </div>
            <div>
              <span className="muted">{substance.section === "organic" ? substance.group.replace(/s$/, "") : substance.group} · </span>
              {substance.bonding} · {STATE_WORD[substance.state]} at 25 °C
              {substance.boiling !== undefined ? ` · boils at ${formatNumber(substance.boiling, 0).replace("-", "−")} °C` : ""}
            </div>
            {substance.functionalGroup && (
              <div>
                <span className="muted">Functional group </span>
                {substance.functionalGroup}
                {substance.condensed ? ` · ${substance.condensed}` : ""}
              </div>
            )}
          </div>
        </div>

        <div className="sub-structure">
          <div className="sub-toggles">
            <label className="sub-check">
              <input type="checkbox" checked={showDeltas} onChange={(e) => setShowDeltas(e.target.checked)} /> Show δ+ and δ−
            </label>
            <label className="sub-check">
              <input type="checkbox" checked={showEN} onChange={(e) => setShowEN(e.target.checked)} /> Show electronegativities
            </label>
          </div>
          {molecule && substance.structure && (
            <div className="sub-drawing">
              <Molecule structure={substance.structure} shape={substance.shape} showDeltas={showDeltas} showEN={showEN} scale={classView ? 70 : 54} />
            </div>
          )}
          {substance.ions && (
            <div className="sub-ions">
              {substance.ions.map((part) => (
                <IonBlock key={part.ion} ion={part.ion} count={part.count} showDeltas={showDeltas} showEN={showEN} />
              ))}
            </div>
          )}
          {!molecule && !substance.ions && <p className="muted sub-note">{substance.bonding === "metallic" ? "A lattice of metal ions in a sea of delocalised electrons: no molecules to draw." : "A giant covalent network: every atom bonded to its neighbours throughout the crystal, no separate molecules."}</p>}
          {substance.polarMolecule !== null && (
            <p className="sub-polar">
              The molecule is <strong>{substance.polarMolecule ? "polar" : "non-polar"}</strong>
              {substance.polarMolecule === false && bonds.some((b) => b.polarity.negative) ? " — its polar bonds cancel by symmetry." : substance.polarMolecule ? " — its dipoles do not cancel." : "."}
            </p>
          )}
        </div>

        {(bonds.length > 0 || ionBonds.length > 0 || ionicPair) && (
          <table className="data sub-bonds">
            <thead>
              <tr>
                <th>Bond</th>
                <th className="sub-num">Number</th>
                <th className="sub-num">Enthalpy (kJ·mol⁻¹)</th>
                <th className="sub-num">Δ EN</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {[...bonds, ...ionBonds].map((b) => (
                <tr key={b.key}>
                  <td>
                    {b.key}
                    {b.polarity.negative && showDeltas ? (
                      <span className="muted">
                        {" "}
                        ({b.polarity.positive}
                        <sup>δ+</sup> {b.polarity.negative}
                        <sup>δ−</sup>)
                      </span>
                    ) : null}
                  </td>
                  <td className="sub-num">{b.count}</td>
                  <td className="sub-num">{b.enthalpy === undefined ? "—" : formatNumber(b.enthalpy, 0)}</td>
                  <td className="sub-num">{formatFixed(b.polarity.difference, 1)}</td>
                  <td>{b.polarity.type}</td>
                </tr>
              ))}
              {ionicPair && (
                <tr>
                  <td>Ionic bond (lattice) {ionicPair.label}</td>
                  <td className="sub-num">—</td>
                  <td className="sub-num">—</td>
                  <td className="sub-num">{ionicPair.polarity ? formatFixed(ionicPair.polarity.difference, 1) : "—"}</td>
                  <td>
                    {!ionicPair.polarity
                      ? "ionic: electrostatic attraction between the ions"
                      : ionicPair.polarity.type === "ionic"
                        ? "ionic"
                        : `${ionicPair.polarity.type} by the ${formatFixed(IONIC_MIN, 1)} rule, but it forms an ionic lattice`}
                  </td>
                </tr>
              )}
              {total !== undefined && bonds.length > 0 && (
                <tr className="sub-total">
                  <td>Energy to break every bond in one mole</td>
                  <td className="sub-num">{bonds.reduce((n, b) => n + b.count, 0)}</td>
                  <td className="sub-num">{formatNumber(total, 0)}</td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <p className="sub-note">{substance.notes}</p>
        <p className="muted sub-small">
          Polarity from the data sheet's electronegativities: a difference up to {formatFixed(NON_POLAR_MAX, 1)} is non-polar covalent, up to {formatFixed(IONIC_MIN, 1)} polar covalent, above that ionic. Bond enthalpies are averages (CRC Handbook).
        </p>
      </div>
    </div>
  );
}
