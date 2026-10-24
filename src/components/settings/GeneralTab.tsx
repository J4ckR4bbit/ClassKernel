import { useEffect, useMemo, useState } from "react";
import { useAppPick } from "../../store/appStore";
import { SeatNameStyle } from "../../lib/types";
import { dateTimeInZone, deviceTimeZone, listTimeZones } from "../../lib/time";
import RosterSheetTools from "../RosterSheetTools";
import Segmented from "../Segmented";
import DataSettings from "./DataSettings";

/** Settings › General: privacy, display size, the spreadsheet import, time zone, parent reports and data. */
export default function GeneralTab() {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");

  return (
    <>
      <div className="panel">
        <h3>Privacy on the big screen</h3>
        <p className="muted lead">
          ClassKernel assumes the screen is visible to your class. With privacy mode on, screens that show individual
          marks, behaviour or notes stay covered until you tap <b>Show student details</b> — and cover themselves again
          when you leave. Each detail below can also be shown independently if you need it.
        </p>
        <label className="pref-row">
          <input
            type="checkbox"
            className="switch"
            checked={userPrefs.privacyMode}
            onChange={(e) => void setUserPrefs({ ...userPrefs, privacyMode: e.target.checked })}
          />
          <span>
            <b>Privacy mode</b> — cover marks/analysis screens, keep flags, notes and names out of lesson pop-ups and
            toasts. Turn off only if this computer's screen is yours alone.
          </span>
        </label>
        <label className="pref-row">
          <span>Seat names on the class-facing seating plan:</span>
          <select
            value={userPrefs.seatNameStyle}
            onChange={(e) => void setUserPrefs({ ...userPrefs, seatNameStyle: e.target.value as SeatNameStyle })}
          >
            <option value="full">First and last name</option>
            <option value="firstInitial">First name + initial (Amelia A.)</option>
            <option value="first">First name only</option>
          </select>
        </label>
        <label className="pref-row">
          <input
            type="checkbox"
            className="switch"
            checked={userPrefs.showSeatPoints}
            onChange={(e) => void setUserPrefs({ ...userPrefs, showSeatPoints: e.target.checked })}
          />
          <span>Show each student's running behaviour points on their seat during a lesson (a public scoreboard).</span>
        </label>
        <label className="pref-row">
          <input
            type="checkbox"
            className="switch"
            checked={userPrefs.popoverShowFlags}
            onChange={(e) => void setUserPrefs({ ...userPrefs, popoverShowFlags: e.target.checked })}
          />
          <span>
            Show a student's flags (e.g. SEN, Medical) in the seat pop-up during a lesson — useful when safety info
            must be one tap away.
          </span>
        </label>
        <label className="pref-row">
          <input
            type="checkbox"
            className="switch"
            checked={userPrefs.popoverShowNotes}
            onChange={(e) => void setUserPrefs({ ...userPrefs, popoverShowNotes: e.target.checked })}
          />
          <span>Show a student's notes in the seat pop-up during a lesson.</span>
        </label>
      </div>

      <div className="panel">
        <h3>Display size</h3>
        <p className="muted lead">
          Make everything bigger for a large touch panel. Applies to the whole app immediately.
        </p>
        <Segmented
          label="Text and button size"
          options={[1, 1.25, 1.5, 1.75].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
          value={userPrefs.uiScale}
          onChange={(v) => void setUserPrefs({ ...userPrefs, uiScale: v })}
        />
      </div>

      <div className="panel">
        <h3>Classes and students from a spreadsheet</h3>
        <p className="muted lead">
          <b>Template</b> saves a workbook of every class (grade, subject, room) and its students (gender, flags, notes). Fill it in, for
          example from the school's class lists at the start of the year, then import it: new classes and students are added and changed
          details updated. Nobody is removed. For one class, use Template and Import spreadsheet on its Students page.
        </p>
        <div className="row">
          <RosterSheetTools />
        </div>
      </div>

      <TimeZoneSettings />

      <ReportSettings />

      <DataSettings />
    </>
  );
}

/** The zone every date and time is shown and exported in (storage stays UTC). */
function TimeZoneSettings() {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");
  const zones = useMemo(() => listTimeZones(), []);
  const device = deviceTimeZone();
  // Tick once a minute so the "now" preview stays current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel">
      <h3>Time zone</h3>
      <p className="muted lead">
        Dates and times in the behaviour and bathroom logs, the lesson count, attendance and spreadsheet exports are
        shown in this zone. Times are always saved in UTC, so changing this never alters your records — only how
        they're displayed.
      </p>
      <div className="row">
        <select
          value={userPrefs.timeZone}
          onChange={(e) => void setUserPrefs({ ...userPrefs, timeZone: e.target.value })}
          aria-label="Time zone"
        >
          <option value="">This computer's zone ({device})</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="muted">Now: {dateTimeInZone(now)}</span>
      </div>
    </div>
  );
}

/** The names printed at the top of parent reports. Saved when you click away. */
function ReportSettings() {
  const { userPrefs, setUserPrefs } = useAppPick("userPrefs", "setUserPrefs");
  const [school, setSchool] = useState(userPrefs.reportSchool);
  const [teacher, setTeacher] = useState(userPrefs.reportTeacher);
  const save = () => {
    if (school.trim() === userPrefs.reportSchool && teacher.trim() === userPrefs.reportTeacher) return;
    void setUserPrefs({ ...userPrefs, reportSchool: school.trim(), reportTeacher: teacher.trim() });
  };

  return (
    <div className="panel">
      <h3>Parent reports</h3>
      <p className="muted lead">
        Printed at the top of each parent report (Dashboard → Print report). Leave either blank to leave it off.
      </p>
      <div className="form-grid report-settings">
        <label htmlFor="report-school">School name</label>
        <input id="report-school" value={school} onChange={(e) => setSchool(e.target.value)} onBlur={save} placeholder="e.g. St Benedict's College" />
        <label htmlFor="report-teacher">Your name on reports</label>
        <input id="report-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} onBlur={save} placeholder="e.g. Mr K. Hilder" />
      </div>
    </div>
  );
}
