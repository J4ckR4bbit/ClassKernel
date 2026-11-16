// The reseat PIN: a few digits the teacher sets in Settings so a second seat
// assignment in one lesson can't happen by accident (or by a student at the
// board). It is a deterrent, not security — only its hash is kept in
// settings.csv so it isn't readable at a glance.

export const PIN_HINT = "4–6 digits";

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** SHA-256 of the PIN as lowercase hex. */
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`classkernel-reseat:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinMatches(pin: string, hash: string): Promise<boolean> {
  return !!hash && (await hashPin(pin.trim())) === hash;
}
