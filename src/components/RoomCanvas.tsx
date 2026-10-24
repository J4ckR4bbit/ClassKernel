import { ReactNode } from "react";
import { Desk, FrontEdge } from "../lib/types";
import { seatSlots, SeatSlot } from "../lib/seating";
import { GRID, ROOM_H, ROOM_W } from "../lib/room";
import { IconGlyph, IconName } from "./Icon";

export { GRID, ROOM_H, ROOM_W };

export interface SeatContent {
  label: string; // short name to show on the seat (fallback when no name parts)
  firstName?: string; // first name shown on the top line
  lastName?: string; // surname shown smaller on the line below
  /** A small marker in the seat's corner: an icon (bathroom, absent) or a letter (L late, E excused). */
  badge?: SeatBadge;
  occupied: boolean;
  points?: number | null; // running behaviour points (lesson view)
  highlight?: boolean;
  /** Picked in batch entry: drawn solid with a tick, unmistakable from the rest. */
  selected?: boolean;
}

export interface SeatBadge {
  icon?: IconName;
  text?: string;
  /** Colour: out at the bathroom, absent, late or excused. */
  tone: "out" | "absent" | "late" | "excused";
  /** Said aloud and shown on hover, since the badge is only a mark. */
  label: string;
}

interface Props {
  desks: Desk[];
  selectedDeskId?: string | null;
  editable?: boolean;
  frontEdge?: FrontEdge;
  /** Font size multipliers (1 = default) for names, desk labels and label boxes. */
  seatFontScale?: number;
  deskFontScale?: number;
  labelFontScale?: number;
  /** Show only this region of the room, scaled up to the container width. */
  crop?: { x: number; y: number; w: number; h: number } | null;
  /**
   * Fill the containing box (teaching mode), drawing the room as large as it
   * fits without distortion, instead of sizing to the container's width.
   */
  fill?: boolean;
  seatContent?: (deskId: string, seatIndex: number) => SeatContent;
  /** x/y are pixel coordinates relative to the .canvas-wrap element (popover anchoring). */
  onSeatClick?: (deskId: string, seatIndex: number, x: number, y: number) => void;
  onDeskPointerDown?: (deskId: string, e: React.PointerEvent) => void;
  onCanvasPointerDown?: (e: React.PointerEvent) => void;
  onCanvasPointerMove?: (e: React.PointerEvent) => void;
  onCanvasPointerUp?: (e: React.PointerEvent) => void;
  children?: ReactNode;
}

/**
 * Client position → the unscaled designer canvas's room coordinates. Divides
 * out the app display zoom (client rects are in zoomed pixels; the SVG's
 * layout width is not).
 */
export function svgPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const zoom = svg.clientWidth > 0 ? rect.width / svg.clientWidth : 1;
  return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
}

/** Convert a pointer event to room coordinates (designer canvas is unscaled). */
export function toRoomCoords(e: { clientX: number; clientY: number; currentTarget: EventTarget }): { x: number; y: number } {
  return svgPointFromClient(e.currentTarget as SVGSVGElement, e.clientX, e.clientY);
}

const FRONT_TEXT = "▲ FRONT OF ROOM / WHITEBOARD ▲";

/** Anchored to the visible region so it stays on screen when the view is cropped. */
function FrontMarker({ edge, view }: { edge: FrontEdge; view: { x: number; y: number; w: number; h: number } }) {
  const mid = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  switch (edge) {
    case "top":
      return <text className="front-marker" x={mid.x} y={view.y + 14}>{FRONT_TEXT}</text>;
    case "bottom":
      return <text className="front-marker" x={mid.x} y={view.y + view.h - 5}>{FRONT_TEXT}</text>;
    case "left":
      return (
        <text className="front-marker" x={view.x + 14} y={mid.y} transform={`rotate(-90 ${view.x + 14} ${mid.y})`}>
          {FRONT_TEXT}
        </text>
      );
    case "right": {
      const rx = view.x + view.w - 14;
      return (
        <text className="front-marker" x={rx} y={mid.y} transform={`rotate(90 ${rx} ${mid.y})`}>
          {FRONT_TEXT}
        </text>
      );
    }
  }
}

