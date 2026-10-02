import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDailyForecast,
  getTodayWeather,
  isStrongOutdoorWeather,
  PILOT_COORDINATES,
  roundCoordinate,
  weatherCoordinates,
} from "@/lib/nudges/weather";

const BODY = {
  daily: {
    time: ["2026-10-01", "2026-10-02", "2026-10-03"],
    precipitation_probability_max: [90, 10, 40],
    temperature_2m_max: [9, 17, 14],
  },
};

const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe("coordinates", () => {
  it("rounds to about a kilometre so neighbours share one forecast", () => {
    expect(roundCoordinate(51.65309)).toBe(51.65);
    expect(roundCoordinate(-0.2002261)).toBe(-0.2);
    expect(roundCoordinate(51.6549)).toBe(51.65);
  });

  it("uses the member's own location, and the pilot area only when they have none", () => {
    expect(weatherCoordinates({ location_lat: 51.65, location_lng: -0.2 })).toEqual({ latitude: 51.65, longitude: -0.2 });
    expect(weatherCoordinates({ location_lat: null, location_lng: null })).toBe(PILOT_COORDINATES);
    expect(weatherCoordinates(null)).toBe(PILOT_COORDINATES);
  });
});

describe("getDailyForecast", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the same cached URL for two members in one neighbourhood", async () => {
    fetchMock.mockResolvedValue(okResponse(BODY));
    await getDailyForecast(51.65309, -0.2002261);
    await getDailyForecast(51.65402, -0.19951);
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
    expect(fetchMock.mock.calls[0][0]).toContain("latitude=51.65&longitude=-0.2");
  });

  it("opts into the framework's half-hour cache", async () => {
    fetchMock.mockResolvedValue(okResponse(BODY));
    await getDailyForecast(51.65, -0.2);
    expect(fetchMock.mock.calls[0][1]).toEqual({ next: { revalidate: 1800 } });
  });

  it("returns null instead of throwing when the service is down", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(getDailyForecast(51.65, -0.2)).resolves.toBeNull();
    fetchMock.mockResolvedValue({ ok: false } as Response);
    await expect(getDailyForecast(51.65, -0.2)).resolves.toBeNull();
  });
});

describe("getTodayWeather", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("picks today by date, not by position (a cached response can start on yesterday)", async () => {
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    fetchMock.mockResolvedValue(okResponse(BODY));
    await expect(getTodayWeather(51.65, -0.2)).resolves.toEqual({ precipitationProbabilityMax: 10, temperatureMax: 17 });
  });

  it("falls back to the first day if today isn't in the response", async () => {
    vi.setSystemTime(new Date("2026-12-25T12:00:00Z"));
    fetchMock.mockResolvedValue(okResponse(BODY));
    await expect(getTodayWeather(51.65, -0.2)).resolves.toEqual({ precipitationProbabilityMax: 90, temperatureMax: 9 });
  });

  it("is null when there is no forecast", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    await expect(getTodayWeather(51.65, -0.2)).resolves.toBeNull();
  });
});

describe("isStrongOutdoorWeather", () => {
  it("wants a dry, mild day", () => {
    expect(isStrongOutdoorWeather({ precipitationProbabilityMax: 10, temperatureMax: 18 })).toBe(true);
    expect(isStrongOutdoorWeather({ precipitationProbabilityMax: 60, temperatureMax: 18 })).toBe(false);
    expect(isStrongOutdoorWeather({ precipitationProbabilityMax: 10, temperatureMax: 3 })).toBe(false);
    expect(isStrongOutdoorWeather(null)).toBe(false);
  });
});
