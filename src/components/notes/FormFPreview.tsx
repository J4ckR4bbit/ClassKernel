import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Note } from "../../lib/notes";
import { dateInZone } from "../../lib/time";
import { longDate } from "../../lib/format";
import { FORM_F_DETAILS, FORM_F_HELPFUL, FORM_F_PERCENT, FORM_F_QUESTIONS, YES_NO } from "../../lib/formF";
import Icon from "../Icon";

/**
 * A Form F laid out as the IEB's form, on two A4 pages, to print and sign:
 * the details table and the accommodations box, then the checklist ticked
 * Yes / No / N/A, the percentage, and the signature and date lines.
 */
export default function FormFPreview({ note, onClose }: { note: Note; onClose: () => void }) {
  // While it's open, printing prints only the form (see the print styles).
  useEffect(() => {
    document.body.classList.add("formf-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("formf-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const f = note.sections;

  return createPortal(
    <div className="formf-portal" role="dialog" aria-modal="true" aria-label="Form F to print">
      <div className="formf-bar">
        <b>Form F</b>
        <span className="muted">{f.name}</span>
        <span className="spacer" />
        <button className="primary" onClick={() => window.print()}>
          <Icon name="print" size={20} /> Print
        </button>
        <button onClick={onClose}>
          <Icon name="close" size={20} /> Close
        </button>
      </div>
      <div className="formf-pages">
        <section className="formf-page">
          <p className="formf-running">POLICY AND PROCEDURES: ACCOMMODATIONS AND EXEMPTIONS</p>
          <h1>FORM F</h1>
          <h2>TEACHER COMMENT FORM FOR ACCOMMODATION(S)/EXEMPTION APPLICATION</h2>
          <table className="formf-table">
            <tbody>
              {FORM_F_DETAILS.map((d) => (
                <tr key={d.key}>
                  <th>{d.label}</th>
                  <td>{f[d.key] ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="formf-question">{FORM_F_HELPFUL.label}</p>
          <div className="formf-box">{f[FORM_F_HELPFUL.key] ?? ""}</div>
        </section>
        <section className="formf-page">
          <p className="formf-running">POLICY AND PROCEDURES: ACCOMMODATIONS AND EXEMPTIONS</p>
          <p className="formf-question">Please complete the table with a ✓</p>
          <table className="formf-table formf-ticks">
            <thead>
              <tr>
                <th />
                {YES_NO.map((a) => (
                  <th key={a}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FORM_F_QUESTIONS.map((q) => (
                <tr key={q.key}>
                  <th>{q.text}</th>
                  {YES_NO.map((a) => (
                    <td key={a}>{f[q.key] === a ? "✓" : ""}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>{FORM_F_PERCENT.label}</th>
                <td colSpan={3} className="formf-percent">
                  {f[FORM_F_PERCENT.key] ?? ""}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="formf-sign">
            <span>
              <b>Signature:</b> <i />
            </span>
            <span>
              <b>Date:</b> <i>{longDate(dateInZone(note.timestamp))}</i>
            </span>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}
