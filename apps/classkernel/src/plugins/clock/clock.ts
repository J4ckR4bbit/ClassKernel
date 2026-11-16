// The clock plugin's sums, kept out of the component so they can be tested in
// Node: what the time is in a given zone, where the hands point, and how the
// digital face writes it. Nothing here reads the clock; the time comes in.

export interface ClockParts {
  hours: number; // 0–23
  minutes: number;
  seconds: number;
  /** e.g. "Wednesday 7 October 2026" */
  dateLine: string;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dateFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
    dateFormatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock time and date in `timeZone` at the instant `date`. */
export function clockParts(date: Date, timeZone: string): ClockParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    hours: get("hour") % 24,
    minutes: get("minute"),
    seconds: get("second"),
    // en-GB writes "Wednesday 7 October 2026" (some runtimes add a comma).
    dateLine: dateFormatter(timeZone).format(date).replace(",", ""),
  };
}

export interface HandAngles {
  hour: number;
  minute: number;
  second: number;
}

/**
 * Degrees clockwise from 12 for each hand. The hour and minute hands creep
 * between marks, as on a real clock face; the second hand jumps a mark a
 * second unless `sweepMs` (the milliseconds into the current second) is
 * given for a smooth sweep.
 */
export function handAngles(p: Pick<ClockParts, "hours" | "minutes" | "seconds">, sweepMs = 0): HandAngles {
  const s = p.seconds + sweepMs / 1000;
  return {
    hour: (p.hours % 12) * 30 + p.minutes * 0.5 + s / 120,
    minute: p.minutes * 6 + s * 0.1,
    second: s * 6,
  };
}

/**
 * The digital face's text, e.g. "14:05" or "02:05:09", ready for the flip
 * cards, and the AM/PM marker when the 12-hour clock is on ("" otherwise).
 * Hours keep two digits either way so the cards don't jump about.
 */
export function digitalText(
  p: Pick<ClockParts, "hours" | "minutes" | "seconds">,
  opts: { hour12: boolean; showSeconds: boolean },
): { text: string; suffix: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  let h = p.hours;
  let suffix = "";
  if (opts.hour12) {
    suffix = h < 12 ? "AM" : "PM";
    h = h % 12 === 0 ? 12 : h % 12;
  }
  const text = `${pad(h)}:${pad(p.minutes)}${opts.showSeconds ? `:${pad(p.seconds)}` : ""}`;
  return { text, suffix };
}

/** "Africa/Johannesburg" → "Johannesburg"; "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split("/").pop() ?? timeZone;
  return last.replace(/_/g, " ");
}

/** The zone's offset from UTC at `date`, e.g. "GMT+2" or "GMT+5:30" ("GMT" for UTC itself). */
export function offsetLabel(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
