import { useRef, useState } from "react";

/**
 * Drag a table row by its handle to move it up or down the list (the behaviour
 * buttons in Settings). `onMove(from, to)` runs once, when the row is dropped.
 *
 * Reordering uses pointer events rather than native HTML5 drag-and-drop: the
 * latter never fires reliably inside the Tauri WebView (the handle looks
 * grabbable but the row won't move), so we drive it the same way the room
 * layout designer drags desks.
 */
export function useRowReorder<T extends HTMLElement>(onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // Row elements, kept so a pointer drag can hit-test which row it is over.
  const rowRefs = useRef<Array<T | null>>([]);

  const rowIndexAt = (clientY: number): number => {
    const rows = rowRefs.current;
    for (let i = 0; i < rows.length; i++) {
      const el = rows[i];
      if (el && clientY < el.getBoundingClientRect().top + el.offsetHeight / 2) return i;
    }
    return Math.max(0, rows.length - 1);
  };

  const endDrag = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) onMove(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

  return {
    /** For the row's `ref`. */
    rowRef: (i: number) => (el: T | null) => {
      rowRefs.current[i] = el;
    },
    /** The row being dragged, and the row it would land on. */
    rowClass: (i: number) => `${dragIndex === i ? "dragging" : ""} ${overIndex === i && dragIndex !== i ? "drag-over" : ""}`,
    /** Spread onto the drag handle. */
    handle: (i: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragIndex(i);
        setOverIndex(i);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (dragIndex === null) return;
        setOverIndex(rowIndexAt(e.clientY));
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    }),
  };
}