export default function RoomCanvas({
  desks,
  selectedDeskId,
  editable,
  frontEdge = "top",
  seatFontScale = 1,
  deskFontScale = 1,
  labelFontScale = 1,
  crop,
  fill = false,
  seatContent,
  onSeatClick,
  onDeskPointerDown,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  children,
}: Props) {
  const view = crop ?? { x: 0, y: 0, w: ROOM_W, h: ROOM_H };
  const scaled = !!crop;
  const filling = scaled && fill;
  return (
    <div className={`canvas-wrap ${filling ? "fill" : ""}`}>
      <svg
        className={`room-canvas ${editable ? "editable" : ""}`}
        {...(scaled
          ? {
              viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
              style: filling ? { width: "100%", height: "100%" } : { width: "100%", height: "auto", aspectRatio: `${view.w} / ${view.h}` },
            }
          : { width: ROOM_W, height: ROOM_H })}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
      >
        {editable && (
          <g>
            {Array.from({ length: Math.floor(ROOM_W / GRID) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={ROOM_H} className="room-grid-line" />
            ))}
            {Array.from({ length: Math.floor(ROOM_H / GRID) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * GRID} x2={ROOM_W} y2={i * GRID} className="room-grid-line" />
            ))}
          </g>
        )}
        <FrontMarker edge={frontEdge} view={view} />

        {desks.map((d) => (
          <DeskShapeView
            key={d.id}
            desk={d}
            selected={d.id === selectedDeskId}
            seatFontScale={seatFontScale}
            deskFontScale={deskFontScale}
            labelFontScale={labelFontScale}
            seatContent={seatContent}
            onSeatClick={onSeatClick}
            onPointerDown={onDeskPointerDown ? (e) => onDeskPointerDown(d.id, e) : undefined}
          />
        ))}
        {children}
      </svg>
    </div>
  );
}

