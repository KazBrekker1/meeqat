const ICONS: Record<string, string> = {
  fajr: "lucide:sunrise",
  sunrise: "lucide:sun",
  dhuhr: "lucide:sun-medium",
  asr: "lucide:cloud-sun",
  maghrib: "lucide:sunset",
  isha: "lucide:moon-star",
};

export function iconFor(key: string): string {
  return ICONS[key] ?? "lucide:clock";
}
