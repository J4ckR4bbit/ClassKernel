// Content hashing for sync change detection.
//
// In the packaged app the hash comes from Rust (real MD5), because that is what
// Drive returns as md5Checksum and the sync engine compares the two directly.
// The in-memory FS used by tests and demo mode has no Rust to call, so it uses
// the pure-TS hash below. That is fine because in those worlds the fake Drive
// hashes with the same function — the engine only ever tests hashes for
// equality, never interprets them.

/** FNV-1a (64-bit, split into two 32-bit halves to stay in safe integer range). */
export function hashText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 11)), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
