export function createAthanController(isAthanActive: Ref<boolean>) {
  let audioContext: AudioContext | null = null;
  let athanIntervalId: NodeJS.Timeout | null = null;
  let autoDismissTimeoutId: NodeJS.Timeout | null = null;
  let masterGain: GainNode | null = null;

  function ensureAudioContext(): AudioContext {
    const Ctor: any =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API not supported");
    if (!audioContext) audioContext = new Ctor();
    if (audioContext!.state === "suspended") void audioContext!.resume();
    return audioContext!;
  }

  function playAthanPattern(ctx: AudioContext, targetGain: GainNode): number {
    const startAt = ctx.currentTime + 0.01;
    const notes = [523.25, 659.25, 783.99, 659.25, 523.25];
    const tone = 0.4;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt + i * tone);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, startAt + i * tone);
      g.gain.exponentialRampToValueAtTime(0.25, startAt + i * tone + 0.05);
      g.gain.exponentialRampToValueAtTime(
        0.01,
        startAt + (i + 1) * tone - 0.05
      );
      osc.connect(g);
      g.connect(targetGain);
      osc.start(startAt + i * tone);
      osc.stop(startAt + (i + 1) * tone);
    });
    return notes.length * tone;
  }

  function startAthan(): void {
    console.log("Athan notification is currently disabled");
    // try {
    //   if (isAthanActive.value) return;
    //   const ctx = ensureAudioContext();
    //   masterGain = ctx.createGain();
    //   masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    //   masterGain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.2);
    //   masterGain.connect(ctx.destination);
    //   const loopSeconds = playAthanPattern(ctx, masterGain);
    //   athanIntervalId = setInterval(() => {
    //     if (!masterGain) return;
    //     playAthanPattern(ctx, masterGain);
    //   }, Math.max(250, Math.floor(loopSeconds * 1000)));
    //   isAthanActive.value = true;
    //   // Auto-dismiss after 1 minute
    //   autoDismissTimeoutId = setTimeout(() => {
    //     dismissAthan();
    //   }, 60_000);
    // } catch {}
  }

  function dismissAthan(): void {
    const ctx = audioContext;
    if (athanIntervalId != null) {
      clearInterval(athanIntervalId);
      athanIntervalId = null;
    }
    if (autoDismissTimeoutId != null) {
      clearTimeout(autoDismissTimeoutId);
      autoDismissTimeoutId = null;
    }
    if (ctx && masterGain) {
      try {
        const t = ctx.currentTime;
        masterGain.gain.setTargetAtTime(0.0001, t, 0.05);
        setTimeout(() => {
          try {
            masterGain && masterGain.disconnect();
          } catch {}
          masterGain = null;
        }, 300);
      } catch {}
    }
    isAthanActive.value = false;
  }

  function testPlayAthan(): void {
    startAthan();
  }

  return { startAthan, dismissAthan, testPlayAthan };
}
