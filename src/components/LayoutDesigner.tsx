import { useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { newId } from "../lib/id";
import { DEFAULT_DESK_SIZES, Desk, DeskShape, FrontEdge } from "../lib/types";
import RoomCanvas, { GRID, ROOM_H, ROOM_W, toRoomCoords } from "./RoomCanvas";

const PALETTE: Array<{ shape: DeskShape; label: string }> = [
  { shape: "single", label: "+ Single desk" },
  { shape: "double", label: "+ Double desk" },
  { shape: "group4", label: "+ Group of 4" },
  { shape: "group6", label: "+ Group of 6" },
  { shape: "teacher", label: "+ Teacher desk" },
  { shape: "door", label: "+ Door" },
  { shape: "window", label: "+ Window" },
  { shape: "label", label: "+ Label box" },
];

const EDGES: Array<{ value: FrontEdge; label: string }> = [
  { value: "top", label: "Front: top" },
  { value: "right", label: "Front: right" },
  { value: "bottom", label: "Front: bottom" },
  { value: "left", label: "Front: left" },
];

const MIN_CROP = 220;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Drag =
  | { kind: "desk"; deskId: string; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "crop-move"; offsetX: number; offsetY: number }
  | { kind: "crop-resize" };

export default function LayoutDesigner() {
  const { currentClass, desks, setDesks, roomConfig, setRoomConfig, showToast } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  // Local copies during drags so we only hit the disk on drop.
  const [draft, setDraft] = useState<Desk[] | null>(null);
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const shown = draft ?? desks;
  const crop = cropDraft ?? roomConfig.crop;
  const selectedDesk = shown.find((d) => d.id === selected) ?? null;

  const addDesk = (shape: DeskShape) => {
    const size = DEFAULT_DESK_SIZES[shape];
    const desk: Desk = {
      id: newId("d"),
      label: shape === "label" ? "Label" : "",
      shape,
      x: snap(ROOM_W / 2 - size.w / 2),
      y: snap(ROOM_H / 2 - size.h / 2),
      w: size.w,
      h: size.h,
      rotation: 0,
      color: "",
    };
    void setDesks([...desks, desk]);
    setSelected(desk.id);
  };

  const startDeskDrag = (deskId: string, e: React.PointerEvent) => {
    const svg = (e.target as Element).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const desk = shown.find((d) => d.id === deskId)!;
    drag.current = { kind: "desk", deskId, offsetX: e.clientX - rect.left - desk.x, offsetY: e.clientY - rect.top - desk.y, moved: false };
    setSelected(deskId);
    setDraft(desks);
  };

  const startCropDrag = (mode: "crop-move" | "crop-resize", e: React.PointerEvent) => {
    if (!crop) return;
    e.stopPropagation();
    const svg = (e.target as Element).closest("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    drag.current =
      mode === "crop-move"
        ? { kind: "crop-move", offsetX: e.clientX - rect.left - crop.x, offsetY: e.clientY - rect.top - crop.y }
        : { kind: "crop-resize" };
    setCropDraft(crop);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toRoomCoords(e);
    if (d.kind === "desk" && draft) {
      d.moved = true;
      setDraft(
        draft.map((desk) =>
          desk.id === d.deskId
            ? {
                ...desk,
                x: clamp(snap(x - d.offsetX), 0, ROOM_W - desk.w),
                y: clamp(snap(y - d.offsetY), 20, ROOM_H - desk.h),
              }
            : desk,
        ),
      );
    } else if (d.kind === "crop-move" && cropDraft) {
      setCropDraft({
        ...cropDraft,
        x: clamp(snap(x - d.offsetX), 0, ROOM_W - cropDraft.w),
        y: clamp(snap(y - d.offsetY), 0, ROOM_H - cropDraft.h),
      });
    } else if (d.kind === "crop-resize" && cropDraft) {
      setCropDraft({
        ...cropDraft,
        w: clamp(snap(x) - cropDraft.x, MIN_CROP, ROOM_W - cropDraft.x),
        h: clamp(snap(y) - cropDraft.y, MIN_CROP * 0.7, ROOM_H - cropDraft.y),
      });
    }
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "desk" && draft) {
      if (d.moved) void setDesks(draft);
      setDraft(null);
    } else if ((d.kind === "crop-move" || d.kind === "crop-resize") && cropDraft) {
      void setRoomConfig({ ...roomConfig, crop: cropDraft });
      setCropDraft(null);
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
    const copy: Desk = {
      ...selectedDesk,
      id: newId("d"),
      x: Math.min(ROOM_W - selectedDesk.w, selectedDesk.x + GRID * 2),
      y: Math.min(ROOM_H - selectedDesk.h, selectedDesk.y + GRID * 2),
    };
    void setDesks([...desks, copy]);
    setSelected(copy.id);
  };

  const clearRoom = () => {
    if (!confirm("Remove every desk from this room layout?")) return;
    void setDesks([]);
    setSelected(null);
    showToast("Room cleared");
  };

  const addCrop = () => {
    // Start from the bounding box of everything placed, with padding.
    const placed = desks.length ? desks : null;
    const minX = placed ? Math.min(...placed.map((d) => d.x)) : ROOM_W * 0.1;
    const minY = placed ? Math.min(...placed.map((d) => d.y)) : ROOM_H * 0.1;
    const maxX = placed ? Math.max(...placed.map((d) => d.x + d.w)) : ROOM_W * 0.9;
    const maxY = placed ? Math.max(...placed.map((d) => d.y + d.h)) : ROOM_H * 0.9;
    const pad = GRID * 2;
    const cropRect = {
      x: clamp(snap(minX - pad), 0, ROOM_W - MIN_CROP),
      y: clamp(snap(minY - pad), 0, ROOM_H - MIN_CROP),
      w: 0,
      h: 0,
    };
    cropRect.w = clamp(snap(maxX + pad) - cropRect.x, MIN_CROP, ROOM_W - cropRect.x);
    cropRect.h = clamp(snap(maxY + pad) - cropRect.y, MIN_CROP * 0.7, ROOM_H - cropRect.y);
    void setRoomConfig({ ...roomConfig, crop: cropRect });
    showToast("View crop set — seating and lesson views now zoom to this area");
  };

  const removeCrop = () => void setRoomConfig({ ...roomConfig, crop: null });

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Room layout</h1>
        <select
          value={roomConfig.frontEdge}
          onChange={(e) => void setRoomConfig({ ...roomConfig, frontEdge: e.target.value as FrontEdge })}
          title="Which edge of the canvas is the front of the room"
        >
          {EDGES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        {crop ? (
          <button onClick={removeCrop}>Remove view crop</button>
        ) : (
          <button onClick={addCrop} title="Seating and lesson views will show only this area, scaled up">
            ⛶ Set view crop
          </button>
        )}
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
      </div>
      {selectedDesk && (
        <div className="palette">
          <button onClick={rotateSelected}>⟳ Rotate</button>
          <button onClick={duplicateSelected}>⧉ Duplicate</button>
          <input
            style={{ width: 160 }}
            placeholder={selectedDesk.shape === "label" ? "Label text" : "Desk label"}
            value={selectedDesk.label}
            onChange={(e) => patchSelected({ label: e.target.value })}
          />
          <input
            type="color"
            title="Fill colour"
            value={selectedDesk.color || "#eef2f6"}
            onChange={(e) => patchSelected({ color: e.target.value })}
            style={{ padding: 1, width: 44, height: 30 }}
          />
          {selectedDesk.color && (
            <button className="small" onClick={() => patchSelected({ color: "" })}>
              Reset colour
            </button>
          )}
          <button className="danger" onClick={deleteSelected}>
            ✕ Delete
          </button>
        </div>
      )}

      <RoomCanvas
        desks={shown}
        selectedDeskId={selected}
        editable
        frontEdge={roomConfig.frontEdge}
        onDeskPointerDown={startDeskDrag}
        onCanvasPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
        onCanvasPointerMove={onMove}
        onCanvasPointerUp={endDrag}
      >
        {crop && (
          <>
            <rect
              className="crop-rect"
              x={crop.x}
              y={crop.y}
              width={crop.w}
              height={crop.h}
              onPointerDown={(e) => startCropDrag("crop-move", e)}
            />
            <rect
              className="crop-handle"
              x={crop.x + crop.w - 7}
              y={crop.y + crop.h - 7}
              width={14}
              height={14}
              rx={3}
              onPointerDown={(e) => startCropDrag("crop-resize", e)}
            />
          </>
        )}
      </RoomCanvas>
      <p className="muted">
        Drag desks to arrange your room — they snap to the grid. Select a desk to rotate, recolour, label, duplicate
        or delete it. Label boxes are free text blocks for anything in the room. Use “Front:” to say which edge the
        whiteboard is on, and “Set view crop” (dashed rectangle — drag to move, corner square to resize) to zoom every
        seating view to just the used part of the room.
      </p>
    </div>
  );
}
