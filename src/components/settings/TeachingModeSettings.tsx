import { useApp, useAppPick } from "../../store/appStore";
import { LESSON_BAR_SIDES, LessonBarSide, TeachingStyle } from "../../lib/types";
import { PIN_HINT, hashPin, isValidPin, pinMatches } from "../../lib/pin";
import { IconName } from "../Icon";
import Segmented from "../Segmented";

const SIDE_LABELS: Record<LessonBarSide, string> = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

/** Teaching-mode preferences: which mode opens, where its buttons sit, and the reseat PIN. */
export default function TeachingModeSettings() {
  const { userPrefs, setUserPrefs, promptDialog, showToast } = useAppPick(
    "userPrefs",
    "setUserPrefs",
    "promptDialog",
    "showToast",
  );
  const hasPin = !!userPrefs.reseatPinHash;

  const styles: Array<{ value: TeachingStyle; label: string; icon: IconName }> = [
    { value: "room", label: "Room plan (full screen)", icon: "fullscreen" },
    { value: "strip", label: "Side panel of tables", icon: "dock_to_left" },
  ];

  // Changing or removing a PIN needs the current one, so a student at the
  // board can't simply clear it here.
  const confirmCurrent = async (): Promise<boolean> => {
    const pin = await promptDialog({ title: "Enter your current PIN", confirmLabel: "Continue", secret: true });
    if (pin === null) return false;
    if (!(await pinMatches(pin, userPrefs.reseatPinHash))) {
      showToast("Incorrect PIN — nothing changed");
      return false;
    }
    return true;
  };

  const setPin = async () => {
    if (hasPin && !(await confirmCurrent())) return;
    const pin = await promptDialog({ title: hasPin ? "New reseat PIN" : "Set a reseat PIN", body: PIN_HINT, confirmLabel: "Next", secret: true });
    if (pin === null) return;
    if (!isValidPin(pin)) {
      showToast(`A PIN must be ${PIN_HINT}`);
      return;
    }
    const again = await promptDialog({ title: "Type the PIN again", confirmLabel: "Save PIN", secret: true });
    if (again === null) return;
    if (again !== pin) {
      showToast("The PINs didn't match — nothing changed");
      return;
    }
    await setUserPrefs({ ...useApp.getState().userPrefs, reseatPinHash: await hashPin(pin) });
    showToast("Reseat PIN saved");
  };

  const removePin = async () => {
    if (!(await confirmCurrent())) return;
    await setUserPrefs({ ...useApp.getState().userPrefs, reseatPinHash: "" });
    showToast("Reseat PIN removed — the next unlock will ask you to set one");
  };

  return (
    <div className="panel">
      <h3>Teaching mode</h3>
      <p className="muted lead">
        Which view the <b>Teaching mode</b> button opens. The side panel docks a narrow list of tables to the edge of
        the screen, always on top, so your slides and annotations keep the rest. You can switch between them during a
        lesson.
      </p>
      <Segmented
        label="Teaching mode"
        options={styles}
        value={userPrefs.teachingStyle}
        onChange={(v) => void setUserPrefs({ ...userPrefs, teachingStyle: v })}
      />

      <h4>Side panel edge</h4>
      <Segmented
        label="Side panel edge"
        options={(["left", "right"] as const).map((side) => ({ value: side, label: SIDE_LABELS[side] }))}
        value={userPrefs.dockSide}
        onChange={(v) => void setUserPrefs({ ...userPrefs, dockSide: v })}
      />

      <h4>Room plan buttons</h4>
      <p className="muted lead">
        Which edge of the room-plan screen the lesson buttons (Pick a student, Randomise, End lesson) sit on. Put them
        within reach of where you stand.
      </p>
      <Segmented
        label="Room plan buttons"
        options={LESSON_BAR_SIDES.map((side) => ({ value: side, label: SIDE_LABELS[side] }))}
        value={userPrefs.lessonBarSide}
        onChange={(v) => void setUserPrefs({ ...userPrefs, lessonBarSide: v })}
      />

      <h4>Reseat PIN</h4>
      <p className="muted lead">
        Seats can be assigned (<b>Randomise</b>) once per lesson. After that the button shows a lock (<b>Reseat…</b>) and
        needs this PIN to assign them again, so nobody reshuffles the class by accident. Ending the lesson, or a new day, unlocks it.{" "}
        {hasPin ? "A PIN is set." : "No PIN yet — set one now, or you'll be asked the first time you unlock."}
      </p>
      <div className="row">
        <button onClick={() => void setPin()}>{hasPin ? "Change PIN" : "Set PIN"}</button>
        {hasPin && <button onClick={() => void removePin()}>Remove PIN</button>}
      </div>
    </div>
  );
}
