import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { resolveDataPaths } from "./paths";
import * as schema from "./schema";

export function openDatabase(environment = process.env) {
  const paths = resolveDataPaths(environment);

  if (paths.root !== ":memory:") {
    fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
    fs.mkdirSync(paths.uploads, { recursive: true, mode: 0o700 });
    fs.mkdirSync(paths.backups, { recursive: true, mode: 0o700 });
    fs.mkdirSync(paths.importReports, { recursive: true, mode: 0o700 });
  }

  const sqlite = new Database(paths.database);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  if (paths.database !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    fs.chmodSync(path.resolve(paths.database), 0o600);
  }

  return {
    paths,
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}

export type YardTrackerDatabase = ReturnType<typeof openDatabase>;
