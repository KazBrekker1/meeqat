// Astronomically-accurate moon phase from a real date — independent of which
// calendar (Hijri/Gregorian) is being displayed. 0 = new, 0.5 = full.
//
// One model for the whole app: this is the Meeus phase the rendered Moon and the
// "% illuminated" chip use (utils/moon/sphere.ts), so the calendar glyphs, the
// orbit and the chip can't disagree. The phase is geocentric — the same from
// every place — so no position is needed.
import { moonView } from "@/utils/moon/sphere";

export function moonPhase(date: Date): number {
  return moonView(date, 0, 0, { orientation: "north" }).phase;
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
