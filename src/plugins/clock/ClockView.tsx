import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentTimeZone, listTimeZones } from "../../lib/time";
import { FlipDisplay } from "../shared/FlipDigits";
import { clockParts, digitalText, handAngles, offsetLabel, zoneCity } from "./clock";
import "./clock.css";

// A big classroom clock: a round analog face or the test timer's flip digits,
// in any time zone. The face and options are remembered on this computer,
// like the sidebar, because they are about this screen rather than the data.

type Face = "analog" | "digital";

interface ClockOptions {
  face: Face;
  /** IANA zone; "" follows the app's time zone (Settings → General). */
  zone: string;
  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
}

const STORE_KEY = "classkernel.clock";
const DEFAULTS: ClockOptions = { face: "analog", zone: "", hour12: false, showSeconds: true, showDate: true };

function readOptions(): ClockOptions {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

function writeOptions(o: ClockOptions) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {
    // Not remembered; the clock still works for this session.
  }
}

/** Re-render every `ms` milliseconds with the current time. */
function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function AnalogFace({ hours, minutes, seconds, showSeconds }: { hours: number; minutes: number; seconds: number; showSeconds: boolean }) {
  const a = handAngles({ hours, minutes, seconds });
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <svg className="analog-clock" viewBox="0 0 200 200" role="img" aria-label={`${hours}:${String(minutes).padStart(2, "0")}`}>
      <circle cx="100" cy="100" r="96" className="face" />
      {ticks.map((i) => {
        const major = i % 5 === 0;
        return (
          <line
            key={i}
            x1="100"
            y1={major ? 10 : 11}
            x2="100"
            y2={major ? 22 : 16}
            className={major ? "tick major" : "tick"}
            transform={`rotate(${i * 6} 100 100)`}
          />
        );
      })}
      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
        const rad = (n * 30 * Math.PI) / 180;
        return (
          <text key={n} x={100 + 66 * Math.sin(rad)} y={100 - 66 * Math.cos(rad)} className="numeral" dominantBaseline="central" textAnchor="middle">
            {n}
          </text>
        );
      })}
      <line x1="100" y1="112" x2="100" y2="52" className="hand hour" transform={`rotate(${a.hour} 100 100)`} />
      <line x1="100" y1="114" x2="100" y2="28" className="hand minute" transform={`rotate(${a.minute} 100 100)`} />
      {showSeconds && <line x1="100" y1="120" x2="100" y2="20" className="hand second" transform={`rotate(${a.second} 100 100)`} />}
      <circle cx="100" cy="100" r="4.5" className="cap" />
    </svg>
  );
}

/**
 * Scale `inner` to fill `box` as far as `max`, in both directions. The inner
 * size is measured rather than estimated, so the AM/PM marker and the seconds
 * cards count too; a transform doesn't move the layout, so the caller sizes a
 * wrapper to the scaled box itself.
 */
function useFitScale(max: number, active: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!active || !b || !i) return;
    const measure = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      if (!w || !h) return;
      const scale = Math.max(0.4, Math.min(max, (b.clientWidth - 32) / w, (b.clientHeight - 16) / h));
      setFit({ scale, width: w * scale, height: h * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(i);
    return () => ro.disconnect();
  }, [max, active]);
  return { box, inner, ...fit };
}

export default function ClockView() {
  const [opts, setOpts] = useState<ClockOptions>(readOptions);
  const set = (patch: Partial<ClockOptions>) =>
    setOpts((o) => {
      const next = { ...o, ...patch };
      writeOptions(next);
      return next;
    });

  const now = useNow(250);
  const appZone = currentTimeZone();
  const zone = opts.zone || appZone;
  const parts = clockParts(now, zone);
  const digital = digitalText(parts, opts);
  const fit = useFitScale(3.2, opts.face === "digital");
  const rootRef = useRef<HTMLDivElement>(null);
  const [zones] = useState(listTimeZones);

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <div className="clock-plugin" ref={rootRef}>
      <div className="row clock-toolbar no-print">
        <div className="row" role="group" aria-label="Clock face">
          <button className={`chip ${opts.face === "analog" ? "selected" : ""}`} onClick={() => set({ face: "analog" })}>
            Analog
          </button>
          <button className={`chip ${opts.face === "digital" ? "selected" : ""}`} onClick={() => set({ face: "digital" })}>
            Digital
          </button>
        </div>

        <label className="clock-zone">
          Time zone
          <select value={opts.zone} onChange={(e) => set({ zone: e.target.value })}>
            <option value="">App time zone ({zoneCity(appZone)})</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <div className="row" role="group" aria-label="Hour format">
          <button className={`chip ${!opts.hour12 ? "selected" : ""}`} onClick={() => set({ hour12: false })}>
            24-hour
          </button>
          <button className={`chip ${opts.hour12 ? "selected" : ""}`} onClick={() => set({ hour12: true })}>
            12-hour
          </button>
        </div>

        <label className="row clock-check">
          <input type="checkbox" checked={opts.showSeconds} onChange={(e) => set({ showSeconds: e.target.checked })} /> Seconds
        </label>
        <label className="row clock-check">
          <input type="checkbox" checked={opts.showDate} onChange={(e) => set({ showDate: e.target.checked })} /> Date
        </label>

        <div className="spacer" />
        <button onClick={toggleFullscreen}>⤢ Fullscreen</button>
      </div>

      <div className="clock-stage">
        <div className="clock-fit" ref={fit.box}>
          {opts.face === "analog" ? (
            <AnalogFace hours={parts.hours} minutes={parts.minutes} seconds={parts.seconds} showSeconds={opts.showSeconds} />
          ) : (
            <div style={{ width: fit.width, height: fit.height }}>
              <div className="clock-digital" ref={fit.inner} style={{ transform: `scale(${fit.scale})` }}>
                <FlipDisplay text={digital.text} color="var(--clock-card, #1d2733)" />
                {digital.suffix && <div className="clock-suffix">{digital.suffix}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="clock-caption">
          {opts.showDate && <div className="clock-date">{parts.dateLine}</div>}
          <div className="clock-zone-line muted">
            {zoneCity(zone)} · {offsetLabel(now, zone)}
          </div>
        </div>
      </div>
    </div>
  );
}
