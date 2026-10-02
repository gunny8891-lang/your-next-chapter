// Open-Meteo: free, keyless forecast API — no API key exists anywhere in this
// project yet, and none is needed here.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

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

/** Forecast for the next `days` days (dates are the location's local dates), or null if the service is unavailable. */
export async function getDailyForecast(latitude: number, longitude: number, days = 7): Promise<DayForecast[] | null> {
  const url = `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&daily=precipitation_probability_max,temperature_2m_max&timezone=auto&forecast_days=${days}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseForecast((await res.json()) as OpenMeteoDaily);
  } catch {
    return null;
  }
}

export async function getTodayWeather(latitude: number, longitude: number): Promise<TodayWeather> {
  const [today] = (await getDailyForecast(latitude, longitude, 1)) ?? [];
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
