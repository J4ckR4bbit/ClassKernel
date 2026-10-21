import { useEffect } from "react";
import { useAppPick } from "../store/appStore";
import { useTimer } from "../plugins/test-timer/timerStore";
import { COLOR_STOPS, formatCountdown, phaseColor } from "../plugins/test-timer/timer";
import { TEST_TIMER_ID } from "../plugins/registry";
import { currentTimeZone } from "../lib/time";
import Icon from "./Icon";

/**
 * The test timer in miniature: a small card in the bottom-right corner while
 * a timer runs and the teacher is on another screen (including both teaching
 * modes). When time runs out it turns red and stays until tapped, so it can't
 * be missed mid-lesson.
 */
export default function TimerMini({ inline = false }: { inline?: boolean }) {
  const { view, activePlugin, focusMode, focusStyle, setFocusMode, openPlugin, userPrefs } = useAppPick(
    "view",
    "activePlugin",
    "focusMode",
    "focusStyle",
    "setFocusMode",
    "openPlugin",
    "userPrefs",
  );
  const { timer, dismissed, pause, resume, dismiss, stop } = useTimer();
  const onTimerScreen = view === "plugin" && activePlugin === TEST_TIMER_ID && !focusMode;
  const enabled = userPrefs.enabledPlugins.includes(TEST_TIMER_ID);
  // The timer is a plugin: switched off, it has no pop-up either — so a timer
  // still counting would chime with nothing on screen to explain or stop it.
  const hasTimer = !!timer;
  useEffect(() => {
    if (!enabled && hasTimer) stop();
  }, [enabled, hasTimer, stop]);
  if (!enabled) return null;
  // In the docked side panel the window is only as wide as the panel, so a
  // corner pop-up would cover its buttons; the panel shows it inline instead.
  const inStrip = focusMode && focusStyle === "strip";
  if (inline !== inStrip) return null;
  if (!timer || onTimerScreen || (timer.finished && dismissed)) return null;

  const current = timer.phases[timer.phase];
  const frac = current ? Math.max(0, Math.min(1, timer.remaining / current.seconds)) : 0;
  const colour = timer.finished ? COLOR_STOPS[COLOR_STOPS.length - 1] : phaseColor(1 - frac);
  const endsAt = timer.running
    ? new Date(Date.now() + timer.remaining * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: currentTimeZone(),
      })
    : null;

  const open = () => {
    if (focusMode) setFocusMode(false);
    openPlugin(TEST_TIMER_ID);
  };

  return (
    <div
      className={`timer-mini no-print ${inline ? "inline" : ""} ${timer.finished ? "done" : ""}`}
      style={{ ["--tm-colour" as string]: colour }}
      role={timer.finished ? "alert" : "status"}
    >
      <button className="timer-mini-body" onClick={open} title="Open the test timer">
        <span className="timer-mini-label">
          {timer.finished ? (
            <>
              <Icon name="alarm" size={18} /> Time's up
            </>
          ) : (
            current?.label
          )}
        </span>
        {!timer.finished && <span className="timer-mini-time">{formatCountdown(timer.remaining)}</span>}
        <span className="timer-mini-sub">
          {timer.finished ? "Tap to open the timer" : endsAt ? `ends at ${endsAt}` : "paused"}
        </span>
      </button>
      <div className="timer-mini-actions">
        {timer.finished ? (
          <button onClick={dismiss} title="Close" aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        ) : timer.running ? (
          <button onClick={pause} title="Pause" aria-label="Pause">
            <Icon name="pause" size={20} />
          </button>
        ) : (
          <button onClick={resume} title="Resume" aria-label="Resume">
            <Icon name="play_arrow" size={20} />
          </button>
        )}
        <button onClick={open} title="Open the test timer" aria-label="Open the test timer">
          <Icon name="open_in_full" size={18} />
        </button>
      </div>
    </div>
  );
}
