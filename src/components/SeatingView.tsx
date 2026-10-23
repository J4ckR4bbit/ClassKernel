import { useMemo, useState } from "react";
import { useAppPick } from "../store/appStore";
import { SeatAssignment, studentName } from "../lib/types";
import { displayStudentName, seatSurname } from "../lib/privacy";
import { allSeatSlots } from "../lib/seating";
import { useSeatingShuffle } from "../hooks/useSeatingShuffle";
import RoomCanvas from "./RoomCanvas";
import { fitView } from "../lib/room";
import Icon from "./Icon";
import { longDate } from "../lib/format";
import { today } from "../lib/id";

export default function SeatingView() {
  const {
    students,
    desks,
    seating,
    setSeating,
    showToast,
    setView,
    roomConfig,
    userPrefs,
    confirmDialog,
    promptDialog,
    currentClass,
    classes,
  } = useAppPick(
    "students",
    "desks",
    "seating",
    "setSeating",
    "showToast",
    "setView",
    "roomConfig",
    "userPrefs",
    "confirmDialog",
    "promptDialog",
    "currentClass",
    "classes",
  );
  // Plans exist in seating.csv once they have a row; freshly created empty
  // plans are tracked locally until their first seat is placed.
  const [extraPlans, setExtraPlans] = useState<string[]>([]);
  const planNames = useMemo(() => {
    const names = [...new Set([...seating.map((s) => s.planName), ...extraPlans])];
    return names.length ? names.sort() : ["Default"];
  }, [seating, extraPlans]);
  const [plan, setPlan] = useState(planNames[0]);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  // Animated reroll (flashes names across seats before settling) shared with the
  // live-lesson view.
  // Seats are assigned once per lesson; after that the button asks for the PIN.
  const { shuffleFrame, isShuffling, randomise, locked, requestUnlock } = useSeatingShuffle();
  const activePlan = planNames.includes(plan) ? plan : planNames[0];

  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  // With no view crop set, zoom to the furniture (as the Lesson page does).
  const view = useMemo(() => roomConfig.crop ?? fitView(desks), [roomConfig.crop, desks]);
  const seatedIds = new Set(planSeats.map((s) => s.studentId));
  const unseated = students.filter((s) => !seatedIds.has(s.id));
  const capacity = allSeatSlots(desks).length;
  // What the canvas actually draws: the live shuffle frame while rerolling.
  const shownSeats = shuffleFrame ?? planSeats;

  const occupantOf = (deskId: string, seatIndex: number) =>
    planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
  const shownOccupantOf = (deskId: string, seatIndex: number) =>
    shownSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);

  const replacePlan = (assignments: SeatAssignment[]) => {
    void setSeating([...seating.filter((s) => s.planName !== activePlan), ...assignments]);
  };

  const onSeatClick = (deskId: string, seatIndex: number) => {
    if (isShuffling) return;
    const existing = occupantOf(deskId, seatIndex);
    if (pickedStudent) {
      // Place picked student here (displacing any occupant back to unseated).
      const rest = planSeats.filter(
        (s) => !(s.deskId === deskId && s.seatIndex === seatIndex) && s.studentId !== pickedStudent,
      );
      replacePlan([...rest, { planName: activePlan, deskId, seatIndex, studentId: pickedStudent }]);
      setPickedStudent(null);
    } else if (existing) {
      // Pick the student up off the seat.
      replacePlan(planSeats.filter((s) => s !== existing));
      setPickedStudent(existing.studentId);
    }
  };

  const newPlan = async () => {
    const name = (await promptDialog({
      title: "New seating plan",
      body: "Plans let you keep e.g. a test layout and a group-work layout side by side.",
      initial: `Plan ${planNames.length + 1}`,
    }))?.trim();
    if (!name) return;
    if (planNames.includes(name)) {
      showToast("A plan with that name already exists");
      return;
    }
    setExtraPlans([...extraPlans, name]);
    setPlan(name);
    showToast(`Plan "${name}" created — seat students or use Randomise`);
  };

  const deletePlan = async () => {
    const ok = await confirmDialog({
      title: `Delete seating plan "${activePlan}"?`,
      confirmLabel: "Delete plan",
      danger: true,
    });
    if (!ok) return;
    void setSeating(seating.filter((s) => s.planName !== activePlan));
    setExtraPlans(extraPlans.filter((n) => n !== activePlan));
    setPlan(planNames.filter((n) => n !== activePlan)[0] ?? "Default");
  };

  const clearPlan = () => {
    const previous = seating;
    replacePlan([]);
    showToast(`Cleared "${activePlan}"`, { label: "Undo", run: () => void setSeating(previous) });
  };

  const runRandomise = () => {
    setPickedStudent(null);
    randomise(activePlan);
  };

  const room = classes.find((c) => c.name === currentClass)?.room;

  return (
    <div className="seating-page">
      {/* On paper the top bar is gone: say whose plan this is, for a cover teacher. */}
      <h2 className="print-only">
        {currentClass}
        {room ? ` · ${room}` : ""} — {activePlan} seating plan · {longDate(today())}
      </h2>
      <div className="view-header">
        <select value={activePlan} onChange={(e) => setPlan(e.target.value)} disabled={isShuffling}>
          {planNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button onClick={() => void newPlan()} disabled={isShuffling}>
          <Icon name="add" size={20} /> New plan
        </button>
        <button onClick={() => void deletePlan()} disabled={isShuffling}>
          Delete plan
        </button>
        <div className="spacer" />
        <button onClick={clearPlan} disabled={planSeats.length === 0 || isShuffling}>
          Clear seats
        </button>
        {locked ? (
          <button
            onClick={requestUnlock}
            disabled={isShuffling}
            title="Seats were assigned this lesson — enter your PIN to assign them again"
          >
            <Icon name="lock" size={20} /> Reseat…
          </button>
        ) : (
          <button
            className="primary"
            onClick={runRandomise}
            disabled={desks.length === 0 || students.length === 0 || isShuffling}
            title="Reroll seating using your saved rules"
          >
            <Icon name="casino" size={20} /> {isShuffling ? "Randomising…" : "Randomise"}
          </button>
        )}
        <button onClick={() => window.print()} disabled={isShuffling}>
          <Icon name="print" size={20} /> Print
        </button>
      </div>

      {desks.length === 0 ? (
        <div className="panel">
          No room layout yet.{" "}
          <button className="small" onClick={() => setView("layout")}>
            Design your room first <Icon name="chevron_right" size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="panel no-print">
            <div className="row">
              <b>Unseated ({unseated.length}):</b>
              <div className="roster-chips grow">
                {unseated.map((s) => (
                  <span
                    key={s.id}
                    className={`chip ${pickedStudent === s.id ? "selected" : ""}`}
                    onClick={() => !isShuffling && setPickedStudent(pickedStudent === s.id ? null : s.id)}
                  >
                    {studentName(s)}
                  </span>
                ))}
                {unseated.length === 0 && <span className="muted">everyone is seated</span>}
              </div>
            </div>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {pickedStudent
                ? `Click a seat to place ${studentName(byId.get(pickedStudent)!)} — or click their chip again to cancel.`
                : `Click a student chip, then a seat. Click an occupied seat to pick that student up. “Randomise” rerolls using the rules in Settings (once per lesson — after that it needs your PIN). Capacity: ${capacity} seats for ${students.length} students.`}
            </p>
          </div>

          <div className={`seating-canvas ${isShuffling ? "shuffling" : ""}`}>
            <RoomCanvas
              desks={desks}
              frontEdge={roomConfig.frontEdge}
              crop={view}
              seatFontScale={roomConfig.seatFontScale}
              deskFontScale={roomConfig.deskFontScale}
              labelFontScale={roomConfig.labelFontScale}
              seatContent={(deskId, seatIndex) => {
                const occ = shownOccupantOf(deskId, seatIndex);
                const s = occ ? byId.get(occ.studentId) : undefined;
                return {
                  label: s ? displayStudentName(s, userPrefs.seatNameStyle) : "",
                  firstName: s?.firstName,
                  lastName: s ? seatSurname(s, userPrefs.seatNameStyle) : undefined,
                  occupied: !!s,
                  highlight: !!pickedStudent && !occ,
                };
              }}
              onSeatClick={onSeatClick}
            />
            {isShuffling && (
              <div className="shuffle-overlay no-print">
                <Icon name="casino" size={20} /> Randomising seats…
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
