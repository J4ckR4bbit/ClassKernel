import { create } from "zustand";
import {
  AlarmState,
  HISTORY_STEP_MS,
  LevelSample,
  MeterSettings,
  QUIET_ALARM,
  alarmStep,
  calibrationOffset,
  displayLevel,
  parseSettings,
  pushSample,
  timeWeighted,
  weightedLevel,
} from "./meter";

/**
 * The noise meter, kept outside any one screen so leaving the meter doesn't
 * stop it: the microphone and the level maths run here, the meter screen shows
 * them full size, and the small pop-up (NoiseMini) shows them everywhere else.
 * The microphone is open only between Start and Stop.
 */
interface NoiseStore {
  settings: MeterSettings;
  running: boolean;
  starting: boolean;
  error: string;
  /** The displayed level in dB(A); null before the first reading. */
  level: number | null;
  peak: number | null;
  alarm: AlarmState;
  /** The last few minutes, for the graph. */
  history: LevelSample[];
  devices: MediaDeviceInfo[];
  start(deviceId?: string): Promise<void>;
  stop(): void;
  update(patch: Partial<MeterSettings>): void;
  /** Peak, alarm count and time over the limit start again from now. */
  resetStats(): void;
  /** Set the calibration so the current level reads as a meter's reading; false if there is nothing to calibrate against. */
  calibrate(meterReading: number): boolean;
  refreshDevices(): Promise<void>;
}

const STORAGE_KEY = "classkernel.noiseMeter";
/** How often the numbers on screen refresh (the alarm runs every frame). */
const DISPLAY_MS = 150;

function loadSettings(): MeterSettings {
  try {
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}

function saveSettings(s: MeterSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Not fatal: the meter still works, it just forgets on restart.
  }
}

/** Why the microphone couldn't be opened, in words a teacher can act on. */
function micError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "ClassKernel isn't allowed to use the microphone. In Windows, open Settings → Privacy & security → Microphone and turn on “Microphone access” and “Let desktop apps access your microphone”, then press Start again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in (or choose another below) and press Start again.";
  }
  if (name === "NotReadableError") {
    return "The microphone is busy or switched off — another program may be using it.";
  }
  return `The microphone couldn't be opened${e instanceof Error ? `: ${e.message}` : ""}.`;
}

// The audio loop's working state lives outside React; only what's shown goes
// through the store, a few times a second.
let audio: { stream: MediaStream; ctx: AudioContext; frame: number } | null = null;
/** Relative (uncalibrated) level, for calibrating against. */
let relative: number | null = null;
let alarmNow: AlarmState = QUIET_ALARM;
let peakNow: number | null = null;
let historyNow: LevelSample[] = [];

export const useNoiseMeter = create<NoiseStore>((set, get) => ({
  settings: loadSettings(),
  running: false,
  starting: false,
  error: "",
  level: null,
  peak: null,
  alarm: QUIET_ALARM,
  history: [],
  devices: [],

  stop() {
    const a = audio;
    audio = null;
    if (!a) return;
    cancelAnimationFrame(a.frame);
    a.stream.getTracks().forEach((t) => t.stop());
    void a.ctx.close().catch(() => undefined);
    set({ running: false });
  },

  async start(deviceId = get().settings.deviceId) {
    get().stop();
    set({ error: "" });
    if (!navigator.mediaDevices?.getUserMedia) {
      set({ error: "This version of Windows doesn't let the app reach a microphone." });
      return;
    }
    set({ starting: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Raw input: these filters would flatten exactly what we measure.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0; // we apply our own time weighting
      ctx.createMediaStreamSource(stream).connect(analyser);
      const bins = new Float32Array(analyser.frequencyBinCount);

      relative = null;
      // Each Start begins a fresh graph.
      historyNow = [];
      set({ history: [] });
      let last = performance.now();
      let lastShown = 0;
      let lastSample = 0;
      let shownActive = alarmNow.active;
      const tick = (now: number) => {
        const dt = Math.min(0.5, (now - last) / 1000);
        last = now;
        analyser.getFloatFrequencyData(bins);
        relative = timeWeighted(relative, weightedLevel(bins, ctx.sampleRate, analyser.fftSize), dt);
        const { offset, limit } = get().settings;
        const shown = displayLevel(relative, offset);
        alarmNow = alarmStep(alarmNow, shown, limit, dt);
        if (peakNow === null || shown > peakNow) peakNow = shown;
        const patch: Partial<NoiseStore> = {};
        if (now - lastSample >= HISTORY_STEP_MS) {
          lastSample = now;
          historyNow = pushSample(historyNow, now, shown);
          patch.history = historyNow;
        }
        // Refresh the numbers a few times a second, but the alarm the moment it changes.
        if (now - lastShown >= DISPLAY_MS || alarmNow.active !== shownActive) {
          lastShown = now;
          shownActive = alarmNow.active;
          Object.assign(patch, { level: shown, peak: peakNow, alarm: alarmNow });
        }
        if (Object.keys(patch).length) set(patch);
        if (audio) audio.frame = requestAnimationFrame(tick);
      };
      audio = { stream, ctx, frame: requestAnimationFrame(tick) };
      set({ running: true });
      void get().refreshDevices(); // names only appear once permission is granted
    } catch (e) {
      set({ error: micError(e) });
    } finally {
      set({ starting: false });
    }
  },

  update(patch) {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },

  resetStats() {
    alarmNow = { ...QUIET_ALARM, active: alarmNow.active };
    peakNow = get().level;
    set({ alarm: alarmNow, peak: peakNow });
  },

  calibrate(meterReading) {
    if (!Number.isFinite(meterReading) || relative === null || !Number.isFinite(relative)) return false;
    get().update({ offset: calibrationOffset(relative, meterReading) });
    return true;
  },

  async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      set({ devices: all.filter((d) => d.kind === "audioinput") });
    } catch {
      set({ devices: [] });
    }
  },
}));
