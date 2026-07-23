import express from "express";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { registerMutationRoutes } from "./api/mutations";
import { registerAuthRoutes, requireSession } from "./auth/session";
import { runNightlyBackup } from "./backup/service";
import { readDashboard } from "./dashboard/read";
import { openDatabase } from "./db/client";
import { registerPhotoRoutes } from "./photos/routes";
import { startHouseholdScheduler } from "./scheduler/service";
import { getHealth } from "./system/health";
import { getHouseholdWeather } from "./weather/service";

const app = express();
const database = openDatabase();
migrate(database.db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "0.0.0.0";

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json(getHealth(database));
});

registerAuthRoutes(app, database.sqlite);

app.get("/api/dashboard", requireSession(database.sqlite), (_request, response) => {
  response.json(readDashboard(database.sqlite));
});

app.get("/api/weather", requireSession(database.sqlite), async (_request, response) => {
  response.json(await getHouseholdWeather(database.sqlite));
});

registerMutationRoutes(app, database.sqlite);
registerPhotoRoutes(app, database);

app.post("/api/system/backup", requireSession(database.sqlite), async (_request, response) => {
  const result = await runNightlyBackup(database, { force: true });
  response.status(result.status === "failed" ? 500 : result.status === "unconfigured" ? 400 : 200).json(result);
});

if (process.env.NODE_ENV === "development") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const publicDirectory = path.resolve(process.cwd(), "dist", "public");
  app.use(express.static(publicDirectory, { index: false }));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(publicDirectory, "index.html"));
  });
}

const server = app.listen(port, host, () => {
  console.log(`Ravenwood listening on http://${host}:${port}`);
});
const stopScheduler = startHouseholdScheduler(database);

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down`);
  stopScheduler();
  server.close(() => {
    database.sqlite.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (!fs.existsSync(database.paths.root) && database.paths.root !== ":memory:") {
  throw new Error(`Data directory was not created: ${database.paths.root}`);
}
