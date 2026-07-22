import fs from "node:fs";
import path from "node:path";
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

if (process.argv.includes("--execute")) {
  throw new Error("Execute mode is intentionally unavailable until dry-run validation is approved");
}

const databasePath = requiredArgument("--database");
const browserPath = requiredArgument("--browser");
const configPath = requiredArgument("--config");
const outputPath = requiredArgument("--output");

const plan = buildLegacyImportPlan({
  database: readJson(databasePath),
  browser: readJson(browserPath),
  config: readJson(configPath),
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify(plan.summary, null, 2));
console.log(`Dry-run import plan written to ${outputPath}`);
