import type Database from "better-sqlite3";
import { z } from "zod";

const CACHE_MS = 3 * 60 * 60 * 1000;
const geocodeSchema = z.object({
  results: z.array(z.object({ name: z.string(), latitude: z.number(), longitude: z.number(), admin1: z.string().optional(), country_code: z.string().optional() })).optional(),
});
const forecastSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});

export interface WeatherDay {
  date: string;
  code: number;
  label: string;
  high: number;
  low: number;
  precipitationChance: number | null;
}

export interface WeatherPayload {
  locationName: string;
  days: WeatherDay[];
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}

function cached(sqlite: Database.Database, zipCode: string) {
  return sqlite.prepare("SELECT payload_json AS payloadJson, fetched_at AS fetchedAt, expires_at AS expiresAt FROM weather_cache WHERE zip_code = ?").get(zipCode) as
    | { payloadJson: string; fetchedAt: number; expiresAt: number }
    | undefined;
}

export async function getHouseholdWeather(sqlite: Database.Database, options: { fetch?: typeof fetch; now?: number } = {}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const settings = sqlite.prepare("SELECT zip_code AS zipCode, timezone FROM household_settings WHERE id = 1").get() as { zipCode: string | null; timezone: string } | undefined;
  if (!settings?.zipCode) return { status: "unconfigured" as const };
  const existing = cached(sqlite, settings.zipCode);
  if (existing && existing.expiresAt > now) return { status: "ready" as const, stale: false, fetchedAt: existing.fetchedAt, ...JSON.parse(existing.payloadJson) as WeatherPayload };

  try {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.search = new URLSearchParams({ name: settings.zipCode, count: "1", language: "en", format: "json", countryCode: "US" }).toString();
    const geocodeResponse = await fetcher(geocodeUrl, { signal: AbortSignal.timeout(8000) });
    if (!geocodeResponse.ok) throw new Error("Geocoding provider unavailable");
    const geocode = geocodeSchema.parse(await geocodeResponse.json());
    const location = geocode.results?.[0];
    if (!location) return { status: "invalid_zip" as const };

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.search = new URLSearchParams({
      latitude: String(location.latitude), longitude: String(location.longitude),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      temperature_unit: "fahrenheit", timezone: settings.timezone, forecast_days: "5",
    }).toString();
    const forecastResponse = await fetcher(forecastUrl, { signal: AbortSignal.timeout(8000) });
    if (!forecastResponse.ok) throw new Error("Forecast provider unavailable");
    const forecast = forecastSchema.parse(await forecastResponse.json());
    const payload: WeatherPayload = {
      locationName: [location.name, location.admin1].filter(Boolean).join(", "),
      days: forecast.daily.time.slice(0, 5).map((date, index) => ({
        date,
        code: forecast.daily.weather_code[index],
        label: weatherLabel(forecast.daily.weather_code[index]),
        high: Math.round(forecast.daily.temperature_2m_max[index]),
        low: Math.round(forecast.daily.temperature_2m_min[index]),
        precipitationChance: forecast.daily.precipitation_probability_max[index] == null ? null : Math.round(forecast.daily.precipitation_probability_max[index]!),
      })),
    };
    sqlite.prepare(`INSERT INTO weather_cache (zip_code, provider, payload_json, fetched_at, expires_at) VALUES (?, 'open-meteo', ?, ?, ?)
      ON CONFLICT(zip_code) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`)
      .run(settings.zipCode, JSON.stringify(payload), now, now + CACHE_MS);
    return { status: "ready" as const, stale: false, fetchedAt: now, ...payload };
  } catch {
    if (existing) return { status: "ready" as const, stale: true, fetchedAt: existing.fetchedAt, ...JSON.parse(existing.payloadJson) as WeatherPayload };
    return { status: "unavailable" as const };
  }
}
