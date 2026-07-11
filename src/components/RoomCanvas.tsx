import { ReactNode } from "react";
import { Desk, FrontEdge } from "../lib/types";
import { seatSlots } from "../lib/seating";
import { GRID, ROOM_H, ROOM_W } from "../lib/room";

export { GRID, ROOM_H, ROOM_W };

export interface SeatContent {
  label: string; // short name to show on the seat
  occupied: boolean;
  points?: number | null; // running behaviour points (lesson view)
  highlight?: boolean;
}

interface Props {
  desks: Desk[];
  selectedDeskId?: string | null;
  editable?: boolean;
  frontEdge?: FrontEdge;
  /** Show only this region of the room, scaled up to the container width. */
  crop?: { x: number; y: number; w: number; h: number } | null;
  seatContent?: (deskId: string, seatIndex: number) => SeatContent;
  /** x/y are pixel coordinates relative to the .canvas-wrap element (popover anchoring). */
  onSeatClick?: (deskId: string, seatIndex: number, x: number, y: number) => void;
  onDeskPointerDown?: (deskId: string, e: React.PointerEvent) => void;
  onCanvasPointerDown?: (e: React.PointerEvent) => void;
  onCanvasPointerMove?: (e: React.PointerEvent) => void;
  onCanvasPointerUp?: (e: React.PointerEvent) => void;
  children?: ReactNode;
}

/** Convert a pointer event to room coordinates (designer canvas is unscaled). */
export function toRoomCoords(e: { clientX: number; clientY: number; currentTarget: EventTarget }): { x: number; y: number } {
  const svg = e.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
  crop,
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
  return (
    <div className="canvas-wrap">
      <svg
        className="room-canvas"
        {...(scaled
          ? { viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`, style: { width: "100%", height: "auto", aspectRatio: `${view.w} / ${view.h}` } }
          : { width: ROOM_W, height: ROOM_H })}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
      >
        {editable && (
          <g>
            {Array.from({ length: Math.floor(ROOM_W / GRID) + 1 }, (_, i) => (
              <line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={ROOM_H} stroke="#eef1f4" />
            ))}
            {Array.from({ length: Math.floor(ROOM_H / GRID) + 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * GRID} x2={ROOM_W} y2={i * GRID} stroke="#eef1f4" />
            ))}
          </g>
        )}
        <FrontMarker edge={frontEdge} view={view} />

        {desks.map((d) => (
          <DeskShapeView
            key={d.id}
            desk={d}
            selected={d.id === selectedDeskId}
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
  seatContent,
  onSeatClick,
  onPointerDown,
}: {
  desk: Desk;
  selected: boolean;
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
            <text className="label-block-text" x={cx} y={cy + 4.5}>
              {caption}
            </text>
          ) : (
            <text className="desk-label" x={cx} y={desk.shape === "door" || desk.shape === "window" ? cy + 3.5 : desk.y + 13}>
              {caption}
            </text>
          ))}
      </g>
      {slots.map((slot) => {
        const content = seatContent?.(desk.id, slot.seatIndex);
        return (
          <g
            key={slot.seatIndex}
            onClick={(e) => {
              e.stopPropagation();
              // Report the click position relative to the canvas wrapper so
              // popovers anchor correctly even when the view is crop-scaled.
              const wrap = (e.target as Element).closest(".canvas-wrap");
              const rect = wrap?.getBoundingClientRect();
              onSeatClick?.(
                desk.id,
                slot.seatIndex,
                rect ? e.clientX - rect.left : slot.x,
                rect ? e.clientY - rect.top : slot.y,
              );
            }}
            style={{ cursor: onSeatClick ? "pointer" : undefined }}
          >
            <circle
              className={`seat-circle ${content?.occupied ? "occupied" : ""} ${content?.highlight ? "drop-target" : ""}`}
              cx={slot.x}
              cy={slot.y}
              r={23}
            />
            {content?.occupied && (
              <text className="seat-name" x={slot.x} y={content.points !== undefined && content.points !== null ? slot.y + 1 : slot.y + 4}>
                {content.label}
              </text>
            )}
            {content?.occupied && content.points !== undefined && content.points !== null && (
              <text
                className="seat-points"
                x={slot.x}
                y={slot.y + 15}
                fill={content.points > 0 ? "#2e9e5b" : content.points < 0 ? "#d65c5c" : "#7c8b99"}
              >
                {content.points > 0 ? `+${content.points}` : content.points}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
