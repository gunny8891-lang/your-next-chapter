import { londonToday } from "@/lib/opportunities/schedule";

// Open-Meteo: free, keyless forecast API — no API key exists anywhere in this
// project yet, and none is needed here.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// A forecast changes slowly, and Today, Surprise Me and the nudge job all ask
// for it. Caching it for half an hour (per location, below) means a member
// opening Today twice, or five members in one town, cost one request.
const FORECAST_CACHE_SECONDS = 30 * 60;

const MIN_PLEASANT_TEMP_C = 10;
const MAX_PLEASANT_TEMP_C = 27;
const MAX_PRECIP_PROBABILITY = 20;

// Only a fallback now: members' own coordinates are geocoded when they set their
// location (see account/onboarding actions), so callers should pass those and
// use this just for a profile that has none yet.
export const PILOT_COORDINATES = { latitude: 51.461, longitude: -0.303 };

export type TodayWeather = { precipitationProbabilityMax: number; temperatureMax: number } | null;

export type DayForecast = { date: string; precipitationProbabilityMax: number; temperatureMax: number };

type OpenMeteoDaily = {
  daily?: { time?: string[]; precipitation_probability_max?: (number | null)[]; temperature_2m_max?: (number | null)[] };
};

/** Pure: turns an Open-Meteo daily response into per-date forecasts, skipping any day with missing data. */
export function parseForecast(data: OpenMeteoDaily): DayForecast[] {
  const { time = [], precipitation_probability_max: precip = [], temperature_2m_max: temp = [] } = data.daily ?? {};
  const days: DayForecast[] = [];
  time.forEach((date, i) => {
    const rain = precip[i];
    const max = temp[i];
    if (rain == null || max == null) return;
    days.push({ date, precipitationProbabilityMax: rain, temperatureMax: max });
  });
  return days;
}

/**
 * Rounds a coordinate to 2 decimal places (~1 km). A forecast doesn't differ
 * across a street, and sharing one URL per neighbourhood is what lets the cache
 * serve neighbours from a single request.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The coordinates to use for a member's weather: their own when known, the pilot
 * area only for a profile with no resolved location yet.
 */
export function weatherCoordinates(profile: { location_lat: number | null; location_lng: number | null } | null | undefined): {
  latitude: number;
  longitude: number;
} {
  if (profile?.location_lat != null && profile?.location_lng != null) {
    return { latitude: profile.location_lat, longitude: profile.location_lng };
  }
  return PILOT_COORDINATES;
}

/** Forecast for the next `days` days (dates are the location's local dates), or null if the service is unavailable. */
export async function getDailyForecast(latitude: number, longitude: number, days = 7): Promise<DayForecast[] | null> {
  const url = `${FORECAST_URL}?latitude=${roundCoordinate(latitude)}&longitude=${roundCoordinate(longitude)}&daily=precipitation_probability_max,temperature_2m_max&timezone=auto&forecast_days=${days}`;
  try {
    const res = await fetch(url, { next: { revalidate: FORECAST_CACHE_SECONDS } });
    if (!res.ok) return null;
    return parseForecast((await res.json()) as OpenMeteoDaily);
  } catch {
    return null;
  }
}

export async function getTodayWeather(latitude: number, longitude: number): Promise<TodayWeather> {
  // Same 7-day request as Surprise Me, so the two share one cached response. Pick
  // today by date: a response cached just before midnight starts on yesterday.
  const forecast = (await getDailyForecast(latitude, longitude, 7)) ?? [];
  const today = forecast.find((d) => d.date === londonToday()) ?? forecast[0];
  return today ? { precipitationProbabilityMax: today.precipitationProbabilityMax, temperatureMax: today.temperatureMax } : null;
}

/** Rain likely enough that an outdoor plan is a poor suggestion. */
export const WET_DAY_PRECIP_PROBABILITY = 60;
export function isWetDay(day: { precipitationProbabilityMax: number }): boolean {
  return day.precipitationProbabilityMax >= WET_DAY_PRECIP_PROBABILITY;
}

/** "Strong match" per the reviewed trigger spec: low rain chance, mild-to-warm temperature. */
export function isStrongOutdoorWeather(weather: TodayWeather): boolean {
  if (!weather) return false;
  return (
    weather.precipitationProbabilityMax <= MAX_PRECIP_PROBABILITY &&
    weather.temperatureMax >= MIN_PLEASANT_TEMP_C &&
    weather.temperatureMax <= MAX_PLEASANT_TEMP_C
  );
}
