import { useAppPick } from "../../store/appStore";
import { BehaviourCode } from "../../lib/types";
import { BC, BEHAVIOUR_COLOURS } from "../../lib/behaviourColours";
import Icon from "../Icon";
import { useRowReorder } from "../../hooks/useRowReorder";

/**
 * Settings › Behaviour buttons: the buttons on the seating plan during a
 * lesson, shared by every class (behaviours.csv).
 */
export default function BehaviourButtonsTab() {
  const { behaviourCodes, setBehaviourCodes, behaviourEvents, setBehaviourEvents, currentClass, showToast, confirmDialog, promptDialog } =
    useAppPick(
      "behaviourCodes",
      "setBehaviourCodes",
      "behaviourEvents",
      "setBehaviourEvents",
      "currentClass",
      "showToast",
      "confirmDialog",
      "promptDialog",
    );

  const update = (code: string, patch: Partial<BehaviourCode>) => {
    void setBehaviourCodes(behaviourCodes.map((c) => (c.code === code ? { ...c, ...patch } : c)));
  };

  // Commit an edited Code acronym: normalise, reject empty/duplicate, and rewrite
  // the open class's logged events so their label is preserved. Returns the value
  // the input should show (old code on revert).
  const commitCode = (oldCode: string, raw: string): string => {
    const next = raw.trim().toUpperCase();
    if (!next || next === oldCode) return oldCode;
    if (behaviourCodes.some((c) => c.code === next)) {
      showToast(`A behaviour with code "${next}" already exists`);
      return oldCode;
    }
    void setBehaviourCodes(behaviourCodes.map((c) => (c.code === oldCode ? { ...c, code: next } : c)));
    if (currentClass && behaviourEvents.some((e) => e.code === oldCode)) {
      void setBehaviourEvents(behaviourEvents.map((e) => (e.code === oldCode ? { ...e, code: next } : e)));
    }
    return next;
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
  const reorder = useRowReorder<HTMLTableRowElement>(move);

  const add = async (kind: "positive" | "negative") => {
    const code = (
      await promptDialog({ title: `New ${kind} behaviour`, body: "Short code shown on the button.", placeholder: "e.g. KIND" })
    )
      ?.trim()
      .toUpperCase();
    if (!code || behaviourCodes.some((c) => c.code === code)) return;
    void setBehaviourCodes([
      ...behaviourCodes,
      { code, label: code, kind, points: kind === "positive" ? 1 : -1, color: kind === "positive" ? BC.green : BC.red },
    ]);
  };

  const remove = async (code: string) => {
    const ok = await confirmDialog({
      title: `Remove behaviour "${code}"?`,
      body: "Existing logged events keep their points.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    void setBehaviourCodes(behaviourCodes.filter((c) => c.code !== code));
  };

  return (
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
            <th>Colour</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {behaviourCodes.map((c, i) => (
            <tr key={c.code} ref={reorder.rowRef(i)} className={reorder.rowClass(i)}>
              <td className="drag-handle" {...reorder.handle(i)} title="Drag to reorder" aria-label="Drag to reorder">
                ⠿
              </td>
              <td>
                <input
                  key={`code-${c.code}`}
                  className="code-input"
                  defaultValue={c.code}
                  title="Short acronym shown on the button — edit and click away to rename"
                  onBlur={(e) => {
                    e.target.value = commitCode(c.code, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </td>
              <td>
                {/* Shown as the button itself, so the colour choice is previewed in place. */}
                <input
                  className="bh-label-input"
                  style={{ background: c.color }}
                  value={c.label}
                  onChange={(e) => update(c.code, { label: e.target.value })}
                />
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
                {/* A fixed set of deep shades that all carry white text, so the
                    buttons always match one another. */}
                <div className="swatch-row bh-swatches" role="group" aria-label={`Colour for ${c.label}`}>
                  {BEHAVIOUR_COLOURS.map((p) => (
                    <button
                      key={p.hex}
                      className={`swatch ${c.color === p.hex ? "on" : ""}`}
                      style={{ background: p.hex }}
                      title={p.name}
                      aria-label={`${p.name} for ${c.label}`}
                      onClick={() => update(c.code, { color: p.hex })}
                    />
                  ))}
                </div>
              </td>
              <td>
                <button className="icon-only small danger" onClick={() => void remove(c.code)} title="Delete behaviour">
                  <Icon name="close" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row button-row">
        <button onClick={() => void add("positive")}>
          <Icon name="add" size={20} /> Positive behaviour
        </button>
        <button onClick={() => void add("negative")}>
          <Icon name="add" size={20} /> Negative behaviour
        </button>
      </div>
      <p className="muted tail">
        Renaming a Code updates this class's logged history; other classes keep the old code in their behaviour log.
      </p>
    </div>
  );
}
