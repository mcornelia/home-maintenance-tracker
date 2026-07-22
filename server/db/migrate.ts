import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { openDatabase } from "./client";

const database = openDatabase();

try {
  migrate(database.db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  console.log(`Database migrations complete: ${database.paths.database}`);
} finally {
  database.sqlite.close();
}
