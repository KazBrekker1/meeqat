// Astronomically-accurate moon phase from a real date — independent of which
// calendar (Hijri/Gregorian) is being displayed. 0 = new, 0.5 = full.

const SYNODIC = 29.530588853; // mean synodic month (days)
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14, 0); // a known new moon

export function moonPhase(date: Date): number {
  let p = ((date.getTime() - NEW_MOON_REF) / 86400000 / SYNODIC) % 1;
  if (p < 0) p += 1;
  return p;
}

export function moonIllumination(phase: number): number {
  return Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);
}

export function moonPhaseName(phase: number): string {
  const f = ((phase % 1) + 1) % 1;
  if (f < 0.03 || f > 0.97) return "New Moon";
  if (f < 0.22) return "Waxing Crescent";
  if (f < 0.28) return "First Quarter";
  if (f < 0.47) return "Waxing Gibbous";
  if (f < 0.53) return "Full Moon";
  if (f < 0.72) return "Waning Gibbous";
  if (f < 0.78) return "Last Quarter";
  return "Waning Crescent";
}
