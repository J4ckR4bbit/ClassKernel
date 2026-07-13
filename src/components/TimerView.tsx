import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { TimerDisplay, TimerPreset } from "../lib/types";

// ---------- colour progression ----------
// As a phase runs down the graphic moves green → blue → orange → red.
const COLOR_STOPS = ["#006600", "#1F497D", "#D6701C", "#CF1717"];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** elapsed 0 (full) → 1 (empty), interpolated across the four stops. */
function phaseColor(elapsed: number): string {
  const e = Math.max(0, Math.min(1, elapsed));
  const segCount = COLOR_STOPS.length - 1;
  const seg = Math.min(segCount - 1, Math.floor(e * segCount));
  const localT = e * segCount - seg;
  return mix(COLOR_STOPS[seg], COLOR_STOPS[seg + 1], localT);
}

// ---------- flip-clock digit ----------
// Classic split-flap card: the top half folds down to reveal the next value.
function FlipDigit({ d, color }: { d: string; color: string }) {
  const [prev, setPrev] = useState(d);
  const [flip, setFlip] = useState(0);

  useEffect(() => {
    if (d === prev) return;
    setFlip((f) => f + 1);
    const t = setTimeout(() => setPrev(d), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  return (
    <div className="flip-digit" style={{ ["--flip-color" as string]: color }}>
      <div className="fc top">
        <span>{d}</span>
      </div>
      <div className="fc bottom">
        <span>{prev}</span>
      </div>
      {flip > 0 && (
        <div key={flip} className="fc-anim">
          <div className="fc top flip-top">
            <span>{prev}</span>
          </div>
          <div className="fc bottom flip-bottom">
            <span>{d}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FlipClock({ seconds, color, big }: { seconds: number; color: string; big?: boolean }) {
  const total = Math.max(0, Math.ceil(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const mmStr = String(mm).padStart(2, "0");
  const ssStr = String(ss).padStart(2, "0");
  return (
    <div className={`flip-clock ${big ? "big" : ""}`}>
      {mmStr.split("").map((d, i) => (
        <FlipDigit key={`m${i}`} d={d} color={color} />
      ))}
      <div className="flip-colon">:</div>
      {ssStr.split("").map((d, i) => (
        <FlipDigit key={`s${i}`} d={d} color={color} />
      ))}
    </div>
  );
}

// ---------- countdown ring (Windows-style) ----------
function RingCountdown({ frac, color, children }: { frac: number; color: string; children?: React.ReactNode }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 120 120" className="ring-svg">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.4s linear" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

// ---------- hourglass with falling pixels ----------
function Hourglass({ frac, color, running }: { frac: number; color: string; running: boolean }) {
  // Top chamber drains toward the neck; the bottom fills from the base up.
  const topH = 130 * frac; // sand height remaining in the top chamber
  const botH = 130 * (1 - frac); // sand collected in the bottom chamber
  const pixels = [0, 1, 2, 3, 4];
  return (
    <div className="hourglass">
      <svg viewBox="0 0 240 320">
        <defs>
          <clipPath id="hg-top">
            <polygon points="30,30 210,30 120,160" />
          </clipPath>
          <clipPath id="hg-bot">
            <polygon points="120,160 30,290 210,290" />
          </clipPath>
        </defs>

        {/* sand */}
        <g clipPath="url(#hg-top)">
          <rect x="20" y={160 - topH} width="200" height={topH + 2} fill={color} />
        </g>
        <g clipPath="url(#hg-bot)">
          <rect x="20" y={290 - botH} width="200" height={botH + 2} fill={color} />
        </g>

        {/* falling stream */}
        {running && frac > 0 && frac < 1 && (
          <g>
            {pixels.map((i) => (
              <rect
                key={i}
                className="hg-pixel"
                x={118 + (i % 2 === 0 ? -2 : 2)}
                y={160}
                width="4"
                height="4"
                fill={color}
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </g>
        )}

        {/* glass outline */}
        <polygon points="30,30 210,30 120,160" fill="none" stroke="var(--text-dim)" strokeWidth="3" />
        <polygon points="120,160 30,290 210,290" fill="none" stroke="var(--text-dim)" strokeWidth="3" />
        <rect x="18" y="22" width="204" height="10" rx="4" fill="var(--text-dim)" />
        <rect x="18" y="288" width="204" height="10" rx="4" fill="var(--text-dim)" />
      </svg>
    </div>
  );
}

// ---------- chime ----------
let audioCtx: AudioContext | null = null;
function chime(pattern: number) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    for (let i = 0; i < pattern; i++) {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.21);
    }
  } catch {
    /* audio unavailable — silently ignore */
  }
}

interface Phase {
  label: string;
  seconds: number;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TimerView() {
  const { timerPresets, setTimerPresets, showToast } = useApp();

  // setup fields
  const [readingMin, setReadingMin] = useState(10);
  const [writingMin, setWritingMin] = useState(40);
  const [display, setDisplay] = useState<TimerDisplay>("circle");
  const [chimeOn, setChimeOn] = useState(true);

  // running state
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [phase, setPhase] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const deadlineRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // wall clock (time of day + live end-time)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // countdown engine — re-armed whenever the phase changes so its closure is fresh
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const rem = (deadlineRef.current - Date.now()) / 1000;
      if (rem > 0) {
        setRemaining(rem);
        return;
      }
      if (phase < phases.length - 1) {
        if (chimeOn) chime(2);
        const nextTotal = phases[phase + 1].seconds;
        deadlineRef.current = Date.now() + nextTotal * 1000;
        setPhase(phase + 1);
        setRemaining(nextTotal);
      } else {
        if (chimeOn) chime(3);
        setRemaining(0);
        setRunning(false);
        setFinished(true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, phase, phases, chimeOn]);

  const buildPhases = (): Phase[] => {
    const list: Phase[] = [];
    if (readingMin > 0) list.push({ label: "Reading time", seconds: Math.round(readingMin * 60) });
    if (writingMin > 0) list.push({ label: "Writing time", seconds: Math.round(writingMin * 60) });
    return list;
  };

  const start = () => {
    const list = buildPhases();
    if (list.length === 0) {
      showToast("Set a reading or writing time first");
      return;
    }
    setPhases(list);
    setPhase(0);
    setRemaining(list[0].seconds);
    deadlineRef.current = Date.now() + list[0].seconds * 1000;
    setStarted(true);
    setFinished(false);
    setRunning(true);
  };

  const pause = () => setRunning(false);
  const resume = () => {
    if (remaining <= 0) return;
    deadlineRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  };

  const addMinute = () => {
    setRemaining((r) => r + 60);
    if (running) deadlineRef.current += 60000;
  };

  const skip = () => {
    if (phase < phases.length - 1) {
      const nextTotal = phases[phase + 1].seconds;
      deadlineRef.current = Date.now() + nextTotal * 1000;
      setPhase(phase + 1);
      setRemaining(nextTotal);
      setFinished(false);
    } else {
      setRemaining(0);
      setRunning(false);
      setFinished(true);
    }
  };

  const stop = () => {
    setRunning(false);
    setStarted(false);
    setFinished(false);
    setPhase(0);
  };

  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const applyPreset = (name: string) => {
    const p = timerPresets.find((x) => x.name === name);
    if (!p) return;
    setReadingMin(p.readingMinutes);
    setWritingMin(p.writingMinutes);
    setDisplay(p.display);
    setChimeOn(p.chime);
  };

  const savePreset = () => {
    const name = window.prompt("Name this timer preset", `${readingMin} read · ${writingMin} write`);
    if (!name) return;
    const preset: TimerPreset = {
      name: name.trim(),
      readingMinutes: readingMin,
      writingMinutes: writingMin,
      display,
      chime: chimeOn,
    };
    const next = [...timerPresets.filter((p) => p.name !== preset.name), preset];
    void setTimerPresets(next);
    showToast("Preset saved");
  };

  const deletePreset = (name: string) => {
    void setTimerPresets(timerPresets.filter((p) => p.name !== name));
  };

  // ---------- setup screen ----------
  if (!started) {
    return (
      <div>
        <div className="view-header">
          <h1>⏱ Test timer</h1>
          <div className="spacer" />
        </div>

        <div className="panel timer-setup">
          <h3>Phases</h3>
          <div className="timer-fields">
            <label>
              Reading time (min)
              <input
                type="number"
                min={0}
                value={readingMin}
                onChange={(e) => setReadingMin(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <label>
              Writing time (min)
              <input
                type="number"
                min={0}
                value={writingMin}
                onChange={(e) => setWritingMin(Math.max(0, Number(e.target.value)))}
              />
            </label>
          </div>

          <h3>Display style</h3>
          <div className="timer-styles">
            {([
              ["circle", "Countdown circle"],
              ["hourglass", "Hourglass (falling pixels)"],
              ["flip", "Flip clock"],
            ] as [TimerDisplay, string][]).map(([val, label]) => (
              <button
                key={val}
                className={`timer-style ${display === val ? "active" : ""}`}
                onClick={() => setDisplay(val)}
              >
                <div className="timer-style-preview">
                  {val === "circle" && <RingCountdown frac={0.68} color="#1F497D" />}
                  {val === "hourglass" && <Hourglass frac={0.6} color="#D6701C" running={false} />}
                  {val === "flip" && <FlipClock seconds={754} color="#006600" />}
                </div>
                {label}
              </button>
            ))}
          </div>

          <label className="timer-chime">
            <input type="checkbox" checked={chimeOn} onChange={(e) => setChimeOn(e.target.checked)} /> Chime at phase
            changes and when time is up
          </label>

          <div className="timer-start-row">
            <button className="primary" onClick={start}>
              ▶ Start
            </button>
          </div>
        </div>

        <div className="panel">
          <h3>Saved timers</h3>
          <div className="row">
            <select defaultValue="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
              <option value="">Load a preset…</option>
              {timerPresets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={savePreset}>Save current settings</button>
          </div>
          {timerPresets.length > 0 && (
            <ul className="preset-list">
              {timerPresets.map((p) => (
                <li key={p.name}>
                  <button className="link" onClick={() => applyPreset(p.name)}>
                    {p.name}
                  </button>
                  <span className="muted">
                    {p.readingMinutes}m read · {p.writingMinutes}m write · {p.display}
                  </span>
                  <button className="small danger" onClick={() => deletePreset(p.name)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ---------- running screen ----------
  const current = phases[phase];
  const phaseTotal = current ? current.seconds : 1;
  const frac = Math.max(0, Math.min(1, remaining / phaseTotal));
  const elapsed = 1 - frac;
  const color = finished ? COLOR_STOPS[COLOR_STOPS.length - 1] : phaseColor(elapsed);
  const endsAt = running ? fmtClock(new Date(Date.now() + remaining * 1000)) : null;

  return (
    <div className="timer-run" ref={rootRef} style={{ ["--timer-color" as string]: color }}>
      <div className="timer-run-top">
        <div className="timer-phase" style={{ color }}>
          {finished ? "Time's up" : current?.label}
        </div>
        <div className="timer-clock-now">{fmtClock(now)}</div>
      </div>

      <div className="timer-stage">
        {display === "circle" && (
          <RingCountdown frac={finished ? 0 : frac} color={color}>
            <FlipClock seconds={remaining} color={color} />
          </RingCountdown>
        )}
        {display === "hourglass" && (
          <>
            <Hourglass frac={finished ? 0 : frac} color={color} running={running} />
            <FlipClock seconds={remaining} color={color} big />
          </>
        )}
        {display === "flip" && <FlipClock seconds={remaining} color={color} big />}
      </div>

      <div className="timer-meta">
        <span>
          {phases.map((p) => `${Math.round(p.seconds / 60)}m ${p.label.split(" ")[0].toLowerCase()}`).join(" + ")}
        </span>
        {endsAt && <span>ends at {endsAt}</span>}
        {phases.length > 1 && (
          <span>
            Phase {phase + 1} of {phases.length}
          </span>
        )}
      </div>

      <div className="timer-controls">
        {running ? (
          <button onClick={pause}>⏸ Pause</button>
        ) : (
          !finished && (
            <button className="primary" onClick={resume}>
              ▶ Resume
            </button>
          )
        )}
        <button onClick={addMinute} disabled={finished}>
          +1 min
        </button>
        <button onClick={skip} disabled={finished}>
          {phase < phases.length - 1 ? "Skip phase ⏭" : "End ⏭"}
        </button>
        <button onClick={toggleFullscreen}>⤢ Fullscreen</button>
        <button className="danger" onClick={stop}>
          ✕ Stop
        </button>
      </div>
    </div>
  );
}
