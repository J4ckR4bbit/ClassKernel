import { useEffect, useState } from "react";
import { BehaviourCode } from "../lib/types";
import { modalOpen } from "../components/Modal";

export interface BatchState {
  /** The behaviour being recorded; null while the teacher is choosing it. */
  code: BehaviourCode | null;
  /** Students tapped so far — nothing is saved until Save. */
  selected: string[];
}

/**
 * Batch entry: choose one behaviour, tap several students, save once. Used by
 * both the room-plan Live lesson and the teaching strip. Selecting never
 * records anything, so a mis-tap is fixed by tapping again before Save.
 */
export function useBatchEntry(onSave: (code: BehaviourCode, studentIds: string[]) => void) {
  const [batch, setBatch] = useState<BatchState | null>(null);
  const active = batch !== null;

  const start = () => setBatch({ code: null, selected: [] });
  const cancel = () => setBatch(null);
  const chooseItem = (code: BehaviourCode) => setBatch((b) => ({ code, selected: b?.selected ?? [] }));
  /** Back to the item list, keeping who is already selected. */
  const changeItem = () => setBatch((b) => (b ? { ...b, code: null } : b));
  const toggle = (studentId: string) =>
    setBatch((b) =>
      b
        ? {
            ...b,
            selected: b.selected.includes(studentId) ? b.selected.filter((id) => id !== studentId) : [...b.selected, studentId],
          }
        : b,
    );
  const isSelected = (studentId: string) => !!batch?.selected.includes(studentId);

  /** Record the batch, then straight back to the item list for the next one. */
  const save = () => {
    if (!batch?.code || batch.selected.length === 0) return;
    onSave(batch.code, batch.selected);
    setBatch({ code: null, selected: [] });
  };

  // Escape backs out of the batch before anything else sees it (in teaching
  // mode Escape would otherwise leave the mode entirely).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // An open dialog gets its own Escape.
      if (e.key !== "Escape" || modalOpen()) return;
      e.stopImmediatePropagation();
      setBatch(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  return { batch, active, start, cancel, chooseItem, changeItem, toggle, isSelected, save };
}

export type BatchEntry = ReturnType<typeof useBatchEntry>;
