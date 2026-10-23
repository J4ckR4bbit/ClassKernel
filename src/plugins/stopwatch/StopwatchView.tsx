import { ReactElement, useEffect, useRef, useState } from "react";
import { elapsed, formatStopwatch, lapRows } from "./stopwatch";
import { useStopwatch } from "./stopwatchStore";
import "./stopwatch.css";
import Icon from "../../components/Icon";
import { modalOpen } from "../../components/Modal";

// A lab stopwatch with a seven-segment display: start, pause, lap and restart.
// The time lives in a store, so it keeps running if the teacher leaves this
// screen; this view only redraws it, every frame while it runs.

// ---- the seven-segment display --------------------------------------------

/** Which segments light for each digit (a top, b top right, … g middle). */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

// One digit cell is 56 × 100 units; segments are 10 thick with a hair gap.
const W = 56;
const H = 100;
const T = 10;
const GAP = 1.5;

/** A hexagonal segment between two points on the same row or column. */
function segment(x1: number, y1: number, x2: number, y2: number): string {
  const h = T / 2;
  if (y1 === y2) {
    const a = x1 + GAP;
    const b = x2 - GAP;
    return `${a},${y1} ${a + h},${y1 - h} ${b - h},${y1 - h} ${b},${y1} ${b - h},${y1 + h} ${a + h},${y1 + h}`;
  }
  const a = y1 + GAP;
  const b = y2 - GAP;
  return `${x1},${a} ${x1 + h},${a + h} ${x1 + h},${b - h} ${x1},${b} ${x1 - h},${b - h} ${x1 - h},${a + h}`;
}

const L = T / 2;
const R = W - T / 2;
const TOP = T / 2;
const MID = H / 2;
const BOT = H - T / 2;
const SEGMENT_POINTS: Record<string, string> = {
  a: segment(L, TOP, R, TOP),
  b: segment(R, TOP, R, MID),
  c: segment(R, MID, R, BOT),
  d: segment(L, BOT, R, BOT),
  e: segment(L, MID, L, BOT),
  f: segment(L, TOP, L, MID),
  g: segment(L, MID, R, MID),
};

function Digit({ d }: { d: string }) {
  const lit = SEGMENTS[d] ?? "";
  return (
    <>
      {/* Unlit segments stay faintly visible, as on a real display. */}
      {[..."abcdefg"].map((key) => (
        <polygon key={key} points={SEGMENT_POINTS[key]} className={lit.includes(key) ? "sw-seg on" : "sw-seg"} />
      ))}
    </>
  );
}

const DIGIT_ADVANCE = W + 12;
const COLON_ADVANCE = 26;
const COMMA_ADVANCE = 24;
/** The hundredths are drawn smaller, as on a real stopwatch. */
const SMALL = 0.62;
/** Slant of the display, in degrees, like an LED stopwatch's. */
const SLANT = 6;

/**
 * The time as one SVG, so it scales to whatever space it is given without
 * any measuring: every character is laid out in display units, and the
 * viewBox is the width they come to.
 */
function SegmentDisplay({ text }: { text: string }) {
  const [main, hundredths] = text.split(",");
  const items: ReactElement[] = [];
  let x = 0;
  for (const ch of main) {
    if (ch === ":") {
      items.push(
        <g key={`c${x}`} transform={`translate(${x} 0)`}>
          <circle cx={COLON_ADVANCE / 2 - 3} cy={H * 0.3} r={5.5} className="sw-seg on" />
          <circle cx={COLON_ADVANCE / 2 - 3} cy={H * 0.7} r={5.5} className="sw-seg on" />
        </g>,
      );
      x += COLON_ADVANCE;
    } else {
      items.push(
        <g key={`d${x}`} transform={`translate(${x} 0)`}>
          <Digit d={ch} />
        </g>,
      );
      x += DIGIT_ADVANCE;
    }
  }
  // The decimal comma: the display's eighth segment, a point with a tail.
  items.push(
    <g key="comma" transform={`translate(${x - 4} 0)`} className="sw-seg on">
      <circle cx={10} cy={BOT} r={6} />
      <path d={`M ${15} ${BOT} Q ${15} ${BOT + 10} ${5} ${BOT + 15} L ${4} ${BOT + 12} Q ${9} ${BOT + 8} ${8} ${BOT + 4} Z`} />
    </g>,
  );
  x += COMMA_ADVANCE;
  for (const ch of hundredths ?? "") {
    items.push(
      <g key={`h${x}`} transform={`translate(${x} ${H * (1 - SMALL)}) scale(${SMALL})`}>
        <Digit d={ch} />
      </g>,
    );
    x += DIGIT_ADVANCE * SMALL;
  }

  const lean = Math.tan((SLANT * Math.PI) / 180) * H;
  const pad = 6;
  const width = x - 12 * SMALL + lean + pad * 2;
  const height = H + 18 + pad * 2;
  return (
    <svg className="sw-display" viewBox={`0 0 ${width} ${height}`} role="timer" aria-label={text}>
      <g transform={`translate(${pad + lean} ${pad}) skewX(${-SLANT})`}>{items}</g>
    </svg>
  );
}

