import { BehaviourCode } from "../lib/types";
import { textColorFor } from "../lib/privacy";
import { BatchEntry } from "../hooks/useBatchEntry";

const signed = (points: number) => (points > 0 ? `+${points}` : `${points}`);

interface Props {
  entry: BatchEntry;
  behaviourCodes: BehaviourCode[];
  /** "bar" sits above the room plan; "strip" stacks in the narrow teaching strip. */
  layout: "bar" | "strip";
}

/**
 * The batch-entry controls: first the behaviour to record (the teacher's own
 * catalogue — no separate batch list), then a banner naming it, the running
 * count, and Cancel / Save. Student selection itself happens on the seats or
 * table rows of whichever view hosts this.
 */
export default function BatchPanel({ entry, behaviourCodes, layout }: Props) {
  const { batch } = entry;
  if (!batch) return null;
  const n = batch.selected.length;
  const countText = `${n} student${n === 1 ? "" : "s"} selected`;

  if (!batch.code) {
    const ordered = [
      ...behaviourCodes.filter((c) => c.kind === "positive"),
      ...behaviourCodes.filter((c) => c.kind === "negative"),
    ];
    return (
      <div className={`batch-panel batch-${layout} no-print`}>
        <div className="batch-head">
          <b>Batch entry</b>
          <span className="muted">Choose what to record</span>
        </div>
        <div className="batch-items">
          {ordered.map((c) => (
            <button
              key={c.code}
              className="bh-btn"
              style={{ background: c.color, color: textColorFor(c.color) }}
              onClick={() => entry.chooseItem(c)}
            >
              {signed(c.points)} {c.label}
            </button>
          ))}
        </div>
        <div className="batch-actions">
          {n > 0 && <span className="muted">{countText}</span>}
          <div className="spacer" />
          <button onClick={entry.cancel}>{n > 0 ? "Cancel" : "Done"}</button>
        </div>
      </div>
    );
  }

  const c = batch.code;
  return (
    <div className={`batch-panel batch-${layout} active no-print`}>
      <div className="batch-banner">
        <span className="batch-tag">BATCH</span>
        <span className="batch-item" style={{ background: c.color, color: textColorFor(c.color) }}>
          {signed(c.points)} {c.label}
        </span>
        <button className="small" onClick={entry.changeItem} title="Record something else for the same students">
          Change
        </button>
      </div>
      <div className="batch-actions">
        <span className={`batch-count ${n > 0 ? "on" : ""}`}>{n > 0 ? countText : "Tap students to select them"}</span>
        <div className="spacer" />
        <button onClick={entry.cancel} title="Leave batch entry without recording anything">
          Cancel
        </button>
        <button className="primary" disabled={n === 0} onClick={entry.save}>
          Save{n > 0 ? ` (${n})` : ""}
        </button>
      </div>
    </div>
  );
}
