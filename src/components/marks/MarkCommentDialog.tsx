import { useState } from "react";
import Modal from "../Modal";

/**
 * A student's comment on one test (marks.csv's comment column), from the
 * per-question marking grid: Save, Clear or Cancel while marking; just Close
 * in the read-only View. Ctrl + Enter saves.
 */
export default function MarkCommentDialog({
  student,
  test,
  initial,
  readOnly = false,
  onSave,
  onClose,
}: {
  student: string;
  test: string;
  initial: string;
  readOnly?: boolean;
  /** The comment to keep; "" clears it. */
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const save = () => {
    onSave(text.trim());
    onClose();
  };
  return (
    <Modal title={`Comment — ${student}`} onClose={onClose} className="mark-comment-modal">
      <p className="muted dialog-body">{test}</p>
      {readOnly ? (
        <p className="mark-comment-text">{initial}</p>
      ) : (
        <textarea
          autoFocus
          rows={4}
          value={text}
          aria-label={`Comment for ${student}`}
          placeholder="e.g. Left Q3 blank; ask about it in class."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
      )}
      <div className="actions">
        {readOnly ? (
          <button className="primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            {initial && (
              <button
                className="danger"
                onClick={() => {
                  onSave("");
                  onClose();
                }}
              >
                Clear
              </button>
            )}
            <span className="spacer" />
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save} disabled={text.trim() === initial.trim()} title="Save (Ctrl + Enter)">
              Save
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
