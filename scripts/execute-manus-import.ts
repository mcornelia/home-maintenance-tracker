import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../server/db/client";
import { applyLegacyImportPlan } from "../server/import/apply";
import { buildLegacyImportPlan } from "../server/import/legacy";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument ${name}`);
  return path.resolve(value);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

if (!process.argv.includes("--confirm-corrected-import")) {
  throw new Error("Refusing to write without --confirm-corrected-import");
}

const databaseExportPath = requiredArgument("--database");
const browserPath = requiredArgument("--browser");
const configPath = requiredArgument("--config");
const targetDataDir = requiredArgument("--target-data-dir");

const plan = buildLegacyImportPlan({
  database: readJson(databaseExportPath),
  browser: readJson(browserPath),
  config: readJson(configPath),
});
const target = openDatabase({ YARD_TRACKER_DATA_DIR: targetDataDir });

try {
  migrate(target.db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  const reconciliation = applyLegacyImportPlan(target.sqlite, plan);
  const report = {
    importedAt: new Date().toISOString(),
    inputHashes: {
      databaseExport: sha256(databaseExportPath),
      browserExport: sha256(browserPath),
      legacyConfig: sha256(configPath),
    },
    source: plan.source,
    summary: plan.summary,
    exclusionReasons: Object.entries(
      plan.exclusions.reduce<Record<string, number>>((counts, exclusion) => {
        counts[exclusion.reason] = (counts[exclusion.reason] ?? 0) + 1;
        return counts;
      }, {}),
    ).map(([reason, count]) => ({ reason, count })),
    warnings: plan.warnings,
    reconciliation,
  };
  const reportPath = path.join(target.paths.importReports, "manus-import-execution.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  console.log(`Corrected import complete: ${target.paths.database}`);
  console.log(`Reconciliation report: ${reportPath}`);
} finally {
  target.sqlite.close();
}