function DeskShapeView({
  desk,
  selected,
  seatFontScale,
  deskFontScale,
  labelFontScale,
  seatContent,
  onSeatClick,
  onPointerDown,
}: {
  desk: Desk;
  selected: boolean;
  seatFontScale: number;
  deskFontScale: number;
  labelFontScale: number;
  seatContent?: (deskId: string, seatIndex: number) => SeatContent;
  onSeatClick?: (deskId: string, seatIndex: number, x: number, y: number) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const cx = desk.x + desk.w / 2;
  const cy = desk.y + desk.h / 2;
  const slots = seatSlots(desk);
  const bodyClass =
    desk.shape === "teacher"
      ? "desk-body teacher"
      : desk.shape === "door"
        ? "desk-body door"
        : desk.shape === "window"
          ? "desk-body window"
          : desk.shape === "label"
            ? "desk-body label-block"
            : "desk-body";
  const caption =
    desk.label || (desk.shape === "teacher" ? "Teacher" : desk.shape === "door" ? "Door" : desk.shape === "window" ? "Window" : desk.shape === "label" ? "Label" : "");

  return (
    <g className={`desk ${selected ? "selected" : ""}`} onPointerDown={onPointerDown}>
      <g transform={`rotate(${desk.rotation} ${cx} ${cy})`}>
        <rect
          className={bodyClass}
          x={desk.x}
          y={desk.y}
          width={desk.w}
          height={desk.h}
          rx={6}
          style={desk.color ? { fill: desk.color } : undefined}
        />
        {caption &&
          (desk.shape === "label" ? (
            <text
              className="label-block-text"
              x={cx}
              y={cy}
              dominantBaseline="central"
              style={{ fontSize: 14 * labelFontScale, fill: desk.textColor || undefined }}
            >
              {caption}
            </text>
          ) : (
            <text
              className="desk-label"
              x={cx}
              y={desk.shape === "door" || desk.shape === "window" ? cy + 3.5 : desk.y + 13}
              // On a colour the teacher chose, dark ink in either theme.
              style={{ fontSize: 11 * deskFontScale, fill: desk.textColor || (desk.color ? "var(--on-tint)" : undefined) }}
            >
              {caption}
            </text>
          ))}
      </g>
      {slots.map((slot) => (
        <SeatView
          key={slot.seatIndex}
          slot={slot}
          rotation={desk.rotation}
          content={seatContent?.(desk.id, slot.seatIndex)}
          fontScale={seatFontScale}
          onSeatClick={onSeatClick ? (x, y) => onSeatClick(desk.id, slot.seatIndex, x, y) : undefined}
        />
      ))}
    </g>
  );
}

/** A single seat drawn as a rounded square filling its cell, with a two-line name. */
function SeatView({
  slot,
  rotation,
  content,
  fontScale,
  onSeatClick,
}: {
  slot: SeatSlot;
  rotation: number;
  content?: SeatContent;
  fontScale: number;
  onSeatClick?: (x: number, y: number) => void;
}) {
  // Rounded square that takes up (almost) the whole seat cell.
  const inset = 5;
  const rw = Math.max(20, slot.w - inset * 2);
  const rh = Math.max(20, slot.h - inset * 2);
  const rx = Math.min(14, Math.min(rw, rh) / 3);

  const hasPoints = content?.points !== undefined && content?.points !== null;
  const first = content?.firstName ?? content?.label ?? "";
  const last = content?.lastName ?? "";

  // Stack the text lines and centre the block vertically in the seat.
  const lines: Array<{ text: string; size: number; className: string }> = [];
  if (content?.occupied) {
    if (first) lines.push({ text: first, size: 13 * fontScale, className: "seat-name" });
    if (last) lines.push({ text: last, size: 10 * fontScale, className: "seat-surname" });
    if (hasPoints) {
      const pts = content!.points as number;
      lines.push({
        text: pts > 0 ? `+${pts}` : `${pts}`,
        size: 11 * fontScale,
        className: `seat-points ${pts > 0 ? "pos" : pts < 0 ? "neg" : "zero"}`,
      });
    }
  }
  const lineHeights = lines.map((l) => l.size * 1.18);
  const totalH = lineHeights.reduce((a, b) => a + b, 0);
  let cursor = slot.y - totalH / 2;

  // Report a position relative to the canvas wrapper so popovers anchor
  // correctly even when the view is crop-scaled. Divide out the app zoom
  // (rect is in zoomed pixels, CSS left/top are not).
  const report = (target: Element, clientX: number, clientY: number) => {
    const wrap = target.closest(".canvas-wrap");
    const rect = wrap?.getBoundingClientRect();
    const zoom = wrap instanceof HTMLElement && wrap.offsetWidth > 0 && rect ? rect.width / wrap.offsetWidth : 1;
    onSeatClick?.(rect ? (clientX - rect.left) / zoom : slot.x, rect ? (clientY - rect.top) / zoom : slot.y);
  };
  const name = content?.occupied ? [content.firstName ?? content.label, content.lastName].filter(Boolean).join(" ") : "Empty seat";

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        report(e.target as Element, e.clientX, e.clientY);
      }}
      // A seat that does something can be reached with Tab and opened with
      // Enter or Space, like any button.
      {...(onSeatClick
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": [name, content?.badge?.label.toLowerCase(), content?.selected ? "selected" : ""].filter(Boolean).join(", "),
            onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              report(e.currentTarget, box.left + box.width / 2, box.top + box.height / 2);
            },
          }
        : {})}
      className={onSeatClick ? "seat" : undefined}
      style={{ cursor: onSeatClick ? "pointer" : undefined }}
    >
      <rect
        className={`seat-square ${content?.occupied ? "occupied" : ""} ${content?.highlight ? "drop-target" : ""} ${content?.selected ? "batch-selected" : ""}`}
        x={slot.x - rw / 2}
        y={slot.y - rh / 2}
        width={rw}
        height={rh}
        rx={rx}
        transform={rotation ? `rotate(${rotation} ${slot.x} ${slot.y})` : undefined}
      />
      {lines.map((l, i) => {
        const y = cursor + lineHeights[i] / 2;
        cursor += lineHeights[i];
        return (
          <text
            key={i}
            className={l.className}
            x={slot.x}
            y={y}
            dominantBaseline="central"
            style={{ fontSize: l.size }}
          >
            {l.text}
          </text>
        );
      })}
      {content?.occupied && content.selected && (
        <IconGlyph name="check" className="seat-check" x={slot.x - rw / 2 + 10} y={slot.y - rh / 2 + 10} size={16} />
      )}
      {content?.occupied && content.badge && (
        <g className={`seat-badge ${content.badge.tone}`}>
          <title>{content.badge.label}</title>
          {content.badge.icon ? (
            <IconGlyph name={content.badge.icon} x={slot.x + rw / 2 - 9} y={slot.y - rh / 2 + 9} size={14} />
          ) : (
            <text x={slot.x + rw / 2 - 8} y={slot.y - rh / 2 + 9} dominantBaseline="central">
              {content.badge.text}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
