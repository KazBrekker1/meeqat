export interface PrayerItem {
  key: string;
  label: string;
  time: string;
  isPast?: boolean;
  isNext?: boolean;
}

export interface CelestialData {
  city: string;
  country: string;
  time: string;
  hijri: string;
  gregorian: string;
  next: { label: string; time: string; countdown: string };
  since: { label: string; ago: string };
  progress: number;
  moonPhase: number;
  moonPhaseName: string;
  moonIllum: number;
  lunarDay: number;
  lunarTotal: number;
  prayers: PrayerItem[];
}
