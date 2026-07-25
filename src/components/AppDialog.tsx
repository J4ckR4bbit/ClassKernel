import { useEffect, useState } from "react";
import { useApp } from "../store/appStore";

/**
 * The app's confirm/prompt modal, driven by `confirmDialog` / `promptDialog`
 * on the store. Replaces window.confirm/window.prompt, which render as tiny
 * OS dialogs a touch panel user can barely hit (and which some WebViews
 * suppress entirely).
 */
export default function AppDialog() {
  const { dialog, resolveDialog } = useApp();
  const [text, setText] = useState("");

  useEffect(() => {
    if (dialog?.kind === "prompt") setText(dialog.initial ?? "");
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveDialog(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, resolveDialog]);

  if (!dialog) return null;
  const cancel = () => resolveDialog(dialog.kind === "confirm" ? false : null);
  const ok = () => resolveDialog(dialog.kind === "confirm" ? true : text.trim());

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{dialog.title}</h2>
        {dialog.body && <p className="muted dialog-body">{dialog.body}</p>}
        {dialog.kind === "prompt" && (
          <input
            autoFocus
            value={text}
            placeholder={dialog.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) ok();
            }}
          />
        )}
        <div className="actions">
          <button onClick={cancel}>Cancel</button>
          <button
            autoFocus={dialog.kind === "confirm"}
            className={dialog.danger ? "danger" : "primary"}
            disabled={dialog.kind === "prompt" && !text.trim()}
            onClick={ok}
          >
            {dialog.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
