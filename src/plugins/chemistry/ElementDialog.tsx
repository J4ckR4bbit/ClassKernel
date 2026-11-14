import Modal from "../../components/Modal";
import { formatNumber } from "../numbers";
import { CATEGORY_COLOURS, CATEGORY_NAMES, Element, massInBrackets, metalCharacter } from "./elements";
import { configuration, orbitalBoxes, shells, shorthandNotation, spdfNotation, unpairedElectrons, valenceElectrons } from "./electrons";
import { massText } from "./PeriodicTable";

const STATE_WORD: Record<Element["state"], string> = { solid: "Solid", liquid: "Liquid", gas: "Gas", unknown: "Not known" };

/** "+2, +3" with the most common first. */
export function oxidationText(states: number[]): string {
  return states.map((s) => (s > 0 ? `+${s}` : s < 0 ? `−${-s}` : "0")).join(", ");
}

/** "1 538 °C", or an em dash when there isn't one. */
function degrees(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value, 0).replace("-", "−")} °C`;
}

/** A Bohr-style diagram: the nucleus with its symbol, a ring per shell, a dot per electron. */
export function BohrDiagram({ element, size = 220 }: { element: Element; size?: number }) {
  const populations = shells(configuration(element.z));
  const centre = size / 2;
  const first = size * 0.13;
  const step = (centre - first - 6) / Math.max(1, populations.length - 1 || 1);
  return (
    <svg className="chem-bohr" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Bohr diagram of ${element.name}: ${populations.join(", ")}`}>
      <circle cx={centre} cy={centre} r={size * 0.075} fill="#1d2733" />
      <text x={centre} y={centre + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={size * 0.06} fontWeight={700}>
        {element.symbol}
      </text>
      {populations.map((count, i) => {
        const r = first + i * step;
        return (
          <g key={i}>
            <circle cx={centre} cy={centre} r={r} fill="none" stroke="#6b7a8c" strokeWidth={1.2} />
            {Array.from({ length: count }, (_, k) => {
              const angle = (2 * Math.PI * k) / count - Math.PI / 2;
              return <circle key={k} cx={centre + r * Math.cos(angle)} cy={centre + r * Math.sin(angle)} r={Math.max(2.2, size * 0.013)} fill="#1f4fd1" />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** The Aufbau (orbital box) diagram, lowest energy at the bottom, arrows for electrons. */
export function AufbauDiagram({ element }: { element: Element }) {
  const rows = [...orbitalBoxes(configuration(element.z))].reverse();
  return (
    <div className="chem-aufbau" role="img" aria-label={`Aufbau diagram of ${element.name}`}>
      {rows.map((s) => (
        <div className="chem-aufbau-row" key={s.label}>
          <span className="chem-aufbau-label">{s.label}</span>
          <span className="chem-aufbau-boxes">
            {s.boxes.map((b, i) => (
              <span className={`chem-box ${b.electrons === 0 ? "empty" : ""}`} key={i}>
                {b.electrons >= 1 && <span className="chem-arrow up">↑</span>}
                {b.electrons === 2 && <span className="chem-arrow down">↓</span>}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Everything about one element that matters in the school course. */
export default function ElementDialog({ element, onClose }: { element: Element; onClose: () => void }) {
  const e = element;
  const orbitals = configuration(e.z);
  const d = e.detail;
  const mainGroup = e.group !== null && (e.group <= 2 || e.group >= 13);
  const tags: string[] = [];
  if (e.diatomic) tags.push(`Diatomic: ${e.symbol}₂`);
  if (e.ferromagnetic) tags.push("Ferromagnetic");
  if (e.radioactive) tags.push("Radioactive");
  return (
    <Modal
      className="chem-element-modal"
      onClose={onClose}
      title={
        <span className="chem-title">
          <span className="chem-title-symbol" style={{ background: CATEGORY_COLOURS[e.category] }}>
            {e.symbol}
          </span>
          <span>
            {e.name}
            <span className="chem-title-sub">
              Atomic number {e.z} · Relative atomic mass {massText(e)}
              {massInBrackets(e) ? " (longest-lived isotope)" : ""}
            </span>
          </span>
        </span>
      }
    >
      <div className="chem-element">
        <div className="chem-element-diagrams">
          <div className="chem-diagram">
            <h4>Shell structure</h4>
            <BohrDiagram element={e} />
            <div className="chem-shells">{shells(orbitals).join(" , ")}</div>
          </div>
          <div className="chem-diagram">
            <h4>Aufbau diagram</h4>
            <AufbauDiagram element={e} />
          </div>
        </div>
        <div className="chem-element-facts">
          <table className="data chem-facts">
            <tbody>
              <tr>
                <th>Group · period</th>
                <td>
                  {e.group !== null ? `Group ${e.group}` : CATEGORY_NAMES[e.category].replace(/s$/, "")} · Period {e.period}
                </td>
              </tr>
              <tr>
                <th>Classification</th>
                <td>
                  {CATEGORY_NAMES[e.category].replace(/s$/, "")}; {metalCharacter(e)}
                  {tags.length ? ` · ${tags.join(" · ")}` : ""}
                </td>
              </tr>
              <tr>
                <th>State at 25 °C</th>
                <td>{STATE_WORD[e.state]}</td>
              </tr>
              <tr>
                <th>Electron configuration</th>
                <td>
                  <div className="chem-config">{spdfNotation(orbitals)}</div>
                  <div className="muted">{shorthandNotation(e.z)}</div>
                  <div className="muted">
                    {mainGroup ? `${valenceElectrons(orbitals)} valence electron${valenceElectrons(orbitals) === 1 ? "" : "s"} · ` : ""}
                    {unpairedElectrons(orbitals)} unpaired
                  </div>
                </td>
              </tr>
              <tr>
                <th>Electronegativity</th>
                <td>{e.en === undefined ? "— (not on the data sheet)" : formatNumber(e.en, 1)}</td>
              </tr>
              {d ? (
                <>
                  <tr>
                    <th>Ionisation energies</th>
                    <td>
                      {d.ionisation.map((ie, i) => (
                        <div key={i}>
                          {["1st", "2nd", "3rd"][i]}: {formatNumber(ie, 0)} kJ·mol⁻¹
                        </div>
                      ))}
                    </td>
                  </tr>
                  <tr>
                    <th>Melting point</th>
                    <td>{degrees(d.melting)}</td>
                  </tr>
                  <tr>
                    <th>Boiling point</th>
                    <td>{degrees(d.boiling)}</td>
                  </tr>
                  {d.density !== undefined && (
                    <tr>
                      <th>Density</th>
                      <td>{d.density < 0.01 ? `${formatNumber(d.density * 1000, 2)} g·dm⁻³` : `${formatNumber(d.density, 2)} g·cm⁻³`}</td>
                    </tr>
                  )}
                  <tr>
                    <th>Common oxidation states</th>
                    <td>{oxidationText(d.oxidation)}</td>
                  </tr>
                  <tr>
                    <th>Notes</th>
                    <td>{d.notes}</td>
                  </tr>
                  {d.check && (
                    <tr>
                      <th>Check</th>
                      <td className="chem-check">{d.check}</td>
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <th>More</th>
                  <td className="muted">Only the data-sheet values are kept for this element.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
