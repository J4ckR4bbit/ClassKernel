import { useEffect, useState } from "react";
import { BathroomVisit } from "../lib/types";
import { formatDuration, visitSeconds } from "../lib/stats";

/**
 * A running bathroom-trip time (m:ss) that ticks by itself once a second, so
 * only this text redraws while a student is out, not the room plan around it.
 */
export default function Elapsed({ visit }: { visit: BathroomVisit }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (visit.end) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [visit.end]);
  return <>{formatDuration(visitSeconds(visit))}</>;
}
