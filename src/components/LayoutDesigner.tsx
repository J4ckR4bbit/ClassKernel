import { useRef, useState } from "react";
import { NEEDS_DATA_FOLDER, useAppPick, useWorkingFromCopy } from "../store/appStore";
import { newId } from "../lib/id";
import { DEFAULT_DESK_SIZES, Desk, DeskShape, FrontEdge } from "../lib/types";
import { PASTEL_PRESETS } from "../lib/tableColours";
import RoomCanvas, { GRID, ROOM_H, ROOM_W, svgPointFromClient, toRoomCoords } from "./RoomCanvas";
import Icon from "./Icon";

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

/** Text colours: the two that read on any fill, plus a picker for the rest. */
const TEXT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#ffffff" },
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
  const fromCopy = useWorkingFromCopy();
  const {
    desks,
    setDesks,
    roomConfig,
    setRoomConfig,
    showToast,
    layoutTemplates,
    saveLayoutTemplate,
    applyLayoutTemplate,
    deleteLayoutTemplate,
    confirmDialog,
    promptDialog,
  } = useAppPick(
    "desks",
    "setDesks",
    "roomConfig",
    "setRoomConfig",
    "showToast",
    "layoutTemplates",
    "saveLayoutTemplate",
    "applyLayoutTemplate",
    "deleteLayoutTemplate",
    "confirmDialog",
    "promptDialog",
  );
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
      textColor: "",
      stripColor: "",
    };
    void setDesks([...desks, desk]);
    setSelected(desk.id);
  };

  const startDeskDrag = (deskId: string, e: React.PointerEvent) => {
    const svg = (e.target as Element).closest("svg");
    if (!svg) return;
    // Capture on the canvas so a fast finger/mouse can't escape the drag.
    svg.setPointerCapture(e.pointerId);
    const { x, y } = svgPointFromClient(svg as unknown as SVGSVGElement, e.clientX, e.clientY);
    const desk = shown.find((d) => d.id === deskId)!;
    drag.current = { kind: "desk", deskId, offsetX: x - desk.x, offsetY: y - desk.y, moved: false };
    setSelected(deskId);
    setDraft(desks);
  };

  const startCropDrag = (mode: "crop-move" | "crop-resize", e: React.PointerEvent) => {
    if (!crop) return;
    e.stopPropagation();
    const svg = (e.target as Element).closest("svg");
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const { x, y } = svgPointFromClient(svg as unknown as SVGSVGElement, e.clientX, e.clientY);
    drag.current =
      mode === "crop-move" ? { kind: "crop-move", offsetX: x - crop.x, offsetY: y - crop.y } : { kind: "crop-resize" };
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

  const resizeSelected = (dw: number, dh: number) => {
    if (!selectedDesk) return;
    patchSelected({
      w: clamp(selectedDesk.w + dw, GRID, ROOM_W - selectedDesk.x),
      h: clamp(selectedDesk.h + dh, GRID, ROOM_H - selectedDesk.y),
    });
  };

  type ScaleKey = "seatFontScale" | "deskFontScale" | "labelFontScale";
  const bumpFont = (key: ScaleKey, delta: number) => {
    const v = Math.min(3, Math.max(0.5, Math.round((roomConfig[key] + delta) * 10) / 10));
    void setRoomConfig({ ...roomConfig, [key]: v });
  };

  const saveTemplate = async () => {
    const raw = (
      await promptDialog({ title: "Save as template", body: "Save this room layout to reuse in another class.", placeholder: "Template name" })
    )?.trim();
    const name = raw?.replace(/[<>:"/\\|?*]/g, "").trim();
    if (!name) return;
    if (
      layoutTemplates.includes(name) &&
      !(await confirmDialog({ title: `Overwrite template "${name}"?`, confirmLabel: "Overwrite" }))
    )
      return;
    void saveLayoutTemplate(name).then(() => showToast(`Layout saved as template "${name}"`));
  };

  const loadTemplate = async (name: string) => {
    const ok = await confirmDialog({
      title: `Apply layout "${name}"?`,
      body: "The current desks in this room are replaced by the template's.",
      confirmLabel: "Apply layout",
    });
    if (!ok) return;
    void applyLayoutTemplate(name).then(() => {
      setSelected(null);
      showToast(`Applied layout "${name}"`);
    });
  };

  const removeTemplate = async (name: string) => {
    const ok = await confirmDialog({ title: `Delete template "${name}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    void deleteLayoutTemplate(name).then(() => showToast(`Template "${name}" deleted`));
  };

  const deleteSelected = () => {
    if (!selectedDesk) return;
    const previous = desks;
    void setDesks(desks.filter((d) => d.id !== selectedDesk.id));
    setSelected(null);
    showToast("Desk deleted", { label: "Undo", run: () => void setDesks(previous) });
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

  const clearRoom = async () => {
    const ok = await confirmDialog({
      title: "Clear the room?",
      body: "Every desk is removed from this room layout.",
      confirmLabel: "Clear room",
      danger: true,
    });
    if (!ok) return;
    const previous = desks;
    void setDesks([]);
    setSelected(null);
    showToast("Room cleared", { label: "Undo", run: () => void setDesks(previous) });
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
            <Icon name="crop" size={20} /> Set view crop
          </button>
        )}
        <div className="spacer" />
        <button onClick={() => void clearRoom()} disabled={desks.length === 0}>
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
          <button onClick={rotateSelected}><Icon name="rotate_right" size={20} /> Rotate</button>
          <button onClick={duplicateSelected}><Icon name="content_copy" size={20} /> Duplicate</button>
          <input
            style={{ width: 160 }}
            placeholder={selectedDesk.shape === "label" ? "Label text" : "Desk label"}
            value={selectedDesk.label}
            onChange={(e) => patchSelected({ label: e.target.value })}
          />
          <div className="swatch-row" role="group" aria-label="Preset fill colours">
            {PASTEL_PRESETS.map((c) => (
              <button
                key={c.hex}
                className={`swatch ${selectedDesk.color === c.hex ? "on" : ""}`}
                style={{ background: c.hex }}
                title={c.name}
                aria-label={`Fill ${c.name}`}
                onClick={() => patchSelected({ color: c.hex })}
              />
            ))}
          </div>
          <input
            type="color"
            title="Custom fill colour"
            value={selectedDesk.color || "#eef2f6"}
            onChange={(e) => patchSelected({ color: e.target.value })}
            style={{ padding: 1, width: 52, height: 36 }}
          />
          {selectedDesk.color && (
            <button className="small" onClick={() => patchSelected({ color: "" })}>
              Reset fill
            </button>
          )}
          <span className="muted" style={{ marginLeft: 4 }}>
            Text
          </span>
          <div className="swatch-row" role="group" aria-label="Text colour">
            {TEXT_PRESETS.map((c) => (
              <button
                key={c.hex}
                className={`swatch ${selectedDesk.textColor === c.hex ? "on" : ""}`}
                style={{ background: c.hex }}
                title={`${c.name} text`}
                aria-label={`${c.name} text`}
                onClick={() => patchSelected({ textColor: c.hex })}
              />
            ))}
          </div>
          <input
            type="color"
            title="Custom text colour"
            value={selectedDesk.textColor || "#5c6b7a"}
            onChange={(e) => patchSelected({ textColor: e.target.value })}
            style={{ padding: 1, width: 52, height: 36 }}
          />
          {selectedDesk.textColor && (
            <button className="small" onClick={() => patchSelected({ textColor: "" })}>
              Reset text
            </button>
          )}
          <span className="muted" style={{ marginLeft: 4 }}>
            Size
          </span>
          <div className="stepper">
            <span className="stepper-label">Width</span>
            <button onClick={() => resizeSelected(-GRID, 0)}>−</button>
            <span>{selectedDesk.w}</span>
            <button onClick={() => resizeSelected(GRID, 0)}>+</button>
          </div>
          <div className="stepper">
            <span className="stepper-label">Height</span>
            <button onClick={() => resizeSelected(0, -GRID)}>−</button>
            <span>{selectedDesk.h}</span>
            <button onClick={() => resizeSelected(0, GRID)}>+</button>
          </div>
          <button className="danger" onClick={deleteSelected}>
            <Icon name="delete" size={20} /> Delete
          </button>
        </div>
      )}

      <div className="palette layout-tools">
        <span className="muted">Text size:</span>
        <FontStepper label="Seats" value={roomConfig.seatFontScale} onBump={(d) => bumpFont("seatFontScale", d)} />
        <FontStepper label="Desks" value={roomConfig.deskFontScale} onBump={(d) => bumpFont("deskFontScale", d)} />
        <FontStepper label="Labels" value={roomConfig.labelFontScale} onBump={(d) => bumpFont("labelFontScale", d)} />
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted">Layouts:</span>
        <button onClick={() => void saveTemplate()} disabled={desks.length === 0} title="Save this room to reuse in another class">
          <Icon name="save" size={20} /> Save as template
        </button>
        {layoutTemplates.map((name) => (
          <span key={name} className="template-chip">
            <button className="small" title="Apply this layout" onClick={() => void loadTemplate(name)}>
              {name}
            </button>
            <button
              className="icon-only small danger"
              title={fromCopy ? NEEDS_DATA_FOLDER : "Delete template"}
              aria-label="Delete template"
              disabled={fromCopy}
              onClick={() => void removeTemplate(name)}
            >
              <Icon name="close" size={18} />
            </button>
          </span>
        ))}
      </div>

      <RoomCanvas
        desks={shown}
        selectedDeskId={selected}
        editable
        frontEdge={roomConfig.frontEdge}
        seatFontScale={roomConfig.seatFontScale}
        deskFontScale={roomConfig.deskFontScale}
        labelFontScale={roomConfig.labelFontScale}
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
              x={crop.x + crop.w - 10}
              y={crop.y + crop.h - 10}
              width={20}
              height={20}
              rx={3}
              onPointerDown={(e) => startCropDrag("crop-resize", e)}
            />
          </>
        )}
      </RoomCanvas>
      <p className="muted">
        Drag desks to arrange your room — they snap to the grid. Select a desk to rotate, recolour, resize (W/H),
        label, duplicate or delete it. Label boxes are free text blocks for anything in the room. Use “Text size” to
        scale seat names, desk labels and label boxes. Save a room as a template to reuse the same setup in another
        class. Use “Front:” to say which edge the whiteboard is on, and “Set view crop” to zoom every seating view to
        just the used part of the room.
      </p>
    </div>
  );
}

/** A −/value/+ stepper for one of the room's font-size multipliers. */
function FontStepper({ label, value, onBump }: { label: string; value: number; onBump: (delta: number) => void }) {
  return (
    <div className="stepper" title={`${label} text size`}>
      <span className="stepper-label">{label}</span>
      <button onClick={() => onBump(-0.1)} disabled={value <= 0.5}>
        −
      </button>
      <span>{Math.round(value * 100)}%</span>
      <button onClick={() => onBump(0.1)} disabled={value >= 3}>
        +
      </button>
    </div>
  );
}
