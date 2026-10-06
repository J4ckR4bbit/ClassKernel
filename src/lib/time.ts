// The teacher's time zone. Timestamps are always stored as UTC ISO strings
// (portable, sortable, unambiguous); everything shown or exported — dates,
// clock times, "today" — is converted to this zone. "" means the device's
// own zone, which is what a correctly set-up machine wants.

let zone: string | undefined;
let formatter: Intl.DateTimeFormat | null = null;
// Per-timestamp cache: the same events are re-dated on every render.
let cache = new Map<string, string>();
const CACHE_LIMIT = 20000;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Use this IANA zone (e.g. "Africa/Johannesburg") from now on; "" = the device's zone. */
export function setTimeZone(tz: string): void {
  const next = isValidTimeZone(tz) ? tz : undefined;
  if (next === zone && formatter) return;
  zone = next;
  formatter = null;
  cache = new Map();
}

/** The zone currently in effect, resolved to a name. */
export function currentTimeZone(): string {
  return zone ?? deviceTimeZone();
}

export function deviceTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Every zone the runtime knows, for the Settings picker. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  const all = new Set([...zones, "UTC", deviceTimeZone()]);
  if (zone) all.add(zone);
  return [...all].sort();
}

function fmt(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return formatter;
}

/** "YYYY-MM-DD HH:MM:SS" in the chosen zone; "" for an unreadable timestamp. */
function zoned(at: string | Date): string {
  const key = typeof at === "string" ? at : "";
  if (key) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
  }
  const d = typeof at === "string" ? new Date(at) : at;
  let out = "";
  if (!Number.isNaN(d.getTime())) {
    const p: Record<string, string> = {};
    for (const part of fmt().formatToParts(d)) p[part.type] = part.value;
    out = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  }
  if (key) {
    if (cache.size >= CACHE_LIMIT) cache = new Map();
    cache.set(key, out);
  }
  return out;
}

/** Calendar date (YYYY-MM-DD) of a timestamp in the chosen zone. */
export function dateInZone(at: string | Date): string {
  return zoned(at).slice(0, 10);
}

/** Clock time (HH:MM) of a timestamp in the chosen zone. */
export function timeInZone(at: string | Date): string {
  return zoned(at).slice(11, 16);
}

/** "YYYY-MM-DD HH:MM" in the chosen zone. */
export function dateTimeInZone(at: string | Date): string {
  return zoned(at).slice(0, 16);
}

/** Date and time parts of "now" in the chosen zone, for stamps like backup folder names. */
export function nowInZone(): { date: string; hh: string; mm: string; ss: string } {
  const z = zoned(new Date());
  return { date: z.slice(0, 10), hh: z.slice(11, 13), mm: z.slice(14, 16), ss: z.slice(17, 19) };
}
