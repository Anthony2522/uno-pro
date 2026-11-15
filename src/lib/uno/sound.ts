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

export type Sfx = "play" | "draw" | "turn" | "uno" | "win" | "error" | "join" | "reverse" | "skip" | "draw2" | "draw4" | "draw5" | "wild" | "cut" | "penalty" | "catch" | "bomb" | "negation" | "machinegun" | "powerless";

export function sfx(kind: Sfx) {
  if (typeof window === "undefined" || isMuted()) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    return;
  }
  switch (kind) {

    case "reverse":
      tone(310,0,.16,"sawtooth",.042);
      tone(430,.11,.16,"triangle",.065);
      tone(610,.23,.18,"triangle",.058);
      tone(840,.32,.21,"sine",.055);
      break;
    case "skip":
      tone(820,0,.09,"square",.05);
      tone(220,.1,.25,"sawtooth",.08);
      break;
    case "draw2":
      tone(480,0,.16,"triangle",.09);
      tone(360,.13,.22,"triangle",.07);
      tone(250,.27,.18,"sine",.07);
      break;
    case "draw4":
      [570,460,350,220].forEach((f,i)=>tone(f,i*.1,.21,"sawtooth",.045));
      break;
    case "draw5":
      [730,570,420,300,180].forEach((f,i)=>tone(f,i*.085,.19,i%2?"triangle":"sawtooth",.06));
      break;
    case "wild":
      [520,660,800,960].forEach((f,i)=>tone(f,i*.08,.22,"sine",.07));
      break;
    case "cut":
      tone(940,0,.08,"square",.055);
      tone(640,.08,.11,"triangle",.09);
      tone(1180,.18,.19,"sine",.075);
      break;
    case "catch":
      tone(730,0,.08,"square",.06);
      tone(480,.09,.15,"triangle",.06);
      tone(980,.22,.16,"sine",.06);
      break;
    case "negation":
      [780,510,960].forEach((f,i)=>tone(f,i*.08,.23,"triangle",.065));break;
    case "machinegun":
      [450,530,480,610].forEach((f,i)=>tone(f,i*.07,.14,"square",.04));break;
    case "powerless":
      [640,390,230].forEach((f,i)=>tone(f,i*.14,.24,"triangle",.06));break;
    case "bomb":
      tone(190,0,.23,"sawtooth",.095);
      tone(85,.09,.45,"sawtooth",.075);
      [700,560,430].forEach((f,i)=>tone(f,.23+i*.085,.22,"triangle",.04));
      break;
    case "penalty":
      [460,340,270,190].forEach((f,i)=>tone(f,i*.09,.19,"triangle",.065));
      break;
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
      tone(660,0,.1,"square",.06);
      tone(880,.08,.12,"square",.065);
      tone(1175,.2,.18,"triangle",.09);
      tone(1568,.32,.24,"sine",.06);
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