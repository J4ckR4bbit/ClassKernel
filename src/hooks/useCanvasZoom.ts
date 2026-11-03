import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { modalOpen } from "../components/Modal";
import { prefersReducedMotion } from "../lib/motion";

// Zoom and scroll for the room designer's canvas, the way Adobe's apps and a
// touch screen do it:
//   wheel scrolls; Shift + wheel scrolls sideways (the browser's own);
//   Ctrl (or Alt) + wheel, and a touchpad pinch, zoom about the pointer;
//   Ctrl + / Ctrl − zoom, Ctrl 0 fits the room, Ctrl 1 is 100%;
//   hold Space and drag, or drag with the middle button, to pan (the hand tool);
//   drag the empty floor (finger, pen or mouse) to scroll, with a flick coasting on;
//   two fingers pinch to zoom and move together to pan.
// Desks and the crop box keep their own drags; a second finger takes over
// from a desk drag, so the desk goes back where it was.

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** One step of the zoom buttons and Ctrl + / −. */
const STEP = 1.25;
/** Room kept around the room at "Fit", in layout pixels (the stage's padding and border, plus a little). */
const FIT_MARGIN = 32;
/** How far a press moves before it is a drag rather than a tap. */
const TAP_SLOP = 5;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type Point = { clientX: number; clientY: number };
/** A fraction across the room (fx, fy) that should end up under a screen point. */
type Anchor = { fx: number; fy: number } & Point;

type Gesture =
  | {
      kind: "pan";
      id: number;
      startX: number;
      startY: number;
      scrollX: number;
      scrollY: number;
      moved: boolean;
      /** A press on the empty floor, which is a tap if it doesn't move. */
      floor: boolean;
      samples: Array<{ x: number; y: number; t: number }>;
    }
  | { kind: "pinch"; startDist: number; startZoom: number; fx: number; fy: number };

