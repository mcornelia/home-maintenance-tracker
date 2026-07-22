import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { runNightlyBackup } from "../server/backup/service";
import { openDatabase, type YardTrackerDatabase } from "../server/db/client";

let database: YardTrackerDatabase | undefined;
let testRoot: string | undefined;
afterEach(() => { database?.sqlite.close(); if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true }); });

describe("nightly retained backups", () => {
  it("creates an atomic ZIP, includes private state, and removes only expired Yard Tracker archives", async () => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yard-tracker-backup-test-"));
    const dataRoot = path.join(testRoot, "data");
    const destination = path.join(testRoot, "synced-backups");
    fs.mkdirSync(destination);
    database = openDatabase({ NODE_ENV: "test", YARD_TRACKER_TEST_ROOT: testRoot, YARD_TRACKER_DATA_DIR: dataRoot });
    migrate(database.db, { migrationsFolder: path.resolve("drizzle") });
    database.sqlite.prepare("INSERT INTO household_settings (id, timezone, backup_destination, backup_retention_days) VALUES (1, 'America/New_York', ?, 30)").run(destination);
    database.sqlite.prepare("INSERT INTO cards (id, slug, name) VALUES ('card', 'azaleas', 'Azaleas')").run();
    fs.writeFileSync(path.join(database.paths.uploads, "private-photo.webp"), "photo", { mode: 0o600 });
    const expired = path.join(destination, "yard-tracker-backup-2026-01-01.zip");
    const unrelated = path.join(destination, "family-archive.zip");
    fs.writeFileSync(expired, "old"); fs.writeFileSync(unrelated, "keep");
    const old = new Date("2026-01-02T00:00:00Z"); fs.utimesSync(expired, old, old); fs.utimesSync(unrelated, old, old);

    const result = await runNightlyBackup(database, { now: new Date("2026-07-22T07:00:00Z"), force: true });
    expect(result, JSON.stringify(result)).toMatchObject({ status: "created", filename: "yard-tracker-backup-2026-07-22.zip", removed: 1 });
    const backup = path.join(destination, "yard-tracker-backup-2026-07-22.zip");
    expect(fs.readFileSync(backup).subarray(0, 2).toString()).toBe("PK");
    expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(expired)).toBe(false);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.readdirSync(destination).some((name) => name.endsWith(".partial"))).toBe(false);
    expect(await runNightlyBackup(database, { now: new Date("2026-07-22T08:00:00Z") })).toMatchObject({ status: "already_created" });
  });
});
