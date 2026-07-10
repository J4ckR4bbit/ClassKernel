import { ReactNode } from "react";
import { Desk } from "../lib/types";
import { seatSlots } from "../lib/seating";

export const ROOM_W = 900;
export const ROOM_H = 640;
export const GRID = 20;

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
  seatContent?: (deskId: string, seatIndex: number) => SeatContent;
  onSeatClick?: (deskId: string, seatIndex: number, x: number, y: number) => void;
  onDeskPointerDown?: (deskId: string, e: React.PointerEvent) => void;
  onCanvasPointerDown?: (e: React.PointerEvent) => void;
  onCanvasPointerMove?: (e: React.PointerEvent) => void;
  onCanvasPointerUp?: (e: React.PointerEvent) => void;
  children?: ReactNode;
}

/** Convert a pointer event to room coordinates. */
export function toRoomCoords(e: { clientX: number; clientY: number; currentTarget: EventTarget }): { x: number; y: number } {
  const svg = e.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export default function RoomCanvas({
  desks,
  selectedDeskId,
  editable,
  seatContent,
  onSeatClick,
  onDeskPointerDown,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  children,
}: Props) {
  return (
    <div className="canvas-wrap">
      <svg
        className="room-canvas"
        width={ROOM_W}
        height={ROOM_H}
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
        <text className="front-marker" x={ROOM_W / 2} y={14}>
          ▲ FRONT OF ROOM / WHITEBOARD ▲
        </text>

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
    desk.shape === "teacher" ? "desk-body teacher" : desk.shape === "door" ? "desk-body door" : desk.shape === "window" ? "desk-body window" : "desk-body";
  const caption =
    desk.label || (desk.shape === "teacher" ? "Teacher" : desk.shape === "door" ? "Door" : desk.shape === "window" ? "Window" : "");

  return (
    <g className={`desk ${selected ? "selected" : ""}`} onPointerDown={onPointerDown}>
      <g transform={`rotate(${desk.rotation} ${cx} ${cy})`}>
        <rect className={bodyClass} x={desk.x} y={desk.y} width={desk.w} height={desk.h} rx={6} />
        {caption && (
          <text className="desk-label" x={cx} y={desk.shape === "door" || desk.shape === "window" ? cy + 3.5 : desk.y + 13}>
            {caption}
          </text>
        )}
      </g>
      {slots.map((slot) => {
        const content = seatContent?.(desk.id, slot.seatIndex);
        return (
          <g
            key={slot.seatIndex}
            onClick={(e) => {
              e.stopPropagation();
              onSeatClick?.(desk.id, slot.seatIndex, slot.x, slot.y);
            }}
            style={{ cursor: onSeatClick ? "pointer" : undefined }}
          >
            <circle
              className={`seat-circle ${content?.occupied ? "occupied" : ""} ${content?.highlight ? "drop-target" : ""}`}
              cx={slot.x}
              cy={slot.y}
              r={20}
            />
            {content?.occupied && (
              <text className="seat-name" x={slot.x} y={content.points !== undefined && content.points !== null ? slot.y : slot.y + 4}>
                {content.label}
              </text>
            )}
            {content?.occupied && content.points !== undefined && content.points !== null && (
              <text
                className="seat-points"
                x={slot.x}
                y={slot.y + 13}
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
