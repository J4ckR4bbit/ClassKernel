import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { SeatAssignment, Student, studentName } from "../lib/types";
import { assignRandomSeats, allSeatSlots } from "../lib/seating";
import RoomCanvas from "./RoomCanvas";

export default function SeatingView() {
  const { currentClass, students, desks, seating, setSeating, showToast, setView } = useApp();
  // Plans exist in seating.csv once they have a row; freshly created empty
  // plans are tracked locally until their first seat is placed.
  const [extraPlans, setExtraPlans] = useState<string[]>([]);
  const planNames = useMemo(() => {
    const names = [...new Set([...seating.map((s) => s.planName), ...extraPlans])];
    return names.length ? names.sort() : ["Default"];
  }, [seating, extraPlans]);
  const [plan, setPlan] = useState(planNames[0]);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [showRandom, setShowRandom] = useState(false);
  const activePlan = planNames.includes(plan) ? plan : planNames[0];

  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const seatedIds = new Set(planSeats.map((s) => s.studentId));
  const unseated = students.filter((s) => !seatedIds.has(s.id));
  const capacity = allSeatSlots(desks).length;

  const occupantOf = (deskId: string, seatIndex: number) =>
    planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);

  const replacePlan = (assignments: SeatAssignment[]) => {
    void setSeating([...seating.filter((s) => s.planName !== activePlan), ...assignments]);
  };

  const onSeatClick = (deskId: string, seatIndex: number) => {
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
    showToast(`Plan "${name}" created — seat students or use Random assign`);
  };

  const deletePlan = () => {
    if (!confirm(`Delete seating plan "${activePlan}"?`)) return;
    void setSeating(seating.filter((s) => s.planName !== activePlan));
    setExtraPlans(extraPlans.filter((n) => n !== activePlan));
    setPlan(planNames.filter((n) => n !== activePlan)[0] ?? "Default");
  };

  const clearPlan = () => replacePlan([]);

  return (
    <div>
      <div className="view-header">
        <h1>{currentClass} — Seating</h1>
        <select value={activePlan} onChange={(e) => setPlan(e.target.value)}>
          {planNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button onClick={newPlan}>+ New plan</button>
        <button onClick={deletePlan}>Delete plan</button>
        <div className="spacer" />
        <button onClick={clearPlan} disabled={planSeats.length === 0}>
          Clear seats
        </button>
        <button onClick={() => setShowRandom(true)} disabled={desks.length === 0 || students.length === 0}>
          🎲 Random assign…
        </button>
        <button onClick={() => window.print()}>🖨 Print</button>
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
                    onClick={() => setPickedStudent(pickedStudent === s.id ? null : s.id)}
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
                : `Click a student chip, then a seat. Click an occupied seat to pick that student up. Capacity: ${capacity} seats for ${students.length} students.`}
            </p>
          </div>

          <RoomCanvas
            desks={desks}
            seatContent={(deskId, seatIndex) => {
              const occ = occupantOf(deskId, seatIndex);
              const s = occ ? byId.get(occ.studentId) : undefined;
              return {
                label: s ? `${s.firstName} ${s.lastName.charAt(0)}`.trim() : "",
                occupied: !!s,
                highlight: !!pickedStudent && !occ,
              };
            }}
            onSeatClick={onSeatClick}
          />
        </>
      )}

      {showRandom && (
        <RandomAssignModal
          students={students}
          onClose={() => setShowRandom(false)}
          onAssign={(assignments, violations) => {
            replacePlan(assignments.map((a) => ({ ...a, planName: activePlan })));
            setShowRandom(false);
            showToast(
              violations.length
                ? `Seated with ${violations.length} unmet constraint${violations.length > 1 ? "s" : ""}`
                : "Random seating applied",
            );
          }}
        />
      )}
    </div>
  );
}

