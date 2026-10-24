import { useAppPick } from "../../store/appStore";
import { CognitiveLevel } from "../../lib/types";
import Icon from "../Icon";

/** The cognitive levels offered when tagging a question (cognitive_levels.csv). */
export default function CognitiveLevelsEditor() {
  const { cognitiveLevels, setCognitiveLevels } = useAppPick("cognitiveLevels", "setCognitiveLevels");
  const updateLevel = (i: number, patch: Partial<CognitiveLevel>) =>
    void setCognitiveLevels(cognitiveLevels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLevel = () => void setCognitiveLevels([...cognitiveLevels, { code: `L${cognitiveLevels.length + 1}`, label: "" }]);
  const removeLevel = (i: number) => void setCognitiveLevels(cognitiveLevels.filter((_, j) => j !== i));

  return (
    <div className="panel">
      <h3>Cognitive levels</h3>
      <p className="muted lead">
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
                <button className="icon-only small danger" onClick={() => removeLevel(i)} title="Delete cognitive level">
                  <Icon name="close" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row button-row">
        <button onClick={addLevel}>
          <Icon name="add" size={20} /> Level
        </button>
      </div>
    </div>
  );
}
