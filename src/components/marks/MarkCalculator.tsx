import { useEffect, useRef, useState } from "react";
import { calculate } from "../../lib/calc";
import { fmtDecimal } from "../../lib/format";
import Icon from "../Icon";

const SHOWN_KEY = "classkernel.markCalculator";

/** Whether the calculator is showing on the marking screens; remembered on this computer, hidden at first. */
export function useCalculatorShown(): [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(SHOWN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setShown(next);
    try {
      localStorage.setItem(SHOWN_KEY, next ? "1" : "0");
    } catch {
      // Shown for now; hidden again next time.
    }
  };
  return [shown, set];
}

/** The toolbar's Calculator button, pressed while the calculator shows. */
export function CalculatorButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      className={`small ${shown ? "tonal" : ""}`}
      aria-pressed={shown}
      // Keeps the mark box focused, so the answer can go straight into it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      title={shown ? "Hide the calculator" : "Show a calculator beside the marks"}
    >
      <Icon name="calculate" size={18} /> Calculator
    </button>
  );
}

// The boxes an answer can go into: quick marking's and the question grid's.
const MARK_BOX = "input.mark-input, input.grid-input";
const isMarkBox = (el: EventTarget | Element | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.matches(MARK_BOX);

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ",", "⌫", "="];
const OPERATOR_KEYS = new Set(["÷", "×", "−", "+", "(", ")"]);

/**
 * A small calculator beside the marks, for adding up a paper or working out a
 * mark. Click its keys or type a sum; "Put in mark" sends the answer to the
 * mark box last typed in, as if it had been typed there.
 */
export default function MarkCalculator({ onClose }: { onClose: () => void }) {
  const [sum, setSum] = useState("");
  const [box, setBox] = useState<HTMLInputElement | null>(null);
  const display = useRef<HTMLInputElement>(null);
  const answer = calculate(sum);

  useEffect(() => {
    // Opened with a mark box focused (the screen's first, or the one being typed in).
    if (isMarkBox(document.activeElement)) setBox(document.activeElement);
    const onFocus = (e: FocusEvent) => {
      if (isMarkBox(e.target)) setBox(e.target);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  const target = box?.isConnected ? box.getAttribute("aria-label") : null;

  const equals = () => {
    if (answer !== null) setSum(fmtDecimal(answer, 6));
  };

  const press = (key: string) => {
    if (key === "C") setSum("");
    else if (key === "⌫") setSum((s) => s.slice(0, -1));
    else if (key === "=") equals();
    else setSum((s) => s + key);
    display.current?.focus();
  };

  const put = () => {
    if (answer === null || !box?.isConnected) return;
    // Through the box's own handler, as typing would: it saves the mark (and
    // in the grid, caps it at the question's marks).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(box, fmtDecimal(answer));
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
    setSum("");
  };

  return (
    <aside className="panel mark-calc" aria-label="Calculator">
      <div className="mark-calc-head">
        <h3>Calculator</h3>
        <button className="icon-only small" onClick={onClose} title="Hide the calculator" aria-label="Hide the calculator">
          <Icon name="close" size={18} />
        </button>
      </div>
      <input
        ref={display}
        className="calc-display"
        aria-label="Sum"
        placeholder="3+2+1,5"
        autoComplete="off"
        spellCheck={false}
        value={sum}
        onChange={(e) => setSum(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            equals();
          } else if (e.key === "Escape") {
            setSum("");
          }
        }}
      />
      <div className="calc-answer" aria-live="polite">
        {answer !== null ? `= ${fmtDecimal(answer, 4)}` : ""}
      </div>
      <div className="calc-keys">
        {KEYS.map((key) => (
          <button
            key={key}
            className={key === "=" ? "primary" : OPERATOR_KEYS.has(key) ? "tonal" : undefined}
            aria-label={key === "⌫" ? "Delete the last character" : key === "C" ? "Clear" : undefined}
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
      </div>
      <button className="primary" disabled={answer === null || !target} onClick={put}>
        <Icon name="check" size={18} /> Put in mark
      </button>
      <div className="calc-target muted">{target ? `Goes into: ${target}` : "Click a mark box first"}</div>
    </aside>
  );
}
