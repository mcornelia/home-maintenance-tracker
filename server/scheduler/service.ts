import type { YardTrackerDatabase } from "../db/client";
import { runNightlyBackup } from "../backup/service";
import { runDigestIfDue } from "../digest/service";

export function startHouseholdScheduler(database: YardTrackerDatabase) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runDigestIfDue(database.sqlite);
      await runNightlyBackup(database);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
