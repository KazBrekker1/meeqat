export interface CityData {
  name: string;
  timezone: string;
}

// City data with timezones
export const COUNTRY_TO_CITIES_DATA: Record<string, CityData[]> = {
  QA: [
    { name: "Doha", timezone: "Asia/Qatar" },
    { name: "Al Rayyan", timezone: "Asia/Qatar" },
    { name: "Al Wakrah", timezone: "Asia/Qatar" },
    { name: "Umm Salal", timezone: "Asia/Qatar" },
  ],
  SA: [
    { name: "Riyadh", timezone: "Asia/Riyadh" },
    { name: "Jeddah", timezone: "Asia/Riyadh" },
    { name: "Makkah", timezone: "Asia/Riyadh" },
    { name: "Madinah", timezone: "Asia/Riyadh" },
    { name: "Dammam", timezone: "Asia/Riyadh" },
    { name: "Khobar", timezone: "Asia/Riyadh" },
  ],
  AE: [
    { name: "Dubai", timezone: "Asia/Dubai" },
    { name: "Abu Dhabi", timezone: "Asia/Dubai" },
    { name: "Sharjah", timezone: "Asia/Dubai" },
    { name: "Ajman", timezone: "Asia/Dubai" },
  ],
  KW: [
    { name: "Kuwait City", timezone: "Asia/Kuwait" },
    { name: "Al Ahmadi", timezone: "Asia/Kuwait" },
    { name: "Hawalli", timezone: "Asia/Kuwait" },
  ],
  BH: [
    { name: "Manama", timezone: "Asia/Bahrain" },
    { name: "Riffa", timezone: "Asia/Bahrain" },
    { name: "Muharraq", timezone: "Asia/Bahrain" },
  ],
  OM: [
    { name: "Muscat", timezone: "Asia/Muscat" },
    { name: "Salalah", timezone: "Asia/Muscat" },
    { name: "Sohar", timezone: "Asia/Muscat" },
  ],
  EG: [
    { name: "Cairo", timezone: "Africa/Cairo" },
    { name: "Alexandria", timezone: "Africa/Cairo" },
    { name: "Giza", timezone: "Africa/Cairo" },
  ],
  TR: [
    { name: "Istanbul", timezone: "Europe/Istanbul" },
    { name: "Ankara", timezone: "Europe/Istanbul" },
    { name: "Izmir", timezone: "Europe/Istanbul" },
  ],
  MA: [
    { name: "Rabat", timezone: "Africa/Casablanca" },
    { name: "Casablanca", timezone: "Africa/Casablanca" },
    { name: "Marrakesh", timezone: "Africa/Casablanca" },
  ],
  US: [
    { name: "New York", timezone: "America/New_York" },
    { name: "Los Angeles", timezone: "America/Los_Angeles" },
    { name: "Chicago", timezone: "America/Chicago" },
    { name: "Houston", timezone: "America/Chicago" },
    { name: "Dallas", timezone: "America/Chicago" },
  ],
  GB: [
    { name: "London", timezone: "Europe/London" },
    { name: "Birmingham", timezone: "Europe/London" },
    { name: "Manchester", timezone: "Europe/London" },
    { name: "Leeds", timezone: "Europe/London" },
  ],
};

// Legacy format for backward compatibility
export const COUNTRY_TO_CITIES: Record<string, string[]> = Object.fromEntries(
  Object.entries(COUNTRY_TO_CITIES_DATA).map(([code, cities]) => [
    code,
    cities.map(c => c.name),
  ])
);

// Helper to get city timezone
export function getCityTimezone(countryCode: string, cityName: string): string | undefined {
  const cities = COUNTRY_TO_CITIES_DATA[countryCode];
  if (!cities) return undefined;
  const city = cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  return city?.timezone;
}
