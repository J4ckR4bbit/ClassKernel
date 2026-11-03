import { useAppPick } from "../../store/appStore";
import { BehaviourCode } from "../../lib/types";
import { BC, BEHAVIOUR_COLOURS } from "../../lib/behaviourColours";
import { CODE_MAX, cleanCode } from "../../lib/behaviourCodes";
import Icon from "../Icon";
import BehaviourIcon from "../BehaviourIcon";
import Popover from "../Popover";
import { BEHAVIOUR_ICON_GROUPS } from "../behaviourIcons";
import { useRowReorder } from "../../hooks/useRowReorder";

/**
 * Settings › Behaviour buttons: the buttons on the seating plan during a
 * lesson, shared by every class (behaviours.csv).
 */
export default function BehaviourButtonsTab() {
  const { behaviourCodes, setBehaviourCodes, renameBehaviourCode, showToast, confirmDialog, promptDialog } = useAppPick(
    "behaviourCodes",
    "setBehaviourCodes",
    "renameBehaviourCode",
    "showToast",
    "confirmDialog",
    "promptDialog",
  );

  const update = (code: string, patch: Partial<BehaviourCode>) => {
    void setBehaviourCodes(behaviourCodes.map((c) => (c.code === code ? { ...c, ...patch } : c)));
  };

  // Commit an edited code (at most three characters): reject an empty or
  // taken one, otherwise rename it in every class's log too, so each logged
  // event keeps its button. Returns the value the input should show.
  const commitCode = (oldCode: string, raw: string): string => {
    const next = cleanCode(raw);
    if (!next || next === oldCode) return oldCode;
    if (behaviourCodes.some((c) => c.code === next)) {
      showToast(`A behaviour with code "${next}" already exists`);
      return oldCode;
    }
    void renameBehaviourCode(oldCode, next);
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
    const raw = await promptDialog({
      title: `New ${kind} behaviour`,
      body: `Its code: up to ${CODE_MAX} characters, shown on the tiles and in the logs.`,
      placeholder: kind === "positive" ? "e.g. +HW" : "e.g. -HW",
      maxLength: CODE_MAX,
    });
    const code = cleanCode(raw ?? "");
    if (!code) return;
    if (behaviourCodes.some((c) => c.code === code)) {
      showToast(`A behaviour with code "${code}" already exists`);
      return;
    }
    void setBehaviourCodes([
      ...behaviourCodes,
      { code, label: code, kind, points: kind === "positive" ? 1 : -1, color: kind === "positive" ? BC.green : BC.red, icon: "" },
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
        <code>behaviours.csv</code>). Each has a code of up to three characters (e.g. <b>+HW</b>), shown with its
        colour and icon on the grid and round pop-ups. Drag the <span aria-hidden>⠿</span> handle to reorder them.
      </p>
      <table className="data bh-table">
        <thead>
          <tr>
            <th style={{ width: 26 }}></th>
            <th style={{ width: 80 }}>Code</th>
            <th style={{ width: 60 }}>Icon</th>
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
                  maxLength={CODE_MAX}
                  aria-label={`Code for ${c.label}`}
                  title="Up to 3 characters, shown on the tiles (e.g. +HW) — edit and click away to rename"
                  onBlur={(e) => {
                    e.target.value = commitCode(c.code, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </td>
              <td>
                <IconPicker code={c} onPick={(icon) => update(c.code, { icon })} />
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
        Changing a code changes it in every class's behaviour log too, so the history keeps its labels.
      </p>
    </div>
  );
}

/** The behaviour's icon as a button; it opens the icons, grouped, to choose from. */
function IconPicker({ code, onPick }: { code: BehaviourCode; onPick: (icon: string) => void }) {
  return (
    <Popover
      label={code.icon ? <BehaviourIcon name={code.icon} size={22} /> : <span className="muted">—</span>}
      ariaLabel={`Icon for ${code.label}`}
      title="Choose an icon"
      showArrow={false}
      buttonClassName="small icon-pick"
      panelClassName="icon-picker"
    >
      {(close) => (
        <>
          <button
            className={`small ${code.icon ? "" : "on"}`}
            onClick={() => {
              onPick("");
              close();
            }}
          >
            No icon
          </button>
          {BEHAVIOUR_ICON_GROUPS.map((g) => (
            <div key={g.name} className="icon-group" role="group" aria-label={g.name}>
              <div className="popover-label">{g.name}</div>
              <div className="icon-grid">
                {g.icons.map((name) => (
                  <button
                    key={name}
                    className={`icon-choice ${code.icon === name ? "on" : ""}`}
                    title={name.replace(/_/g, " ")}
                    aria-label={name.replace(/_/g, " ")}
                    aria-pressed={code.icon === name}
                    onClick={() => {
                      onPick(name);
                      close();
                    }}
                  >
                    <BehaviourIcon name={name} size={22} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Popover>
  );
}
