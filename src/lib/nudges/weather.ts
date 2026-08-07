// Open-Meteo: free, keyless forecast API — no API key exists anywhere in this
// project yet, and none is needed here.
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const MIN_PLEASANT_TEMP_C = 10;
const MAX_PLEASANT_TEMP_C = 27;
const MAX_PRECIP_PROBABILITY = 20;

// This MVP pilot serves a single area (Richmond upon Thames) — every activity
// in the catalog is already scoped there (see the Discovery Agent and seed
// data), and member-entered location_text is free text too unreliable to
// geocode (e.g. "Richmond, London" resolves to zero results via Open-Meteo's
// geocoder, and at least one real profile has literally "Somewhere else").
// Checking one fixed pilot coordinate is simpler and no less accurate today.
export const PILOT_COORDINATES = { latitude: 51.461, longitude: -0.303 };

export type TodayWeather = { precipitationProbabilityMax: number; temperatureMax: number } | null;

export async function getTodayWeather(latitude: number, longitude: number): Promise<TodayWeather> {
  const url = `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&daily=precipitation_probability_max,temperature_2m_max&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    daily?: { precipitation_probability_max?: number[]; temperature_2m_max?: number[] };
  };
  const precip = data.daily?.precipitation_probability_max?.[0];
  const tempMax = data.daily?.temperature_2m_max?.[0];
  if (precip === undefined || tempMax === undefined) return null;

  return { precipitationProbabilityMax: precip, temperatureMax: tempMax };
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
