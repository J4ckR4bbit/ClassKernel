import { ReactNode, useRef, useState } from "react";
import { NEEDS_DATA_FOLDER, useAppPick, useWorkingFromCopy } from "../store/appStore";
import { newId } from "../lib/id";
import { DEFAULT_DESK_SIZES, Desk, DeskShape, FrontEdge } from "../lib/types";
import { PASTEL_PRESETS } from "../lib/tableColours";
import { useCanvasZoom } from "../hooks/useCanvasZoom";
import { useDismissOnOutside } from "../hooks/useDismissOnOutside";
import RoomCanvas, { GRID, ROOM_H, ROOM_W, svgPointFromClient, toRoomCoords } from "./RoomCanvas";
import Icon from "./Icon";

const PALETTE: Array<{ shape: DeskShape; label: string; title: string }> = [
  { shape: "single", label: "Single", title: "Add a single desk" },
  { shape: "double", label: "Double", title: "Add a double desk" },
  { shape: "group4", label: "Group of 4", title: "Add a group of 4" },
  { shape: "group6", label: "Group of 6", title: "Add a group of 6" },
  { shape: "teacher", label: "Teacher", title: "Add the teacher's desk" },
  { shape: "door", label: "Door", title: "Add a door" },
  { shape: "window", label: "Window", title: "Add a window" },
  { shape: "label", label: "Label box", title: "Add a label box: free text for anything in the room" },
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

/** What a drag on the canvas leaves to the item's own drag. */
const ITEMS = ".desk, .crop-rect, .crop-handle";

const MIN_CROP = 220;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Drag =
  | { kind: "desk"; deskId: string; offsetX: number; offsetY: number; moved: boolean }
  | { kind: "crop-move"; offsetX: number; offsetY: number }
  | { kind: "crop-resize" };

/**
 * The room designer. The toolbar (and the Add column beside the canvas) stay
 * put; only the room scrolls and zooms, inside its own view.
 */
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

  /** A pan or pinch took over mid-drag: whatever was being dragged goes back where it was. */
  const cancelDrag = () => {
    drag.current = null;
    setDraft(null);
    setCropDraft(null);
  };

  const view = useCanvasZoom({
    roomW: ROOM_W,
    roomH: ROOM_H,
    itemSelector: ITEMS,
    onGestureStart: cancelDrag,
    onFloorTap: () => setSelected(null),
  });

  const addDesk = (shape: DeskShape) => {
    const size = DEFAULT_DESK_SIZES[shape];
    // In the middle of what's on screen, so it's in view however far in you've zoomed.
    const at = view.visibleCentre() ?? { x: ROOM_W / 2, y: ROOM_H / 2 };
    const desk: Desk = {
      id: newId("d"),
      label: shape === "label" ? "Label" : "",
      shape,
      x: clamp(snap(at.x - size.w / 2), 0, ROOM_W - size.w),
      y: clamp(snap(at.y - size.h / 2), 20, ROOM_H - size.h),
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
    void saveLayoutTemplate(name).then((saved) => {
      if (saved) showToast(`Layout saved as template "${name}"`);
    });
  };

  const loadTemplate = async (name: string) => {
    const ok = await confirmDialog({
      title: `Apply layout "${name}"?`,
      body: "The current desks in this room are replaced by the template's.",
      confirmLabel: "Apply layout",
    });
    if (!ok) return;
    void applyLayoutTemplate(name).then((applied) => {
      if (!applied) return;
      setSelected(null);
      showToast(`Applied layout "${name}"`);
    });
  };

  const removeTemplate = async (name: string) => {
    const ok = await confirmDialog({ title: `Delete template "${name}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    void deleteLayoutTemplate(name).then((deleted) => {
      if (deleted) showToast(`Template "${name}" deleted`);
    });
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
    <div className="layout-designer">
      <div className="layout-toolbar">
        {/* The whole room. */}
        <div className="layout-row">
          <select
            value={roomConfig.frontEdge}
            onChange={(e) => void setRoomConfig({ ...roomConfig, frontEdge: e.target.value as FrontEdge })}
            title="Which edge of the room is the front (the whiteboard)"
            aria-label="Front of the room"
          >
            {EDGES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          {crop ? (
            <button className="small" onClick={removeCrop}>
              <Icon name="crop" size={18} /> Remove view crop
            </button>
          ) : (
            <button className="small" onClick={addCrop} title="Seating and lesson views will show only this area, scaled up">
              <Icon name="crop" size={18} /> Set view crop
            </button>
          )}
          <Popover label="Text size" icon="tune">
            <div className="popover-label">Text size</div>
            <FontStepper label="Seats" value={roomConfig.seatFontScale} onBump={(d) => bumpFont("seatFontScale", d)} />
            <FontStepper label="Desks" value={roomConfig.deskFontScale} onBump={(d) => bumpFont("deskFontScale", d)} />
            <FontStepper label="Labels" value={roomConfig.labelFontScale} onBump={(d) => bumpFont("labelFontScale", d)} />
          </Popover>
          <Popover label="Templates" icon="save" count={layoutTemplates.length}>
            {(close) => (
              <>
                <button
                  className="small popover-wide"
                  onClick={() => {
                    close();
                    void saveTemplate();
                  }}
                  disabled={desks.length === 0}
                  title="Save this room to reuse in another class"
                >
                  <Icon name="save" size={18} /> Save as template
                </button>
                <div className="popover-label">{layoutTemplates.length ? "Apply a template" : "No templates saved yet."}</div>
                {layoutTemplates.map((name) => (
                  <span key={name} className="template-chip">
                    <button
                      className="small"
                      title="Apply this layout"
                      onClick={() => {
                        close();
                        void loadTemplate(name);
                      }}
                    >
                      {name}
                    </button>
                    <button
                      className="icon-only small danger"
                      title={fromCopy ? NEEDS_DATA_FOLDER : "Delete template"}
                      aria-label={`Delete template ${name}`}
                      disabled={fromCopy}
                      onClick={() => {
                        close();
                        void removeTemplate(name);
                      }}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </span>
                ))}
              </>
            )}
          </Popover>
          <div className="spacer" />
          <button className="small" onClick={() => void clearRoom()} disabled={desks.length === 0}>
            Clear room
          </button>
        </div>

        {/* The selected item; a hint when there isn't one, so the canvas doesn't jump. */}
        <div className="layout-row" aria-label={selectedDesk ? "Selected item" : undefined} role={selectedDesk ? "group" : undefined}>
          {selectedDesk ? (
            <>
              <input
                className="desk-label-input"
                placeholder={selectedDesk.shape === "label" ? "Label text" : "Desk label"}
                aria-label={selectedDesk.shape === "label" ? "Label text" : "Desk label"}
                value={selectedDesk.label}
                onChange={(e) => patchSelected({ label: e.target.value })}
              />
              <button className="small icon-only" onClick={rotateSelected} title="Rotate 90°" aria-label="Rotate">
                <Icon name="rotate_right" size={18} />
              </button>
              <button className="small icon-only" onClick={duplicateSelected} title="Duplicate" aria-label="Duplicate">
                <Icon name="content_copy" size={18} />
              </button>
              <span className="layout-sep" aria-hidden />
              <span className="muted layout-caption">Fill</span>
              <div className="swatch-row" role="group" aria-label="Fill colour">
                <button
                  className={`swatch none ${selectedDesk.color ? "" : "on"}`}
                  title="Default fill"
                  aria-label="Default fill"
                  onClick={() => patchSelected({ color: "" })}
                />
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
                <input
                  type="color"
                  title="Custom fill colour"
                  aria-label="Custom fill colour"
                  value={selectedDesk.color || "#eef2f6"}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                />
              </div>
              <span className="layout-sep" aria-hidden />
              <span className="muted layout-caption">Text</span>
              <div className="swatch-row" role="group" aria-label="Text colour">
                <button
                  className={`swatch none ${selectedDesk.textColor ? "" : "on"}`}
                  title="Default text colour"
                  aria-label="Default text colour"
                  onClick={() => patchSelected({ textColor: "" })}
                />
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
                <input
                  type="color"
                  title="Custom text colour"
                  aria-label="Custom text colour"
                  value={selectedDesk.textColor || "#5c6b7a"}
                  onChange={(e) => patchSelected({ textColor: e.target.value })}
                />
              </div>
              <span className="layout-sep" aria-hidden />
              <div className="stepper" title="Width">
                <span className="stepper-label">W</span>
                <button onClick={() => resizeSelected(-GRID, 0)} aria-label="Narrower">−</button>
                <span>{selectedDesk.w}</span>
                <button onClick={() => resizeSelected(GRID, 0)} aria-label="Wider">+</button>
              </div>
              <div className="stepper" title="Height">
                <span className="stepper-label">H</span>
                <button onClick={() => resizeSelected(0, -GRID)} aria-label="Shorter">−</button>
                <span>{selectedDesk.h}</span>
                <button onClick={() => resizeSelected(0, GRID)} aria-label="Taller">+</button>
              </div>
              <button className="small danger" onClick={deleteSelected}>
                <Icon name="delete" size={18} /> Delete
              </button>
            </>
          ) : (
            <span className="muted layout-hint">
              Select a desk to label, colour, rotate, resize or delete it. Drag the floor to move around; pinch or
              Ctrl + scroll to zoom; hold Space and drag to pan.
            </span>
          )}
        </div>
      </div>

      <div className="layout-work">
        <div className="layout-add" role="group" aria-label="Add to the room">
          <span className="muted layout-caption">Add</span>
          <div className="layout-add-buttons">
            {PALETTE.map((p) => (
              <button key={p.shape} className="small" title={p.title} onClick={() => addDesk(p.shape)}>
                <Icon name="add" size={18} /> {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="layout-frame">
          <div {...view.viewportProps} tabIndex={0} aria-label="Room plan: drag to scroll, pinch or Ctrl + scroll to zoom">
            <div className="layout-stage">
              <RoomCanvas
                desks={shown}
                selectedDeskId={selected}
                editable
                zoom={view.zoom}
                frontEdge={roomConfig.frontEdge}
                seatFontScale={roomConfig.seatFontScale}
                deskFontScale={roomConfig.deskFontScale}
                labelFontScale={roomConfig.labelFontScale}
                onDeskPointerDown={startDeskDrag}
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
            </div>
          </div>

          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button className="small icon-only" onClick={view.zoomOut} disabled={!view.canZoomOut} title="Zoom out (Ctrl −)" aria-label="Zoom out">
              −
            </button>
            <button className="small zoom-level" onClick={view.actualSize} title="Actual size (Ctrl 1)">
              {Math.round(view.zoom * 100)}%
            </button>
            <button className="small icon-only" onClick={view.zoomIn} disabled={!view.canZoomIn} title="Zoom in (Ctrl +)" aria-label="Zoom in">
              +
            </button>
            <button
              className={`small ${view.isFit ? "on" : ""}`}
              onClick={view.fitRoom}
              aria-pressed={view.isFit}
              title="Fit the whole room (Ctrl 0)"
            >
              Fit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A toolbar button that opens a small panel under it (closed by a tap outside
 * or Escape). Children may be a function given `close`, for actions that open
 * a dialog.
 */
function Popover({
  label,
  icon,
  count,
  children,
}: {
  label: string;
  icon: "tune" | "save";
  count?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(box, open, () => {
    const inside = box.current?.contains(document.activeElement);
    setOpen(false);
    if (inside) toggle.current?.focus();
  });
  // Focus goes back to the toggle, so a dialog opened from the panel hands it back there.
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <div className="popover-anchor" ref={box}>
      <button ref={toggle} className={`small ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={18} /> {label}
        {count ? <span className="popover-count">{count}</span> : null}
        <Icon name="arrow_drop_down" size={18} />
      </button>
      {open && (
        <div className="popover-panel" role="group" aria-label={label}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

/** A −/value/+ stepper for one of the room's font-size multipliers. */
function FontStepper({ label, value, onBump }: { label: string; value: number; onBump: (delta: number) => void }) {
  return (
    <div className="stepper" title={`${label} text size`}>
      <span className="stepper-label">{label}</span>
      <button onClick={() => onBump(-0.1)} disabled={value <= 0.5} aria-label={`Smaller ${label.toLowerCase()} text`}>
        −
      </button>
      <span>{Math.round(value * 100)}%</span>
      <button onClick={() => onBump(0.1)} disabled={value >= 3} aria-label={`Larger ${label.toLowerCase()} text`}>
        +
      </button>
    </div>
  );
}