function RandomAssignModal({
  students,
  onClose,
  onAssign,
}: {
  students: Student[];
  onClose: () => void;
  onAssign: (assignments: SeatAssignment[], violations: string[]) => void;
}) {
  const { desks } = useApp.getState();
  const [apartPairs, setApartPairs] = useState<Array<[string, string]>>([]);
  const [togetherPairs, setTogetherPairs] = useState<Array<[string, string]>>([]);
  const [frontIds, setFrontIds] = useState<string[]>([]);
  const [alternateGender, setAlternateGender] = useState(false);
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [preview, setPreview] = useState<{ assignments: SeatAssignment[]; violations: string[] } | null>(null);

  const nameOf = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? studentName(s) : id;
  };

  const addPair = (kind: "apart" | "together") => {
    if (!pairA || !pairB || pairA === pairB) return;
    const pair: [string, string] = [pairA, pairB];
    if (kind === "apart") setApartPairs([...apartPairs, pair]);
    else setTogetherPairs([...togetherPairs, pair]);
    setPairA("");
    setPairB("");
  };

  const roll = () => {
    const result = assignRandomSeats(students, desks, "current", {
      apartPairs,
      togetherPairs,
      frontIds,
      alternateGender,
    });
    setPreview({ assignments: result.assignments, violations: result.violations });
    return result;
  };

  // The caller rewrites planName onto the active plan when applying.
  const apply = () => {
    const result = preview ?? roll();
    onAssign(result.assignments, result.violations);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ minWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2>Random seat assigner</h2>

        <div className="row" style={{ marginBottom: 8 }}>
          <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
            <option value="">— student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </select>
          <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
            <option value="">— student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </select>
          <button onClick={() => addPair("apart")} disabled={!pairA || !pairB || pairA === pairB}>
            Keep apart
          </button>
          <button onClick={() => addPair("together")} disabled={!pairA || !pairB || pairA === pairB}>
            Keep together
          </button>
        </div>

        {(apartPairs.length > 0 || togetherPairs.length > 0) && (
          <div style={{ marginBottom: 8 }}>
            {apartPairs.map((p, i) => (
              <span key={`a${i}`} className="tag warn" style={{ cursor: "pointer" }} onClick={() => setApartPairs(apartPairs.filter((_, j) => j !== i))} title="Click to remove">
                ⇹ {nameOf(p[0])} ↔ {nameOf(p[1])} ✕
              </span>
            ))}
            {togetherPairs.map((p, i) => (
              <span key={`t${i}`} className="tag" style={{ cursor: "pointer" }} onClick={() => setTogetherPairs(togetherPairs.filter((_, j) => j !== i))} title="Click to remove">
                ⇆ {nameOf(p[0])} + {nameOf(p[1])} ✕
              </span>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <b>Front of room:</b>{" "}
          <span className="muted">click students who should sit near the front</span>
          <div className="roster-chips" style={{ marginTop: 6 }}>
            {students.map((s) => (
              <span
                key={s.id}
                className={`chip ${frontIds.includes(s.id) ? "selected" : ""}`}
                onClick={() =>
                  setFrontIds(frontIds.includes(s.id) ? frontIds.filter((id) => id !== s.id) : [...frontIds, s.id])
                }
              >
                {studentName(s)}
              </span>
            ))}
          </div>
        </div>

        <label className="row" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={alternateGender} onChange={(e) => setAlternateGender(e.target.checked)} />
          Avoid single-gender desks (where gender is recorded)
        </label>

        {preview && (
          <div className="panel" style={{ marginBottom: 0 }}>
            {preview.violations.length === 0 ? (
              <span style={{ color: "var(--accent)" }}>✓ All constraints satisfied</span>
            ) : (
              <>
                <b>Unmet constraints ({preview.violations.length}):</b>
                <ul style={{ margin: "6px 0 0" }}>
                  {preview.violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={roll}>🎲 {preview ? "Re-roll" : "Roll"}</button>
          <button className="primary" onClick={apply}>
            Apply seating
          </button>
        </div>
      </div>
    </div>
  );
}
