import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "../numbers";
import { formatDuration } from "../../lib/stats";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import {
  AlarmState,
  LIMIT_MAX,
  LIMIT_MIN,
  MeterSettings,
  QUIET_ALARM,
  WARN_BAND,
  alarmStep,
  calibrationOffset,
  displayLevel,
  parseSettings,
  timeWeighted,
  weightedLevel,
  zoneFor,
} from "./meter";
import Icon from "../../components/Icon";

const STORAGE_KEY = "classkernel.noiseMeter";
/** The gauge's span in dB(A): a silent room to a shouting one. */
const GAUGE_MIN = 30;
const GAUGE_MAX = 100;
/** How often the numbers on screen refresh (the alarm runs every frame). */
const DISPLAY_MS = 150;

const ZONE_TEXT = { quiet: "Nice and quiet", warn: "Getting close…", loud: "Too loud!" } as const;

function loadSettings(): MeterSettings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}

function saveSettings(s: MeterSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not fatal: the meter still works, it just forgets on restart.
  }
}

/** Why the microphone couldn't be opened, in words a teacher can act on. */
function micError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "ClassKernel isn't allowed to use the microphone. In Windows, open Settings → Privacy & security → Microphone and turn on “Microphone access” and “Let desktop apps access your microphone”, then press Start again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in (or choose another below) and press Start again.";
  }
  if (name === "NotReadableError") {
    return "The microphone is busy or switched off — another program may be using it.";
  }
  return `The microphone couldn't be opened${e instanceof Error ? `: ${e.message}` : ""}.`;
}

interface Running {
  stream: MediaStream;
  ctx: AudioContext;
  frame: number;
}

/**
 * Class noise meter: listens through the PC's microphone and shows the room's
 * level against a limit the teacher sets, with a visual alarm when the class
 * stays over it. Nothing is recorded or saved — the microphone is only open
 * while the meter is running.
 */
