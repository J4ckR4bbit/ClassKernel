// A short beep pattern for the test timer (2 at a phase change, 3 at the end),
// made with Web Audio so there is no sound file to ship. Lives outside the
// timer screen because the timer now keeps running on any screen.

let audioCtx: AudioContext | null = null;
export function chime(pattern: number) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    for (let i = 0; i < pattern; i++) {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.21);
    }
  } catch {
    /* audio unavailable — silently ignore */
  }
}
