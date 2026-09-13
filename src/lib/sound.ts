let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(at: number, freq: number, dur: number, gain: number): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ac.currentTime + at;
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Short, quiet two-note "done" ping. */
export function playTurnDone(): void {
  tone(0, 740, 0.12, 0.05);
  tone(0.12, 988, 0.16, 0.05);
}

/** Attention two-tone for permission/question prompts. */
export function playNeedsYou(): void {
  tone(0, 622, 0.12, 0.06);
  tone(0.14, 622, 0.12, 0.06);
  tone(0.28, 831, 0.2, 0.06);
}

/** Errors get a low single buzz-like note. */
export function playError(): void {
  tone(0, 220, 0.22, 0.06);
}
