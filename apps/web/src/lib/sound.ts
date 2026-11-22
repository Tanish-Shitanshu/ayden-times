/**
 * Small feedback sounds. Everything is synthesised with WebAudio so it works with no asset.
 * If a recorded sound exists (for example a Lyria clip saved as /sounds/complete.mp3) it is used instead.
 * Sound is on by default and can be switched off; the choice is remembered on this device.
 */
export type SoundName = "complete" | "beat" | "pass";

const KEY = "ayden_sound";
let ctx: AudioContext | null = null;
const fileOk: Partial<Record<SoundName, boolean>> = {};

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* blocked */ }
  window.dispatchEvent(new Event("ayden-sound"));
}

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** One soft bell-like note: a sine with a quiet octave partial and a quick decay. */
function note(c: AudioContext, freq: number, at: number, dur: number, gain: number) {
  for (const [mult, g] of [[1, gain], [2, gain * 0.28]] as const) {
    const o = c.createOscillator();
    const v = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(g, at + 0.012);
    v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(v).connect(c.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

const SYNTH: Record<SoundName, (c: AudioContext, t: number) => void> = {
  /** A bright rising arpeggio with a sparkle on top, for finishing a mission. */
  complete: (c, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, f, t + i * 0.09, 0.5, 0.16));
    note(c, 1568, t + 0.42, 0.7, 0.1);
    note(c, 2093, t + 0.5, 0.8, 0.06);
  },
  /** Two quick notes for moving to the next beat. */
  beat: (c, t) => {
    note(c, 659.25, t, 0.22, 0.12);
    note(c, 880, t + 0.09, 0.3, 0.12);
  },
  /** A single happy ping when the checks pass. */
  pass: (c, t) => {
    note(c, 784, t, 0.2, 0.12);
    note(c, 1174.7, t + 0.08, 0.4, 0.12);
  },
};

export function playSound(name: SoundName) {
  if (!soundEnabled()) return;
  if (typeof window === "undefined") return;
  const synth = () => { const c = audio(); if (c) SYNTH[name](c, c.currentTime + 0.02); };
  if (fileOk[name] === false) { synth(); return; }
  try {
    const a = new Audio(`/sounds/${name}.mp3`);
    a.volume = 0.8;
    a.addEventListener("error", () => { fileOk[name] = false; synth(); }, { once: true });
    a.addEventListener("loadedmetadata", () => { fileOk[name] = true; }, { once: true });
    void a.play().catch(() => { if (fileOk[name] !== true) { fileOk[name] = false; synth(); } });
  } catch { synth(); }
}
