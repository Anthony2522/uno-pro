// Tiny WebAudio synth — no audio files, no external services.
let ctx: AudioContext | null = null;
const KEY = "unopro.muted";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export type Sfx = "play" | "draw" | "turn" | "uno" | "win" | "error" | "join";

export function sfx(kind: Sfx) {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    return;
  }
  switch (kind) {
    case "play":
      tone(520, 0, 0.09, "triangle", 0.09);
      tone(780, 0.05, 0.1, "triangle", 0.06);
      break;
    case "draw":
      tone(300, 0, 0.12, "sine", 0.07);
      tone(240, 0.06, 0.12, "sine", 0.05);
      break;
    case "turn":
      tone(660, 0, 0.12, "sine", 0.08);
      tone(990, 0.1, 0.18, "sine", 0.07);
      break;
    case "uno":
      tone(880, 0, 0.12, "square", 0.05);
      tone(1175, 0.12, 0.2, "square", 0.05);
      break;
    case "win":
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, "triangle", 0.08));
      break;
    case "join":
      tone(740, 0, 0.1, "sine", 0.05);
      break;
    case "error":
      tone(180, 0, 0.18, "sawtooth", 0.04);
      break;
  }
}