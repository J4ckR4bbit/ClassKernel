import { useEffect, useState } from "react";
import "./flip-digits.css";

// Split-flap digits, shared by the test timer's countdown and the clock: the
// top half of a card folds down to reveal the next value. Styled in
// flip-digits.css beside it.

/** One split-flap card. */
export function FlipDigit({ d, color }: { d: string; color: string }) {
  const [prev, setPrev] = useState(d);
  const [flip, setFlip] = useState(0);

  useEffect(() => {
    if (d === prev) return;
    setFlip((f) => f + 1);
    const t = setTimeout(() => setPrev(d), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  return (
    <div className="flip-digit" style={{ ["--flip-color" as string]: color }}>
      <div className="fc top">
        <span>{d}</span>
      </div>
      <div className="fc bottom">
        <span>{prev}</span>
      </div>
      {flip > 0 && (
        <div key={flip} className="fc-anim">
          <div className="fc top flip-top">
            <span>{prev}</span>
          </div>
          <div className="fc bottom flip-bottom">
            <span>{d}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A row of flip cards for any clock text, e.g. "12:34" or "08:15:09": every
 * character is a card except ":", which becomes the colon between groups.
 */
export function FlipDisplay({ text, color, big }: { text: string; color: string; big?: boolean }) {
  return (
    <div className={`flip-clock ${big ? "big" : ""}`}>
      {text.split("").map((ch, i) =>
        ch === ":" ? (
          <div key={i} className="flip-colon">
            :
          </div>
        ) : (
          <FlipDigit key={i} d={ch} color={color} />
        ),
      )}
    </div>
  );
}
