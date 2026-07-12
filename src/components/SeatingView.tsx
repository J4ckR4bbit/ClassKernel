import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { SeatAssignment, studentName } from "../lib/types";
import { assignRandomSeats, allSeatSlots } from "../lib/seating";
import RoomCanvas from "./RoomCanvas";

const SHUFFLE_FRAMES = 12;
const SHUFFLE_INTERVAL = 90;

export default function SeatingView() {
  const {
    currentClass,
    students,
    desks,
    seating,
    setSeating,
    seatingPrefs,
    showToast,
    setView,
    roomConfig,
    pendingRandomise,
    setPendingRandomise,
  } = useApp();
  // Plans exist in seating.csv once they have a row; freshly created empty
  // plans are tracked locally until their first seat is placed.
  const [extraPlans, setExtraPlans] = useState<string[]>([]);
  const planNames = useMemo(() => {
    const names = [...new Set([...seating.map((s) => s.planName), ...extraPlans])];
    return names.length ? names.sort() : ["Default"];
  }, [seating, extraPlans]);
  const [plan, setPlan] = useState(planNames[0]);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  // While rerolling we flash the names across the target seats before settling,
  // so the class can see the seating really is being shuffled.
  const [shuffleFrame, setShuffleFrame] = useState<SeatAssignment[] | null>(null);
  const shuffleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activePlan = planNames.includes(plan) ? plan : planNames[0];

  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const seatedIds = new Set(planSeats.map((s) => s.studentId));
  const unseated = students.filter((s) => !seatedIds.has(s.id));
  const capacity = allSeatSlots(desks).length;
  const isShuffling = shuffleFrame !== null;
  // What the canvas actually draws: the live shuffle frame while rerolling.
  const shownSeats = shuffleFrame ?? planSeats;

  useEffect(() => () => void (shuffleTimer.current && clearInterval(shuffleTimer.current)), []);

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

  const newPlan = () => {
    const name = prompt("Name for the new seating plan:", `Plan ${planNames.length + 1}`)?.trim();
    if (!name) return;
    if (planNames.includes(name)) {
      showToast("A plan with that name already exists");
      return;
    }
    setExtraPlans([...extraPlans, name]);
    setPlan(name);
    showToast(`Plan "${name}" created — seat students or use Randomise`);
  };

  const deletePlan = () => {
    if (!confirm(`Delete seating plan "${activePlan}"?`)) return;
    void setSeating(seating.filter((s) => s.planName !== activePlan));
    setExtraPlans(extraPlans.filter((n) => n !== activePlan));
    setPlan(planNames.filter((n) => n !== activePlan)[0] ?? "Default");
  };

  const clearPlan = () => replacePlan([]);

  // Reroll using the saved (hidden) preferences, with a shuffle animation.
  const randomise = () => {
    if (isShuffling) return;
    setPickedStudent(null);
    const result = assignRandomSeats(students, desks, activePlan, {
      ...seatingPrefs,
      frontEdge: roomConfig.frontEdge,
    });
    if (result.assignments.length === 0) {
      showToast("Add desks and students first");
      return;
    }
    const targetSeats = result.assignments.map((a) => ({ deskId: a.deskId, seatIndex: a.seatIndex }));
    const ids = result.assignments.map((a) => a.studentId);
    let frame = 0;
    shuffleTimer.current = setInterval(() => {
      frame++;
      // Randomly scatter the names across the final set of seats each frame.
      const shuffled = [...ids];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setShuffleFrame(
        targetSeats.map((s, i) => ({ planName: activePlan, deskId: s.deskId, seatIndex: s.seatIndex, studentId: shuffled[i] })),
      );
      if (frame >= SHUFFLE_FRAMES) {
        if (shuffleTimer.current) clearInterval(shuffleTimer.current);
        shuffleTimer.current = null;
        setShuffleFrame(null);
        replacePlan(result.assignments.map((a) => ({ ...a, planName: activePlan })));
        showToast(
          result.violations.length
            ? `Seated with ${result.violations.length} unmet constraint${result.violations.length > 1 ? "s" : ""}`
            : "Seating randomised",
        );
      }
    }, SHUFFLE_INTERVAL);
  };

  // Arriving from the Home "Randomise seating" button: run the animated reroll
  // once the class's desks and students are loaded, then clear the request.
  useEffect(() => {
    if (pendingRandomise && desks.length > 0 && students.length > 0 && !isShuffling) {
      setPendingRandomise(false);
      randomise();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRandomise, desks.length, students.length]);

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Seating</h1>
        <select value={activePlan} onChange={(e) => setPlan(e.target.value)} disabled={isShuffling}>
          {planNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button onClick={newPlan} disabled={isShuffling}>
          + New plan
        </button>
        <button onClick={deletePlan} disabled={isShuffling}>
          Delete plan
        </button>
        <div className="spacer" />
        <button onClick={clearPlan} disabled={planSeats.length === 0 || isShuffling}>
          Clear seats
        </button>
        <button
          className="no-print"
          onClick={() => setView("settings")}
          title="Configure keep-apart, keep-together and front-of-room rules (kept in Settings, out of sight of the class)"
        >
          ⚙ Set up random…
        </button>
        <button
          className="primary"
          onClick={randomise}
          disabled={desks.length === 0 || students.length === 0 || isShuffling}
          title="Reroll seating using your saved rules"
        >
          🎲 {isShuffling ? "Randomising…" : "Randomise"}
        </button>
        <button onClick={() => window.print()} disabled={isShuffling}>
          🖨 Print
        </button>
      </div>

      {desks.length === 0 ? (
        <div className="panel">
          No room layout yet.{" "}
          <button className="small" onClick={() => setView("layout")}>
            Design your room first →
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
                : `Click a student chip, then a seat. Click an occupied seat to pick that student up. “Randomise” rerolls using the rules in Settings. Capacity: ${capacity} seats for ${students.length} students.`}
            </p>
          </div>

          <div className={`seating-canvas ${isShuffling ? "shuffling" : ""}`}>
            <RoomCanvas
              desks={desks}
              frontEdge={roomConfig.frontEdge}
              crop={roomConfig.crop}
              seatFontScale={roomConfig.seatFontScale}
              deskFontScale={roomConfig.deskFontScale}
              labelFontScale={roomConfig.labelFontScale}
              seatContent={(deskId, seatIndex) => {
                const occ = shownOccupantOf(deskId, seatIndex);
                const s = occ ? byId.get(occ.studentId) : undefined;
                return {
                  label: s ? studentName(s) : "",
                  firstName: s?.firstName,
                  lastName: s?.lastName,
                  occupied: !!s,
                  highlight: !!pickedStudent && !occ,
                };
              }}
              onSeatClick={onSeatClick}
            />
            {isShuffling && <div className="shuffle-overlay no-print">🎲 Randomising seats…</div>}
          </div>
        </>
      )}
    </div>
  );
}
