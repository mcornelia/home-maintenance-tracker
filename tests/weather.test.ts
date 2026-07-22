import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";
import { getHouseholdWeather } from "../server/weather/service";

let database: YardTrackerDatabase | undefined;
afterEach(() => database?.sqlite.close());

function setup(zipCode: string | null) {
  database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
  migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
  database.sqlite.prepare("INSERT INTO household_settings (id, zip_code, timezone) VALUES (1, ?, 'America/New_York')").run(zipCode);
  return database;
}

describe("display-only household weather", () => {
  it("does not call an external service before a ZIP is configured", async () => {
    const target = setup(null);
    const fetcher = vi.fn();
    expect(await getHouseholdWeather(target.sqlite, { fetch: fetcher as typeof fetch })).toEqual({ status: "unconfigured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns five normalized days and caches them without coordinates", async () => {
    const target = setup("30605");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ name: "Madison", admin1: "Wisconsin", country_code: "US", latitude: 43.07, longitude: -89.4 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ daily: {
        time: ["2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"],
        weather_code: [1, 2, 61, 80, 95], temperature_2m_max: [91.2, 90.8, 88.1, 87.5, 89.9],
        temperature_2m_min: [72.1, 71.8, 70.4, 69.9, 71.2], precipitation_probability_max: [10, 20, 60, 55, 70],
      } }), { status: 200 }));
    const first = await getHouseholdWeather(target.sqlite, { fetch: fetcher as typeof fetch, now: 1_000_000 });
    expect(first).toMatchObject({ status: "ready", stale: false, locationName: "Madison, Wisconsin" });
    if (first.status === "ready") expect(first.days).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const cache = target.sqlite.prepare("SELECT payload_json AS payload FROM weather_cache WHERE zip_code = '30605'").get() as { payload: string };
    expect(cache.payload).not.toContain("latitude");
    expect(cache.payload).not.toContain("longitude");
    const second = await getHouseholdWeather(target.sqlite, { fetch: fetcher as typeof fetch, now: 1_000_001 });
    expect(second).toMatchObject({ status: "ready", stale: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns a stale cached forecast when the household internet is unavailable", async () => {
    const target = setup("30605");
    target.sqlite.prepare("INSERT INTO weather_cache (zip_code, provider, payload_json, fetched_at, expires_at) VALUES ('30605', 'open-meteo', ?, 1, 2)")
      .run(JSON.stringify({ locationName: "Madison, Wisconsin", days: [] }));
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await getHouseholdWeather(target.sqlite, { fetch: fetcher as typeof fetch, now: 3 })).toMatchObject({ status: "ready", stale: true, locationName: "Madison, Wisconsin" });
  });
});
