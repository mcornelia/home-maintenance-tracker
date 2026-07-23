import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { readDashboard } from "../server/dashboard/read";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";

let database: YardTrackerDatabase | undefined;
afterEach(() => database?.sqlite.close());

describe("dashboard reader", () => {
  it("returns cards, locations, due states, and recent household activity", () => {
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
    database.sqlite.exec(`
      INSERT INTO household_settings (id, display_name, timezone, due_soon_days) VALUES (1, 'Our Yard', 'America/New_York', 14);
      INSERT INTO locations (id, name, sort_order) VALUES ('front', 'Front', 0);
      INSERT INTO cards (id, slug, name, enabled, sort_order) VALUES ('azaleas', 'azaleas', 'Azaleas', 1, 0);
      INSERT INTO card_locations (card_id, location_id) VALUES ('azaleas', 'front');
      INSERT INTO maintenance_plans (id, card_id, name, action_type, enabled, include_in_digest)
        VALUES ('osmocote', 'azaleas', 'Osmocote', 'osmocote', 1, 1);
      INSERT INTO plan_schedules (id, plan_id, schedule_type, interval_quantity, interval_unit)
        VALUES ('schedule', 'osmocote', 'relative', 90, 'days');
      INSERT INTO maintenance_records (id, plan_id, card_id, completed_on)
        VALUES ('record', 'osmocote', 'azaleas', '2026-03-08');
    `);

    const result = readDashboard(database.sqlite, new Date("2026-06-01T16:00:00Z"));
    expect(result.today).toBe("2026-06-01");
    expect(result.household.displayName).toBe("Our Yard");
    expect(result.locations).toEqual([{ id: "front", name: "Front" }]);
    expect(result.counts.due_soon).toBe(1);
    expect(result.cards[0]).toMatchObject({
      name: "Azaleas",
      area: "grounds",
      category: "plants_landscaping",
      state: "due_soon",
      nextDueOn: "2026-06-06",
      locationNames: ["Front"],
    });
    expect(result.recentActivity[0]).toMatchObject({ cardName: "Azaleas", planName: "Osmocote", completedOn: "2026-03-08" });
  });
});
