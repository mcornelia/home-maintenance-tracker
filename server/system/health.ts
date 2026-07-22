import type { YardTrackerDatabase } from "@server/db/client";
import { APPLICATION_NAME, APPLICATION_VERSION } from "@shared/constants";

export function getHealth(database: YardTrackerDatabase) {
  const integrity = database.sqlite.pragma("quick_check", { simple: true });

  return {
    status: integrity === "ok" ? "ok" : "degraded",
    application: APPLICATION_NAME,
    version: APPLICATION_VERSION,
    database: integrity === "ok" ? "reachable" : "integrity-check-failed",
  } as const;
}
