export interface CityData {
  name: string;
  timezone: string;
  lat: number;
  lng: number;
}

// City data with timezones and coordinates
export const COUNTRY_TO_CITIES_DATA: Record<string, CityData[]> = {
  QA: [
    { name: "Doha", timezone: "Asia/Qatar", lat: 25.2854, lng: 51.5310 },
    { name: "Al Rayyan", timezone: "Asia/Qatar", lat: 25.2919, lng: 51.4245 },
    { name: "Al Wakrah", timezone: "Asia/Qatar", lat: 25.1659, lng: 51.6039 },
    { name: "Umm Salal", timezone: "Asia/Qatar", lat: 25.4085, lng: 51.4042 },
  ],
  SA: [
    { name: "Riyadh", timezone: "Asia/Riyadh", lat: 24.7136, lng: 46.6753 },
    { name: "Jeddah", timezone: "Asia/Riyadh", lat: 21.4858, lng: 39.1925 },
    { name: "Makkah", timezone: "Asia/Riyadh", lat: 21.3891, lng: 39.8579 },
    { name: "Madinah", timezone: "Asia/Riyadh", lat: 24.5247, lng: 39.5692 },
    { name: "Dammam", timezone: "Asia/Riyadh", lat: 26.3927, lng: 49.9777 },
    { name: "Khobar", timezone: "Asia/Riyadh", lat: 26.2172, lng: 50.1971 },
  ],
  AE: [
    { name: "Dubai", timezone: "Asia/Dubai", lat: 25.2048, lng: 55.2708 },
    { name: "Abu Dhabi", timezone: "Asia/Dubai", lat: 24.4539, lng: 54.3773 },
    { name: "Sharjah", timezone: "Asia/Dubai", lat: 25.3463, lng: 55.4209 },
    { name: "Ajman", timezone: "Asia/Dubai", lat: 25.4052, lng: 55.5136 },
  ],
  KW: [
    { name: "Kuwait City", timezone: "Asia/Kuwait", lat: 29.3759, lng: 47.9774 },
    { name: "Al Ahmadi", timezone: "Asia/Kuwait", lat: 29.0769, lng: 48.0838 },
    { name: "Hawalli", timezone: "Asia/Kuwait", lat: 29.3328, lng: 48.0286 },
  ],
  BH: [
    { name: "Manama", timezone: "Asia/Bahrain", lat: 26.2285, lng: 50.5860 },
    { name: "Riffa", timezone: "Asia/Bahrain", lat: 26.1300, lng: 50.5550 },
    { name: "Muharraq", timezone: "Asia/Bahrain", lat: 26.2572, lng: 50.6119 },
  ],
  OM: [
    { name: "Muscat", timezone: "Asia/Muscat", lat: 23.5880, lng: 58.3829 },
    { name: "Salalah", timezone: "Asia/Muscat", lat: 17.0151, lng: 54.0924 },
    { name: "Sohar", timezone: "Asia/Muscat", lat: 24.3615, lng: 56.7346 },
  ],
  EG: [
    { name: "Cairo", timezone: "Africa/Cairo", lat: 30.0444, lng: 31.2357 },
    { name: "Alexandria", timezone: "Africa/Cairo", lat: 31.2001, lng: 29.9187 },
    { name: "Giza", timezone: "Africa/Cairo", lat: 30.0131, lng: 31.2089 },
  ],
  TR: [
    { name: "Istanbul", timezone: "Europe/Istanbul", lat: 41.0082, lng: 28.9784 },
    { name: "Ankara", timezone: "Europe/Istanbul", lat: 39.9334, lng: 32.8597 },
    { name: "Izmir", timezone: "Europe/Istanbul", lat: 38.4237, lng: 27.1428 },
  ],
  MA: [
    { name: "Rabat", timezone: "Africa/Casablanca", lat: 34.0209, lng: -6.8416 },
    { name: "Casablanca", timezone: "Africa/Casablanca", lat: 33.5731, lng: -7.5898 },
    { name: "Marrakesh", timezone: "Africa/Casablanca", lat: 31.6295, lng: -7.9811 },
  ],
  US: [
    { name: "New York", timezone: "America/New_York", lat: 40.7128, lng: -74.0060 },
    { name: "Los Angeles", timezone: "America/Los_Angeles", lat: 34.0522, lng: -118.2437 },
    { name: "Chicago", timezone: "America/Chicago", lat: 41.8781, lng: -87.6298 },
    { name: "Houston", timezone: "America/Chicago", lat: 29.7604, lng: -95.3698 },
    { name: "Dallas", timezone: "America/Chicago", lat: 32.7767, lng: -96.7970 },
  ],
  GB: [
    { name: "London", timezone: "Europe/London", lat: 51.5074, lng: -0.1278 },
    { name: "Birmingham", timezone: "Europe/London", lat: 52.4862, lng: -1.8904 },
    { name: "Manchester", timezone: "Europe/London", lat: 53.4808, lng: -2.2426 },
    { name: "Leeds", timezone: "Europe/London", lat: 53.8008, lng: -1.5491 },
  ],
};

// Helper to get city timezone
export function getCityTimezone(countryCode: string, cityName: string): string | undefined {
  const cities = COUNTRY_TO_CITIES_DATA[countryCode];
  if (!cities) return undefined;
  const city = cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  return city?.timezone;
}

// Helper to get city coordinates
export function getCityCoordinates(countryCode: string, cityName: string): { lat: number; lng: number } | undefined {
  const cities = COUNTRY_TO_CITIES_DATA[countryCode];
  if (!cities) return undefined;
  const city = cities.find(c => c.name.toLowerCase() === cityName.toLowerCase());
  return city ? { lat: city.lat, lng: city.lng } : undefined;
}
