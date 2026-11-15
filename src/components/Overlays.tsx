import { useApp, useAppPick } from "../store/appStore";
import AppDialog from "./AppDialog";
import NoteEditor from "./notes/NoteEditor";
import TimerMini from "./TimerMini";
import NoiseMini from "./NoiseMini";
import { SyncOverlay } from "./FolderBanner";

/** Toast + dialog + save-error UI shared by every shell (the app, teaching mode, the tools website). */
export default function Overlays() {
  const { toast, saveError, retrySave } = useAppPick("toast", "saveError", "retrySave");
  // On the teaching room plan, keep the pop-ups clear of End lesson, which
  // sits at the end of the lesson bar on whichever edge Settings puts it.
  const barSide = useApp((s) => (s.focusMode && s.focusStyle === "room" ? s.userPrefs.lessonBarSide : null));
  return (
    <>
      {saveError && (
        <div className="save-error-banner" role="alert">
          Couldn't save {saveError.label} to disk — your changes are only in memory.
          <button onClick={() => void retrySave()}>Try again</button>
        </div>
      )}
      {/* Always there, so a screen reader reads each message as it appears. */}
      <div className="live-region" role="status">
        {toast && (
          <div className="toast">
            {toast.message}
            {toast.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.onAction?.();
                  useApp.setState({ toast: null });
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {/* The running tools' pop-ups, stacked in the bottom-right corner. */}
      <div className={`mini-stack no-print ${barSide ? `bar-${barSide}` : ""}`}>
        <NoiseMini />
        <TimerMini />
      </div>
      <SyncOverlay />
      <NoteEditor />
      <AppDialog />
    </>
  );
}
