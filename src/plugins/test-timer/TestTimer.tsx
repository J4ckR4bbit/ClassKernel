import { useEffect, useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { TimerDisplay, TimerPreset } from "../../lib/types";
import { currentTimeZone } from "../../lib/time";
import { FlipDisplay } from "../shared/FlipDigits";
import { COLOR_STOPS, TimerPhase, phaseColor } from "./timer";
import { useTimer } from "./timerStore";

// The test timer, as a plugin: a big countdown for exams and timed tasks with
// optional reading + writing phases. The countdown itself lives in
// ./timerStore so it keeps running (as the TimerMini pop-up) on other screens.

// The countdown as split-flap cards (shared with the clock plugin).
function FlipClock({ seconds, color, big }: { seconds: number; color: string; big?: boolean }) {
  const total = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return <FlipDisplay text={`${mm}:${ss}`} color={color} big={big} />;
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

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: currentTimeZone() });
}

export default function TestTimer() {
  const { timerPresets, setTimerPresets, showToast, promptDialog } = useApp();

  // setup fields
  const [readingMin, setReadingMin] = useState(10);
  const [writingMin, setWritingMin] = useState(40);
  const [display, setDisplay] = useState<TimerDisplay>("circle");
  const [chimeOn, setChimeOn] = useState(true);

  // The running timer lives in its own store, so it carries on (as a small
  // pop-up) when the teacher leaves this screen.
  const { timer, display: runDisplay, start: startTimer, pause, resume, addMinute, skip, stop } = useTimer();
  const started = timer !== null;
  const running = !!timer?.running;
  const finished = !!timer?.finished;
  const phases = timer?.phases ?? [];
  const phase = timer?.phase ?? 0;
  const remaining = timer?.remaining ?? 0;
  const [now, setNow] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  // wall clock (time of day + live end-time)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const buildPhases = (): TimerPhase[] => {
    const list: TimerPhase[] = [];
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
    startTimer(list, display, chimeOn);
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

  const savePreset = async () => {
    const name = await promptDialog({ title: "Save timer preset", initial: `${readingMin} read · ${writingMin} write` });
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
            <button onClick={() => void savePreset()}>Save current settings</button>
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
        {runDisplay === "circle" && (
          <RingCountdown frac={finished ? 0 : frac} color={color}>
            <FlipClock seconds={remaining} color={color} />
          </RingCountdown>
        )}
        {runDisplay === "hourglass" && (
          <>
            <Hourglass frac={finished ? 0 : frac} color={color} running={running} />
            <FlipClock seconds={remaining} color={color} big />
          </>
        )}
        {runDisplay === "flip" && <FlipClock seconds={remaining} color={color} big />}
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