export default function NoiseMeter() {
  const [settings, setSettings] = useState<MeterSettings>(loadSettings);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<number | null>(null);
  const [peak, setPeak] = useState<number | null>(null);
  const [alarm, setAlarm] = useState<AlarmState>(QUIET_ALARM);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [classView, setClassView] = useState(false);
  const [calibInput, setCalibInput] = useState("");

  const run = useRef<Running | null>(null);
  // The audio loop reads these, so they live in refs rather than state.
  const relRef = useRef<number | null>(null);
  const alarmRef = useRef<AlarmState>(QUIET_ALARM);
  const peakRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const update = (patch: Partial<MeterSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const stop = useCallback(() => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    cancelAnimationFrame(r.frame);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => undefined);
    setRunning(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  const start = useCallback(
    async (deviceId = settingsRef.current.deviceId) => {
      stop();
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This version of Windows doesn't let the app reach a microphone.");
        return;
      }
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // Raw input: these filters would flatten exactly what we measure.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        });
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0; // we apply our own time weighting
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Float32Array(analyser.frequencyBinCount);

        relRef.current = null;
        let last = performance.now();
        let lastShown = 0;
        let shownActive = alarmRef.current.active;
        const tick = (now: number) => {
          const dt = Math.min(0.5, (now - last) / 1000);
          last = now;
          analyser.getFloatFrequencyData(bins);
          const rel = timeWeighted(relRef.current, weightedLevel(bins, ctx.sampleRate, analyser.fftSize), dt);
          relRef.current = rel;
          const { offset, limit } = settingsRef.current;
          const shown = displayLevel(rel, offset);
          alarmRef.current = alarmStep(alarmRef.current, shown, limit, dt);
          if (peakRef.current === null || shown > peakRef.current) peakRef.current = shown;
          // Refresh the numbers a few times a second, but the alarm the moment it changes.
          if (now - lastShown >= DISPLAY_MS || alarmRef.current.active !== shownActive) {
            lastShown = now;
            shownActive = alarmRef.current.active;
            setLevel(shown);
            setPeak(peakRef.current);
            setAlarm(alarmRef.current);
          }
          if (run.current) run.current.frame = requestAnimationFrame(tick);
        };
        run.current = { stream, ctx, frame: requestAnimationFrame(tick) };
        setRunning(true);
        void refreshDevices(); // names only appear once permission is granted
      } catch (e) {
        setError(micError(e));
      } finally {
        setStarting(false);
      }
    },
    [stop, refreshDevices],
  );

  // Close the microphone whenever the meter goes away (leaving the plugin,
  // switching it off, closing the app).
  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  // The class view owns the screen; Escape (or ✕) hands it back.
  const openClassView = () => {
    setClassView(true);
    void enterFullscreen();
  };
  const closeClassView = useCallback(() => {
    setClassView(false);
    void restoreWindow();
  }, []);
  useEffect(() => {
    if (!classView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeClassView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [classView, closeClassView]);
  // Leaving the plugin while the class view is up still gives the window back.
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  const resetStats = () => {
    alarmRef.current = { ...QUIET_ALARM, active: alarmRef.current.active };
    peakRef.current = level;
    setAlarm(alarmRef.current);
    setPeak(level);
  };

  const calibrate = () => {
    const reading = parseFloat(calibInput.replace(",", "."));
    if (!Number.isFinite(reading) || relRef.current === null || !Number.isFinite(relRef.current)) return;
    update({ offset: calibrationOffset(relRef.current, reading) });
    setCalibInput("");
  };

  const setLimit = (v: number) => update({ limit: Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(v))) });

  const zone = level === null ? "quiet" : zoneFor(level, settings.limit);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100));
  const calibrated = settings.offset !== null;

  const limitControl = (
    <div className="nm-limit">
      <span>Keep below</span>
      <button onClick={() => setLimit(settings.limit - 1)} aria-label="Lower the limit">
        −
      </button>
      <b className="nm-limit-value">{settings.limit}</b>
      <button onClick={() => setLimit(settings.limit + 1)} aria-label="Raise the limit">
        +
      </button>
      <span>dB(A)</span>
    </div>
  );

  const display = (
    <div className={`nm-display zone-${zone} ${alarm.active ? "alarm" : ""} ${classView ? "class-view" : ""}`}>
      {classView && (
        <button className="nm-close" onClick={closeClassView} title="Back to the controls (Esc)" aria-label="Back to the controls">
          <Icon name="close" />
        </button>
      )}
      {alarm.active && (
        <div className="nm-banner" role="alert">
          TOO LOUD — bring it down
        </div>
      )}
      <div className="nm-reading">
        {level === null ? "—" : formatNumber(level, 0)}
        <span className="nm-unit">dB(A)</span>
      </div>
      <div className="nm-status">
        {!running
          ? "Press Start to listen"
          : alarm.active && level !== null
            ? `${formatNumber(level, 0)} / limit ${settings.limit}`
            : ZONE_TEXT[zone]}
      </div>
      <div className="nm-gauge" aria-hidden>
        <div className="nm-gauge-warn" style={{ left: `${pct(settings.limit - WARN_BAND)}%`, width: `${pct(settings.limit) - pct(settings.limit - WARN_BAND)}%` }} />
        <div className="nm-gauge-fill" style={{ width: `${level === null ? 0 : pct(level)}%` }} />
        <div className="nm-gauge-limit" style={{ left: `${pct(settings.limit)}%` }} />
      </div>
      <div className="nm-scale" aria-hidden>
        <span>{GAUGE_MIN}</span>
        <span>{GAUGE_MAX}</span>
      </div>
      {limitControl}
      {!calibrated && <div className="nm-uncal">Not calibrated — readings are approximate</div>}
    </div>
  );

  // The display stays the same element in both views (only the controls come
  // and go), so switching to the class view doesn't fade it in from blank.
  return (
    <div className="noise-meter">
      {!classView && (
        <div className="nm-controls">
          <div className="panel">
            <div className="row">
              {running ? (
                <button onClick={stop}>
                  <Icon name="mic_off" size={20} /> Stop
                </button>
              ) : (
                <button className="primary" onClick={() => void start()} disabled={starting}>
                  <Icon name="mic" size={20} /> {starting ? "Starting…" : "Start"}
                </button>
              )}
              <button onClick={openClassView} disabled={!running} title="Fill the screen so the class can see it">
                <Icon name="co_present" size={20} /> Show to class
              </button>
            </div>
            {error && <p className="nm-error">{error}</p>}
            {devices.length > 1 && (
              <label className="gp-field" style={{ marginTop: 10 }}>
                <span className="gp-field-label">Microphone</span>
                <select
                  value={settings.deviceId}
                  onChange={(e) => {
                    update({ deviceId: e.target.value });
                    if (running) void start(e.target.value);
                  }}
                >
                  <option value="">Windows default</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted gp-note">
              Listens only while running. Nothing is recorded or saved.
            </p>
          </div>

          <div className="panel">
            <h3>This session</h3>
            <div className="nm-stats">
              <span>Peak</span>
              <b>{peak === null ? "—" : `${formatNumber(peak, 0)} dB(A)`}</b>
              <span>Alarms</span>
              <b>{alarm.count}</b>
              <span>Time over the limit</span>
              <b>{formatDuration(alarm.secondsOver)}</b>
            </div>
            <button className="small" onClick={resetStats} style={{ marginTop: 8 }}>
              Reset
            </button>
          </div>

          <div className="panel">
            <h3>Calibrate</h3>
            <p className="muted gp-note">
              A PC microphone can't measure true loudness on its own. Hold a sound-meter app or meter next to the
              computer, type what it reads, and press Set — once per microphone.
            </p>
            <div className="row">
              <input
                className="nm-calib-input"
                inputMode="decimal"
                placeholder="e.g. 45"
                value={calibInput}
                onChange={(e) => setCalibInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && calibrate()}
                aria-label="Meter reading in dB(A)"
              />
              <span className="muted">dB(A)</span>
              <button onClick={calibrate} disabled={!running || !calibInput.trim()}>
                Set
              </button>
            </div>
            <p className="muted gp-note">
              {calibrated ? "Calibrated for this computer." : "Not calibrated yet."}{" "}
              {calibrated && (
                <button className="small" onClick={() => update({ offset: null })}>
                  Reset calibration
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      {display}
    </div>
  );
}
