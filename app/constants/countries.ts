export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  region: 'gulf' | 'levant' | 'maghreb' | 'europe' | 'americas' | 'asia';
  timezone: string; // Primary timezone for the country
}

// Region display names
export const REGION_LABELS: Record<CountryOption['region'], string> = {
  gulf: 'Gulf',
  levant: 'Levant & Egypt',
  maghreb: 'Maghreb',
  europe: 'Europe',
  americas: 'Americas',
  asia: 'Asia',
};

// Minimal set; expand as needed
export const COUNTRY_OPTIONS: CountryOption[] = [
  // Gulf
  { code: "QA", name: "Qatar", flag: "🇶🇦", region: "gulf", timezone: "Asia/Qatar" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦", region: "gulf", timezone: "Asia/Riyadh" },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", region: "gulf", timezone: "Asia/Dubai" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼", region: "gulf", timezone: "Asia/Kuwait" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭", region: "gulf", timezone: "Asia/Bahrain" },
  { code: "OM", name: "Oman", flag: "🇴🇲", region: "gulf", timezone: "Asia/Muscat" },
  // Levant & Egypt
  { code: "EG", name: "Egypt", flag: "🇪🇬", region: "levant", timezone: "Africa/Cairo" },
  // Europe
  { code: "TR", name: "Turkey", flag: "🇹🇷", region: "europe", timezone: "Europe/Istanbul" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", region: "europe", timezone: "Europe/London" },
  // Maghreb
  { code: "MA", name: "Morocco", flag: "🇲🇦", region: "maghreb", timezone: "Africa/Casablanca" },
  // Americas
  { code: "US", name: "United States", flag: "🇺🇸", region: "americas", timezone: "America/New_York" },
];

// Helper to get country by code
export function getCountryByCode(code: string): CountryOption | undefined {
  return COUNTRY_OPTIONS.find(c => c.code === code);
}

// Helper to get flag by country code
export function getFlagByCode(code: string): string {
  return getCountryByCode(code)?.flag ?? '🌍';
}
