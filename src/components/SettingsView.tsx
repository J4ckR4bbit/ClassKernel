import { useApp } from "../store/appStore";
import { BehaviourCode } from "../lib/types";

export default function SettingsView() {
  const { behaviourCodes, setBehaviourCodes, dataDir, classes } = useApp();

  const update = (code: string, patch: Partial<BehaviourCode>) => {
    void setBehaviourCodes(behaviourCodes.map((c) => (c.code === code ? { ...c, ...patch } : c)));
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
    <div>
      <div className="view-header">
        <h1>Settings</h1>
      </div>

      <div className="panel">
        <h3>Behaviour buttons</h3>
        <p className="muted">
          These are the buttons shown on the seating plan during a lesson. Shared across all your classes (stored in{" "}
          <code>behaviours.csv</code>).
        </p>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Code</th>
              <th>Label</th>
              <th style={{ width: 110 }}>Type</th>
              <th style={{ width: 90 }}>Points</th>
              <th style={{ width: 90 }}>Color</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {behaviourCodes.map((c) => (
              <tr key={c.code}>
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
    </div>
  );
}
