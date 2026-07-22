import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";
import { applyLegacyImportPlan } from "../server/import/apply";
import type { LegacyImportPlan } from "../server/import/legacy";

let database: YardTrackerDatabase | undefined;

afterEach(() => database?.sqlite.close());

function samplePlan(): LegacyImportPlan {
  return {
    source: { legacyCommit: "abc", browserExportDate: "2026-07-22", browserOrigin: "https://example.test", householdUserCount: 1 },
    locations: [{ id: "location:1", name: "Front", description: "Front garden", sortOrder: 0 }],
    cards: [{ id: "card:1", slug: "azaleas", name: "Azaleas", description: "Every azalea", careNotes: null, locationIds: ["location:1"], sortOrder: 0 }],
    plans: [{ id: "plan:1", cardId: "card:1", name: "Osmocote", actionType: "osmocote", instructions: null, enabled: true, includeInDigest: true, schedule: { scheduleType: "relative", intervalQuantity: 90, intervalUnit: "days" } }],
    records: [{ id: "record:1", planId: "plan:1", cardId: "card:1", completedOn: "2026-03-08", notes: null, source: "manus", legacyTable: "fertilizationLogs", legacyId: 1 }],
    exclusions: [],
    warnings: [],
    summary: { cards: 1, locations: 1, plans: 1, records: 1, exclusions: 0, fertilizationRecords: 1, pestControlRecords: 0, pruningRecords: 0 },
  };
}

describe("legacy import writer", () => {
  it("imports transactionally and reconciles every entity", () => {
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });

    expect(applyLegacyImportPlan(database.sqlite, samplePlan())).toEqual({
      locations: 1,
      cards: 1,
      cardLocations: 1,
      plans: 1,
      schedules: 1,
      records: 1,
      foreignKeyViolations: 0,
      quickCheck: "ok",
    });
  });

  it("refuses to write into an already populated household database", () => {
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
    applyLegacyImportPlan(database.sqlite, samplePlan());

    expect(() => applyLegacyImportPlan(database!.sqlite, samplePlan())).toThrow("Refusing to import into a populated database");
  });
});
