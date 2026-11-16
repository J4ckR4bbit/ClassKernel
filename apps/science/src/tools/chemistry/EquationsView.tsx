import { useMemo, useState } from "react";
import Icon from "@classkernel/ui/Icon";
import { formatNumber } from "@classkernel/ui/numbers";
import { molarMass } from "./bonds";
import { Balanced, EXAMPLES, balance, classify, equationText, inventory, oxidationNumbers, oxidationText, parseEquation } from "./equations";

/**
 * Equation balancer: type a skeleton equation, get it balanced with the
 * atom inventory, the reaction type and the oxidation numbers; or hide the
 * answer and let the class balance it first.
 */
export default function EquationsView({ classView }: { classView: boolean }) {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [hidden, setHidden] = useState(false);
  const [showOxidation, setShowOxidation] = useState(true);

  const result = useMemo<{ balanced?: Balanced; error?: string }>(() => {
    if (!text.trim()) return {};
    try {
      return { balanced: balance(parseEquation(text)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);

  const b = result.balanced;
  const kinds = b ? classify(b) : null;
  const species = b ? [...b.equation.reactants, ...b.equation.products] : [];
  const skeleton = b ? equationText({ ...b, coefficients: b.coefficients.map(() => 1) }, true) : "";

  return (
    <div className={`eq ${classView ? "class-view" : ""}`}>
      {!classView && (
        <div className="eq-input panel">
          <label className="eq-label" htmlFor="eq-text">
            Type the equation (formulas with plain digits are fine: C3H8, Ca(OH)2, Cu2+, SO4^2-, states as (aq))
          </label>
          <input id="eq-text" className="eq-field" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
          <div className="eq-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex.text} className={`chip ${ex.text === text ? "selected" : ""}`} onClick={() => setText(ex.text)}>
                {ex.label}
              </button>
            ))}
          </div>
          <div className="row eq-toggles">
            <label className="sub-check">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Question mode: show the unbalanced equation only
            </label>
            <label className="sub-check">
              <input type="checkbox" checked={showOxidation} onChange={(e) => setShowOxidation(e.target.checked)} /> Show oxidation numbers
            </label>
          </div>
        </div>
      )}

      {result.error && <div className="ti-warn">{result.error}</div>}

      {b && kinds && (
        <div className="eq-result panel">
          <div className="eq-skeleton muted">{skeleton}</div>
          {hidden ? (
            <div className="row">
              <button className="primary" onClick={() => setHidden(false)}>
                <Icon name="visibility" size={20} /> Reveal the balanced equation
              </button>
            </div>
          ) : (
            <>
              <div className="eq-balanced">{equationText(b, true)}</div>
              <div className="eq-types">
                {kinds.types.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                {kinds.oxidised.map((o) => (
                  <span key={`ox-${o.element}`} className="tag eq-ox">
                    {o.element} oxidised: {oxidationText(o.from)} → {oxidationText(o.to)}
                  </span>
                ))}
                {kinds.reduced.map((o) => (
                  <span key={`red-${o.element}`} className="tag eq-red">
                    {o.element} reduced: {oxidationText(o.from)} → {oxidationText(o.to)}
                  </span>
                ))}
              </div>
              <div className="eq-grid">
                <div>
                  <h4>Atom inventory</h4>
                  <table className="data eq-table">
                    <thead>
                      <tr>
                        <th>Element</th>
                        <th className="ds-num">Left</th>
                        <th className="ds-num">Right</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory(b).map((r) => (
                        <tr key={r.element}>
                          <td>{r.element}</td>
                          <td className="ds-num">{r.left}</td>
                          <td className="ds-num">{r.right}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4>Mole ratio and molar masses</h4>
                  <table className="data eq-table">
                    <thead>
                      <tr>
                        <th>Substance</th>
                        <th className="ds-num">mol</th>
                        <th className="ds-num">M (g·mol⁻¹)</th>
                        {showOxidation && <th>Oxidation numbers</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {species.map((s, i) => {
                        const ox = oxidationNumbers(s);
                        return (
                          <tr key={`${s.formula}-${i}`}>
                            <td>{s.formula}</td>
                            <td className="ds-num">{b.coefficients[i]}</td>
                            <td className="ds-num">{s.atoms.size ? formatNumber(molarMass(s.formula), 1) : "—"}</td>
                            {showOxidation && (
                              <td className="eq-oxcell">
                                {ox ? [...ox.entries()].map(([el, v]) => `${el} ${oxidationText(v)}`).join(", ") : "—"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
