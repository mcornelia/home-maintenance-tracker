import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import archiver from "archiver";
import { nanoid } from "nanoid";
import type { YardTrackerDatabase } from "../db/client";

const BACKUP_PREFIX = "yard-tracker-backup-";

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localHour(now: Date, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

function validateDestination(destination: string, dataRoot: string): string {
  if (!path.isAbsolute(destination)) throw new Error("Backup destination must be an absolute folder path");
  const resolved = path.resolve(destination);
  if (resolved === path.parse(resolved).root || resolved === os.homedir() || resolved === path.resolve(dataRoot)) throw new Error("Choose a dedicated backup folder");
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error("Backup destination folder does not exist");
  fs.accessSync(resolved, fs.constants.W_OK);
  return resolved;
}

async function createZip(database: YardTrackerDatabase, zipPath: string, sqliteSnapshot: string, createdAt: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 7 } });
    const output = fs.createWriteStream(zipPath, { mode: 0o600 });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.file(sqliteSnapshot, { name: "yard-tracker.sqlite" });
    if (fs.existsSync(database.paths.uploads)) archive.directory(database.paths.uploads, "uploads");
    archive.append(JSON.stringify({ application: "Yard Tracker", createdAt, formatVersion: 1 }, null, 2), { name: "manifest.json" });
    void archive.finalize();
  });
}

export async function runNightlyBackup(database: YardTrackerDatabase, options: { now?: Date; force?: boolean } = {}) {
  if (database.paths.database === ":memory:") return { status: "unconfigured" as const };
  const now = options.now ?? new Date();
  const settings = database.sqlite.prepare("SELECT timezone, backup_destination AS destination, backup_retention_days AS retentionDays FROM household_settings WHERE id = 1").get() as { timezone: string; destination: string | null; retentionDays: number } | undefined;
  if (!settings?.destination) return { status: "unconfigured" as const };
  const periodKey = localDate(now, settings.timezone);
  if (!options.force && localHour(now, settings.timezone) < 2) return { status: "not_due" as const, periodKey };
  const prior = database.sqlite.prepare("SELECT status FROM scheduler_runs WHERE job_name = 'nightly-backup' AND period_key = ?").get(periodKey) as { status: string } | undefined;
  if (!options.force && prior?.status === "succeeded") return { status: "already_created" as const, periodKey };
  const destination = validateDestination(settings.destination, database.paths.root);
  database.sqlite.prepare(`INSERT INTO scheduler_runs (id, job_name, period_key, status, started_at) VALUES (?, 'nightly-backup', ?, 'started', ?)
    ON CONFLICT(job_name, period_key) DO UPDATE SET status = 'started', error_summary = NULL, started_at = excluded.started_at, finished_at = NULL`)
    .run(nanoid(), periodKey, now.getTime());
  const workId = nanoid();
  const sqliteSnapshot = path.join(database.paths.backups, `${workId}.sqlite`);
  const localZip = path.join(database.paths.backups, `${workId}.zip.partial`);
  const archiveName = `${BACKUP_PREFIX}${periodKey}.zip`;
  const destinationPartial = path.join(destination, `${archiveName}.partial`);
  const destinationFinal = path.join(destination, archiveName);
  try {
    await database.sqlite.backup(sqliteSnapshot);
    fs.chmodSync(sqliteSnapshot, 0o600);
    await createZip(database, localZip, sqliteSnapshot, now.toISOString());
    fs.copyFileSync(localZip, destinationPartial);
    fs.chmodSync(destinationPartial, 0o600);
    fs.renameSync(destinationPartial, destinationFinal);
    const cutoff = now.getTime() - settings.retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(destination)) {
      if (!name.startsWith(BACKUP_PREFIX) || !name.endsWith(".zip")) continue;
      const target = path.join(destination, name);
      if (target === destinationFinal) continue;
      if (fs.statSync(target).mtimeMs < cutoff) { fs.unlinkSync(target); removed += 1; }
    }
    database.sqlite.prepare("UPDATE scheduler_runs SET status = 'succeeded', finished_at = ? WHERE job_name = 'nightly-backup' AND period_key = ?").run(Date.now(), periodKey);
    return { status: "created" as const, periodKey, filename: archiveName, removed };
  } catch (error) {
    const summary = error instanceof Error ? error.message.slice(0, 500) : "Unknown backup error";
    database.sqlite.prepare("UPDATE scheduler_runs SET status = 'failed', error_summary = ?, finished_at = ? WHERE job_name = 'nightly-backup' AND period_key = ?").run(summary, Date.now(), periodKey);
    return { status: "failed" as const, periodKey, error: summary };
  } finally {
    for (const temporary of [sqliteSnapshot, localZip, destinationPartial]) if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
