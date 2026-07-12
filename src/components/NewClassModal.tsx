import { useState } from "react";
import { ClassInfo } from "../lib/types";

export default function NewClassModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (info: ClassInfo) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [subject, setSubject] = useState("");
  const [room, setRoom] = useState("");

  // Class name doubles as its folder name — keep it filesystem-safe.
  const safeName = name.replace(/[<>:"/\\|?*]/g, "").trim();

  const submit = async () => {
    if (!safeName) return;
    await onCreate({ name: safeName, year, subject, room, notes: "", archived: false });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New class</h2>
        <div className="form-grid">
          <label>Name</label>
          <input autoFocus placeholder="e.g. 7B-Science" value={name} onChange={(e) => setName(e.target.value)} />
          <label>Year</label>
          <input value={year} onChange={(e) => setYear(e.target.value)} />
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label>Room</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!safeName} onClick={() => void submit()}>
            Create class
          </button>
        </div>
      </div>
    </div>
  );
}
