import { useEffect } from "react";
import { useAppPick } from "../store/appStore";
import { useNoiseMeter } from "../plugins/noise-meter/noiseStore";
import { percentOfLimit, zoneFor } from "../plugins/noise-meter/meter";
import { NOISE_METER_ID } from "../plugins/registry";
import Icon from "./Icon";
import Body from "./MiniBody";

const ZONE_LABEL = { quiet: "Nice and quiet", warn: "Getting close", loud: "Too loud" } as const;

/**
 * The noise meter in miniature: a small card in the bottom-right corner while
 * the meter is listening and the teacher is on another screen (including both
 * teaching modes). It takes the meter's green / amber / red, and flashes red
 * while the alarm is on.
 */
export default function NoiseMini({ inline = false }: { inline?: boolean }) {
  const { view, activePlugin, focusMode, focusStyle, setFocusMode, openPlugin, userPrefs } = useAppPick(
    "view",
    "activePlugin",
    "focusMode",
    "focusStyle",
    "setFocusMode",
    "openPlugin",
    "userPrefs",
  );
  const { running, level, alarm, settings, stop } = useNoiseMeter();
  const onMeterScreen = view === "plugin" && activePlugin === NOISE_METER_ID && !focusMode;
  const enabled = userPrefs.enabledPlugins.includes(NOISE_METER_ID);
  // Switching the tool off closes the microphone too, rather than leaving it
  // listening with nothing on screen to show or stop it.
  useEffect(() => {
    if (!enabled && running) stop();
  }, [enabled, running, stop]);
  if (!enabled) return null;
  // In the docked side panel a corner pop-up would cover the panel's buttons;
  // the panel shows it inline instead.
  const inStrip = focusMode && focusStyle === "strip";
  if (inline !== inStrip) return null;
  if (!running || onMeterScreen) return null;

  const zone = level === null ? "quiet" : zoneFor(level, settings.limit);
  const open = () => {
    if (focusMode) setFocusMode(false);
    openPlugin(NOISE_METER_ID);
  };

  return (
    <div
      className={`noise-mini no-print zone-${zone} ${alarm.active ? "alarm" : ""} ${inline ? "inline" : ""}`}
      role={alarm.active ? "alert" : "status"}
    >
      {/* In teaching mode a brush against the card mustn't leave the lesson:
          only the open button does that there. */}
      <Body className="noise-mini-body" onClick={focusMode ? undefined : open} title="Open the noise meter">
        <span className="noise-mini-label">
          <Icon name="graphic_eq" size={18} /> {alarm.active ? "Too loud!" : ZONE_LABEL[zone]}
        </span>
        <span className="noise-mini-pct">
          {level === null ? "—" : percentOfLimit(level, settings.limit)}
          <small>%</small>
        </span>
        <span className="noise-mini-sub">
          {level === null ? "—" : Math.round(level)} dB(A) · limit {settings.limit}
        </span>
      </Body>
      <div className="noise-mini-actions">
        <button onClick={stop} title="Stop listening" aria-label="Stop listening">
          <Icon name="mic_off" size={20} />
        </button>
        <button onClick={open} title="Open the noise meter" aria-label="Open the noise meter">
          <Icon name="open_in_full" size={18} />
        </button>
      </div>
    </div>
  );
}
