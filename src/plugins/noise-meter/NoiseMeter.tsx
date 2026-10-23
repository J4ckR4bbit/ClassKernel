import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "../numbers";
import { formatDuration } from "../../lib/stats";
import { enterFullscreen, restoreWindow } from "../../lib/teachingWindow";
import { LIMIT_MAX, LIMIT_MIN, WARN_BAND, percentOfLimit, zoneFor } from "./meter";
import { useNoiseMeter } from "./noiseStore";
import Icon from "../../components/Icon";
import LevelGraph from "./LevelGraph";
import "../shared/tool-layout.css";
import "./noise-meter.css";

/** The graph's span in dB(A): a silent room to a shouting one. */
const GRAPH_MIN = 30;
const GRAPH_MAX = 100;
/**
 * The bar shows the same % as the big figure, from 0 to this much of the
 * limit: the limit sits two-thirds along, so "how far over" still shows.
 */
const BAR_MAX_PCT = 150;

const ZONE_TEXT = { quiet: "Nice and quiet", warn: "Getting close…", loud: "Too loud!" } as const;

/**
 * Class noise meter: listens through the PC's microphone and shows the room's
 * level against a limit the teacher sets, with a visual alarm when the class
 * stays over it. Nothing is recorded or saved — the microphone is only open
 * while the meter is running. It keeps running when the teacher leaves this
 * screen (see ./noiseStore and the NoiseMini pop-up) until Stop is pressed.
 */
export default function NoiseMeter() {
  const { settings, running, starting, error, level, peak, alarm, history, devices, start, stop, update, resetStats, refreshDevices } =
    useNoiseMeter();
  const [classView, setClassView] = useState(false);
  const [calibInput, setCalibInput] = useState("");

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
  // Leaving the tool while the class view is up still gives the window back.
  const classViewRef = useRef(classView);
  classViewRef.current = classView;
  useEffect(() => () => void (classViewRef.current && restoreWindow()), []);

  const calibrate = () => {
    if (useNoiseMeter.getState().calibrate(parseFloat(calibInput.replace(",", ".")))) setCalibInput("");
  };

  const setLimit = (v: number) => update({ limit: Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(v))) });

  const zone = level === null ? "quiet" : zoneFor(level, settings.limit);
  const reading = level === null ? null : percentOfLimit(level, settings.limit);
  // Where a % of the limit falls along the bar, as a % of the bar's width.
  const along = (pctOfLimit: number) => Math.min(100, Math.max(0, (pctOfLimit / BAR_MAX_PCT) * 100));
  const warnFrom = percentOfLimit(settings.limit - WARN_BAND, settings.limit);
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
      <div className="nm-reading" aria-label={reading === null ? undefined : `${reading} % of the limit`}>
        {reading ?? "—"}
        <span className="nm-unit">%</span>
      </div>
      <div className="nm-db">
        {level === null ? "—" : formatNumber(level, 0)}
        <span className="nm-unit">dB(A)</span>
      </div>
      <div className="nm-status">
        {!running
          ? "Press Start to listen"
          : alarm.active
            ? `Limit ${settings.limit} dB(A)`
            : ZONE_TEXT[zone]}
      </div>
      <div className="nm-gauge" aria-hidden>
        <div className="nm-gauge-warn" style={{ left: `${along(warnFrom)}%`, width: `${along(100) - along(warnFrom)}%` }} />
        <div className="nm-gauge-fill" style={{ width: `${along(reading ?? 0)}%` }} />
        <div className="nm-gauge-limit" style={{ left: `${along(100)}%` }} />
      </div>
      <div className="nm-scale" aria-hidden>
        <span>0%</span>
        <span className="nm-scale-limit" style={{ left: `${along(100)}%` }}>
          100% = limit
        </span>
        <span>{BAR_MAX_PCT}%</span>
      </div>
      {limitControl}
      {!calibrated && <div className="nm-uncal">Not calibrated — readings are approximate</div>}
      <LevelGraph samples={history} limit={settings.limit} min={GRAPH_MIN} max={GRAPH_MAX} />
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
              Listens only while running — including on other screens, as a pop-up in the corner, until you press Stop.
              Nothing is recorded or saved.
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
