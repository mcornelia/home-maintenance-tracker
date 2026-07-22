import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";
import { digestPeriod, runDigestIfDue } from "../server/digest/service";

let database: YardTrackerDatabase | undefined;
afterEach(() => database?.sqlite.close());

function setup() {
  database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_DATA_DIR: ":memory:" });
  migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
  database.sqlite.exec(`
    INSERT INTO household_settings (id, display_name, timezone, digest_cadence, digest_day, digest_local_time) VALUES (1, 'Our Yard', 'America/New_York', 'daily', 0, '09:00');
    INSERT INTO notification_recipients (id, email) VALUES ('one', 'one@example.com'), ('two', 'two@example.com');
    INSERT INTO cards (id, slug, name) VALUES ('azaleas', 'azaleas', 'Azaleas');
    INSERT INTO maintenance_plans (id, card_id, name, action_type) VALUES ('osmocote', 'azaleas', 'Osmocote', 'osmocote');
    INSERT INTO plan_schedules (id, plan_id, schedule_type, one_time_due_on) VALUES ('schedule', 'osmocote', 'one_time', '2026-07-22');
  `);
  return database;
}

describe("household email digest", () => {
  it("calculates daily, weekly, and monthly delivery periods in household time", () => {
    const now = new Date("2026-07-22T14:00:00Z");
    expect(digestPeriod({ displayName: "Yard", timezone: "America/New_York", digestCadence: "daily", digestDay: 0, digestLocalTime: "09:00" }, now)).toEqual({ due: true, key: "2026-07-22" });
    expect(digestPeriod({ displayName: "Yard", timezone: "America/New_York", digestCadence: "weekly", digestDay: 3, digestLocalTime: "09:00" }, now)).toEqual({ due: true, key: "2026-07-19" });
    expect(digestPeriod({ displayName: "Yard", timezone: "America/New_York", digestCadence: "monthly", digestDay: 22, digestLocalTime: "09:00" }, now)).toEqual({ due: true, key: "2026-07" });
  });

  it("sends one successful digest per period to every enabled recipient", async () => {
    const target = setup();
    const send = vi.fn().mockResolvedValue(undefined);
    const options = { environment: { SMTP_HOST: "smtp.example.test", SMTP_FROM: "yard@example.test" }, now: new Date("2026-07-22T14:00:00Z"), send };
    expect(await runDigestIfDue(target.sqlite, options)).toMatchObject({ status: "sent", recipients: 2 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: ["one@example.com", "two@example.com"], subject: "Our Yard: 1 items need attention" });
    expect(send.mock.calls[0][0].text).toContain("Azaleas: Osmocote");
    expect(await runDigestIfDue(target.sqlite, options)).toMatchObject({ status: "already_sent" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows a failed period to retry without duplicating a success", async () => {
    const target = setup();
    const send = vi.fn().mockRejectedValueOnce(new Error("temporary SMTP failure")).mockResolvedValueOnce(undefined);
    const options = { environment: { SMTP_HOST: "smtp.example.test", SMTP_FROM: "yard@example.test" }, now: new Date("2026-07-22T14:00:00Z"), send };
    expect(await runDigestIfDue(target.sqlite, options)).toMatchObject({ status: "failed" });
    expect(await runDigestIfDue(target.sqlite, options)).toMatchObject({ status: "sent" });
    expect(await runDigestIfDue(target.sqlite, options)).toMatchObject({ status: "already_sent" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
