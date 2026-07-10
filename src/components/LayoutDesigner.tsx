import { useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { newId } from "../lib/id";
import { DEFAULT_DESK_SIZES, Desk, DeskShape } from "../lib/types";
import RoomCanvas, { GRID, ROOM_H, ROOM_W, toRoomCoords } from "./RoomCanvas";

const PALETTE: Array<{ shape: DeskShape; label: string }> = [
  { shape: "single", label: "+ Single desk" },
  { shape: "double", label: "+ Double desk" },
  { shape: "group4", label: "+ Group of 4" },
  { shape: "group6", label: "+ Group of 6" },
  { shape: "teacher", label: "+ Teacher desk" },
  { shape: "door", label: "+ Door" },
  { shape: "window", label: "+ Window" },
];

const snap = (v: number) => Math.round(v / GRID) * GRID;

export default function LayoutDesigner() {
  const { currentClass, desks, setDesks, showToast } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ deskId: string; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  // Local copy during drags so we only hit the disk on drop.
  const [draft, setDraft] = useState<Desk[] | null>(null);
  const shown = draft ?? desks;
  const selectedDesk = shown.find((d) => d.id === selected) ?? null;

  const addDesk = (shape: DeskShape) => {
    const size = DEFAULT_DESK_SIZES[shape];
    const desk: Desk = {
      id: newId("d"),
      label: "",
      shape,
      x: snap(ROOM_W / 2 - size.w / 2),
      y: snap(ROOM_H / 2 - size.h / 2),
      w: size.w,
      h: size.h,
      rotation: 0,
    };
    void setDesks([...desks, desk]);
    setSelected(desk.id);
  };

  const startDrag = (deskId: string, e: React.PointerEvent) => {
    const svg = (e.target as Element).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const desk = shown.find((d) => d.id === deskId)!;
    drag.current = { deskId, offsetX: e.clientX - rect.left - desk.x, offsetY: e.clientY - rect.top - desk.y, moved: false };
    setSelected(deskId);
    setDraft(desks);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !draft) return;
    const { x, y } = toRoomCoords(e);
    const { deskId, offsetX, offsetY } = drag.current;
    drag.current.moved = true;
    setDraft(
      draft.map((d) =>
        d.id === deskId
          ? {
              ...d,
              x: Math.max(0, Math.min(ROOM_W - d.w, snap(x - offsetX))),
              y: Math.max(20, Math.min(ROOM_H - d.h, snap(y - offsetY))),
            }
          : d,
      ),
    );
  };

  const endDrag = () => {
    if (drag.current && draft) {
      if (drag.current.moved) void setDesks(draft);
      setDraft(null);
    }
    drag.current = null;
  };

  const patchSelected = (patch: Partial<Desk>) => {
    if (!selectedDesk) return;
    void setDesks(desks.map((d) => (d.id === selectedDesk.id ? { ...d, ...patch } : d)));
  };

  const rotateSelected = () => patchSelected({ rotation: ((selectedDesk?.rotation ?? 0) + 90) % 360 });

  const deleteSelected = () => {
    if (!selectedDesk) return;
    void setDesks(desks.filter((d) => d.id !== selectedDesk.id));
    setSelected(null);
  };

  const duplicateSelected = () => {
    if (!selectedDesk) return;
    const copy: Desk = { ...selectedDesk, id: newId("d"), x: Math.min(ROOM_W - selectedDesk.w, selectedDesk.x + GRID * 2), y: Math.min(ROOM_H - selectedDesk.h, selectedDesk.y + GRID * 2) };
    void setDesks([...desks, copy]);
    setSelected(copy.id);
  };

  const clearRoom = () => {
    if (!confirm("Remove every desk from this room layout?")) return;
    void setDesks([]);
    setSelected(null);
    showToast("Room cleared");
  };

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Room layout</h1>
        <div className="spacer" />
        <button onClick={clearRoom} disabled={desks.length === 0}>
          Clear room
        </button>
      </div>

      <div className="palette">
        {PALETTE.map((p) => (
          <button key={p.shape} onClick={() => addDesk(p.shape)}>
            {p.label}
          </button>
        ))}
        {selectedDesk && (
          <>
            <span style={{ width: 12 }} />
            <button onClick={rotateSelected}>⟳ Rotate</button>
            <button onClick={duplicateSelected}>⧉ Duplicate</button>
            <input
              style={{ width: 140 }}
              placeholder="Desk label"
              value={selectedDesk.label}
              onChange={(e) => patchSelected({ label: e.target.value })}
            />
            <button className="danger" onClick={deleteSelected}>
              ✕ Delete
            </button>
          </>
        )}
      </div>

      <RoomCanvas
        desks={shown}
        selectedDeskId={selected}
        editable
        onDeskPointerDown={startDrag}
        onCanvasPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
        onCanvasPointerMove={onMove}
        onCanvasPointerUp={endDrag}
      />
      <p className="muted">
        Drag desks to arrange your room — they snap to the grid. Select a desk to rotate, label, duplicate or delete
        it. Seats appear automatically on each desk. The top edge is the front of the room.
      </p>
    </div>
  );
}
