import { useEffect, useMemo, useState } from "react";
import { useAppPick } from "../store/appStore";
import Modal from "./Modal";

let opened = 0;

/**
 * The app's confirm/prompt modal, driven by `confirmDialog` / `promptDialog`
 * on the store. Replaces window.confirm/window.prompt, which render as tiny
 * OS dialogs a touch panel user can barely hit (and which some WebViews
 * suppress entirely).
 */
export default function AppDialog() {
  const { dialog, resolveDialog } = useAppPick("dialog", "resolveDialog");
  const [text, setText] = useState("");

  useEffect(() => {
    if (dialog?.kind === "prompt") setText(dialog.initial ?? "");
  }, [dialog]);

  // A dialog that follows straight on from another is a new one, so focus moves to it.
  const instance = useMemo(() => (dialog ? ++opened : 0), [dialog]);

  if (!dialog) return null;
  const cancel = () => resolveDialog(dialog.kind === "confirm" ? false : null);
  const ok = () => resolveDialog(dialog.kind === "confirm" ? true : text.trim());

  return (
    <Modal key={instance} title={dialog.title} onClose={cancel}>
      {dialog.body && <p className="muted dialog-body">{dialog.body}</p>}
      {dialog.kind === "prompt" && (
        <input
          autoFocus
          value={text}
          placeholder={dialog.placeholder}
          {...(dialog.secret
            ? { type: "password", inputMode: "numeric" as const, autoComplete: "off", className: "pin-input" }
            : {})}
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
    </Modal>
  );
}