function typingIn(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

export function useCanvasZoom({
  roomW,
  roomH,
  itemSelector,
  onGestureStart,
  onFloorTap,
}: {
  roomW: number;
  roomH: number;
  /** What a drag should leave alone because it moves itself (desks, the crop box). */
  itemSelector: string;
  /** A pan or pinch is taking over: drop any desk drag in progress. */
  onGestureStart?: () => void;
  /** A press on the empty floor that didn't move. */
  onFloorTap?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<number | "fit">("fit");
  const [fit, setFit] = useState(1);
  const zoom = mode === "fit" ? fit : mode;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const anchor = useRef<Anchor | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /** The fingers on the canvas, for the pinch. */
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const coast = useRef<number | null>(null);
  const hovering = useRef(false);
  // The hand tool (Space held): the ref is what a press reads, set the moment
  // the key goes down; the state only changes the cursor.
  const [handTool, setHandTool] = useState(false);
  const handToolRef = useRef(false);
  const holdHand = (on: boolean) => {
    handToolRef.current = on;
    setHandTool(on);
  };
  const [panning, setPanning] = useState(false);

  // The latest callbacks, so listeners needn't be re-added on every render.
  const callbacks = useRef({ onGestureStart, onFloorTap });
  callbacks.current = { onGestureStart, onFloorTap };

  const svg = () => viewportRef.current?.querySelector<SVGSVGElement>("svg.room-canvas") ?? null;

  /** Screen pixels per layout pixel: the app's display size, which scales everything. */
  const screenScale = () => {
    const vp = viewportRef.current;
    return vp && vp.offsetWidth > 0 ? vp.getBoundingClientRect().width / vp.offsetWidth : 1;
  };

  const anchorAt = (p: Point): Anchor | null => {
    const r = svg()?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return { fx: (p.clientX - r.left) / r.width, fy: (p.clientY - r.top) / r.height, clientX: p.clientX, clientY: p.clientY };
  };

  /** Scroll so the anchored point of the room sits under its screen point. */
  const alignTo = (a: Anchor) => {
    const vp = viewportRef.current;
    const r = svg()?.getBoundingClientRect();
    if (!vp || !r) return;
    const k = screenScale();
    vp.scrollLeft += (r.left + a.fx * r.width - a.clientX) / k;
    vp.scrollTop += (r.top + a.fy * r.height - a.clientY) / k;
  };

  const viewportCentre = (): Point | null => {
    const r = viewportRef.current?.getBoundingClientRect();
    return r ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : null;
  };

  /** Zoom to a level (or "fit"), keeping the point under `at` (default: the middle of the view) still. */
  const zoomTo = useCallback((z: number | "fit", at?: Point) => {
    if (z === "fit") {
      anchor.current = null;
      setMode("fit");
      return;
    }
    const next = clampZoom(z);
    if (Math.abs(next - zoomRef.current) < 1e-4) return;
    const p = at ?? viewportCentre();
    anchor.current = p ? anchorAt(p) : null;
    setMode(next);
  }, []);

  const zoomIn = useCallback(() => zoomTo(zoomRef.current * STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo(zoomRef.current / STEP), [zoomTo]);

  // After the canvas is drawn at its new size, scroll the anchored point back under the pointer.
  useLayoutEffect(() => {
    if (!anchor.current) return;
    alignTo(anchor.current);
    anchor.current = null;
  }, [zoom]);

  // "Fit" follows the size of the view.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => {
      const w = vp.clientWidth - FIT_MARGIN;
      const h = vp.clientHeight - FIT_MARGIN;
      if (w > 0 && h > 0) setFit(clampZoom(Math.floor(Math.min(w / roomW, h / roomH) * 100) / 100));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [roomW, roomH]);

  const stopCoasting = () => {
    if (coast.current !== null) cancelAnimationFrame(coast.current);
    coast.current = null;
  };
  useEffect(() => stopCoasting, []);

  /** Carry a flick on, slowing to a stop, as a touch screen's own scrolling does. */
  const coastFrom = (vx: number, vy: number) => {
    const vp = viewportRef.current;
    if (!vp || prefersReducedMotion()) return;
    let last = performance.now();
    const k = screenScale();
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      vp.scrollLeft -= (vx * dt) / k;
      vp.scrollTop -= (vy * dt) / k;
      const decay = Math.pow(0.95, dt / 16);
      vx *= decay;
      vy *= decay;
      coast.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : null;
    };
    coast.current = requestAnimationFrame(step);
  };

  // Ctrl/Alt + wheel (and a touchpad pinch, which arrives as Ctrl + wheel) zooms
  // about the pointer. Needs a listener that may cancel, so the page itself doesn't zoom.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      stopCoasting();
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;
      e.preventDefault();
      const perUnit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * perUnit), e);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // Keyboard: Ctrl + / − / 0 / 1, and Space held for the hand tool.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || modalOpen()) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const act =
          e.key === "=" || e.key === "+"
            ? zoomIn
            : e.key === "-" || e.key === "_"
              ? zoomOut
              : e.key === "0"
                ? () => zoomTo("fit")
                : e.key === "1"
                  ? () => zoomTo(1)
                  : null;
        if (act) {
          e.preventDefault();
          act();
        }
        return;
      }
      if (e.code !== "Space" || e.ctrlKey || e.altKey || e.metaKey) return;
      const vp = viewportRef.current;
      const at = document.activeElement;
      if (!vp || !(hovering.current || vp.contains(at))) return;
      // Leave Space to a field being typed in, and to a button reached with the keyboard.
      if (typingIn(at) || (at instanceof HTMLButtonElement && at.matches(":focus-visible"))) return;
      e.preventDefault();
      if (!handToolRef.current) holdHand(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && handToolRef.current) holdHand(false);
    };
    const drop = () => holdHand(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", drop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", drop);
    };
  }, [zoomIn, zoomOut, zoomTo]);

  const startPinch = () => {
    const [a, b] = [...fingers.current.values()];
    const mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
    const at = anchorAt(mid);
    gesture.current = at
      ? { kind: "pinch", startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), startZoom: zoomRef.current, fx: at.fx, fy: at.fy }
      : null;
    setPanning(false);
  };

  // Taken in the capture phase, so a pan or pinch wins over a desk's own drag.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    stopCoasting();
    if (e.pointerType === "touch") fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size >= 2 && fingers.current.has(e.pointerId)) {
      e.stopPropagation();
      if (fingers.current.size === 2) {
        callbacks.current.onGestureStart?.();
        for (const id of fingers.current.keys()) {
          try {
            vp.setPointerCapture(id);
          } catch {
            // That finger has already lifted.
          }
        }
        startPinch();
      }
      return;
    }
    const hand = handToolRef.current || e.button === 1;
    const onItem = (e.target as Element).closest?.(itemSelector) != null;
    if (!hand && (onItem || e.button !== 0)) return;
    if (hand) {
      e.preventDefault();
      e.stopPropagation();
      callbacks.current.onGestureStart?.();
    }
    gesture.current = {
      kind: "pan",
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: vp.scrollLeft,
      scrollY: vp.scrollTop,
      moved: false,
      floor: !hand,
      samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
    vp.setPointerCapture(e.pointerId);
    if (hand) setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const finger = fingers.current.get(e.pointerId);
    if (finger) {
      finger.x = e.clientX;
      finger.y = e.clientY;
    }
    const g = gesture.current;
    const vp = viewportRef.current;
    if (!g || !vp) return;
    if (g.kind === "pinch") {
      if (!finger) return;
      const [a, b] = [...fingers.current.values()];
      if (!a || !b) return;
      const target: Anchor = { fx: g.fx, fy: g.fy, clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
      const next = clampZoom((g.startZoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist);
      if (Math.abs(next - zoomRef.current) < 1e-4) {
        alignTo(target);
      } else {
        anchor.current = target;
        setMode(next);
      }
      return;
    }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      setPanning(true);
    }
    const k = screenScale();
    vp.scrollLeft = g.scrollX - dx / k;
    vp.scrollTop = g.scrollY - dy / k;
    g.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (g.samples.length > 6) g.samples.shift();
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      // Lifting one finger ends the pinch; the other doesn't start a pan with a jump.
      if (fingers.current.size < 2) gesture.current = null;
      return;
    }
    if (e.pointerId !== g.id) return;
    gesture.current = null;
    setPanning(false);
    if (!g.moved) {
      if (g.floor && e.type === "pointerup") callbacks.current.onFloorTap?.();
      return;
    }
    // A flick: how fast the last few moves were going when the finger lifted.
    if (e.type !== "pointerup" || e.pointerType === "mouse") return;
    const recent = g.samples.filter((s) => e.timeStamp - s.t < 100);
    if (recent.length < 2) return;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return;
    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    if (Math.hypot(vx, vy) > 0.3) coastFrom(vx, vy);
  };

  /** The middle of what's on screen, in room units: where a new desk goes. */
  const visibleCentre = useCallback((): { x: number; y: number } | null => {
    const vp = viewportRef.current?.getBoundingClientRect();
    const r = svg()?.getBoundingClientRect();
    if (!vp || !r || r.width === 0 || r.height === 0) return null;
    const cx = (Math.max(vp.left, r.left) + Math.min(vp.right, r.right)) / 2;
    const cy = (Math.max(vp.top, r.top) + Math.min(vp.bottom, r.bottom)) / 2;
    return { x: ((cx - r.left) / r.width) * roomW, y: ((cy - r.top) / r.height) * roomH };
  }, [roomW, roomH]);

  return {
    zoom,
    isFit: mode === "fit",
    zoomIn,
    zoomOut,
    fitRoom: () => zoomTo("fit"),
    actualSize: () => zoomTo(1),
    visibleCentre,
    canZoomIn: zoom < MAX_ZOOM - 1e-4,
    canZoomOut: zoom > MIN_ZOOM + 1e-4,
    viewportProps: {
      ref: viewportRef,
      className: `layout-viewport ${handTool ? "hand" : ""} ${panning ? "panning" : ""}`,
      onPointerDownCapture,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerEnter: () => (hovering.current = true),
      onPointerLeave: () => (hovering.current = false),
      // Stop the middle button's autoscroll; it pans instead.
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button === 1) e.preventDefault();
      },
    },
  };
}