// ---- the screen -----------------------------------------------------------

/** The current time, every animation frame while `active`. */
function useFrameNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    let id = requestAnimationFrame(function frame() {
      setNow(Date.now());
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

export default function StopwatchView() {
  const { sw, start, pause, lap, restart } = useStopwatch();
  const now = useFrameNow(sw.running);
  const total = elapsed(sw, now);
  const rows = lapRows(sw.laps);
  const lastLap = sw.laps.length ? sw.laps[sw.laps.length - 1] : 0;
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = sw.running ? pause : start;
  const startLabel = sw.running ? "Pause" : total > 0 ? "Resume" : "Start";

  // Space starts and pauses, L marks a lap, R restarts — anywhere on this
  // screen except while the teacher is typing or a dialog is open. A button
  // clicked a moment ago still has focus, and Space would press it too, so that
  // press is cancelled: Space always means start / pause.
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e) || modalOpen()) return;
      const key = e.key.toLowerCase();
      if (key !== " " && key !== "l" && key !== "r") return;
      e.preventDefault();
      if (e.repeat) return;
      if (key === " ") toggle();
      else if (key === "l") lap();
      else restart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && !typing(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [toggle, lap, restart]);

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="stopwatch-plugin" ref={rootRef}>
      <div className="sw-panel">
        <SegmentDisplay text={formatStopwatch(total)} />
      </div>

      <div className="row sw-controls">
        <button className="sw-btn" onClick={restart} disabled={total === 0 && sw.laps.length === 0}>
          <Icon name="restart_alt" size={20} /> Restart
        </button>
        <button className="sw-btn" onClick={lap} disabled={!sw.running}>
          <Icon name="flag" size={20} /> Lap
        </button>
        <button className={`sw-btn sw-main ${sw.running ? "running" : "primary"}`} onClick={toggle}>
          <Icon name={sw.running ? "pause" : "play_arrow"} size={20} /> {startLabel}
        </button>
        <div className="spacer" />
        <button className="no-print" onClick={toggleFullscreen}>
          <Icon name="fullscreen" size={20} /> Fullscreen
        </button>
      </div>
      <div className="muted small sw-keys">
        Keys: <kbd>Space</kbd> start / pause · <kbd>L</kbd> lap · <kbd>R</kbd> restart
      </div>

      {total > 0 && (
        <div className="sw-laps">
          <table>
            <thead>
              <tr>
                <th>Lap</th>
                <th>Lap time</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {/* The lap in progress (or paused part-way through). */}
              <tr className="current">
                <td>{sw.laps.length + 1}</td>
                <td>{formatStopwatch(total - lastLap)}</td>
                <td>{formatStopwatch(total)}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.number} className={r.fastest ? "fastest" : r.slowest ? "slowest" : ""}>
                  <td>
                    {r.number}
                    {r.fastest && <span className="sw-tag">fastest</span>}
                    {r.slowest && <span className="sw-tag">slowest</span>}
                  </td>
                  <td>{formatStopwatch(r.split)}</td>
                  <td>{formatStopwatch(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
