import type Database from "better-sqlite3";
import type { LegacyImportPlan } from "./legacy";

export interface ImportReconciliation {
  locations: number;
  cards: number;
  cardLocations: number;
  plans: number;
  schedules: number;
  records: number;
  foreignKeyViolations: number;
  quickCheck: string;
}

function count(sqlite: Database.Database, table: string): number {
  return (sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function assertEmptyTarget(sqlite: Database.Database): void {
  const populated = ["locations", "cards", "maintenance_plans", "maintenance_records"].filter((table) => count(sqlite, table) > 0);
  if (populated.length > 0) {
    throw new Error(`Refusing to import into a populated database: ${populated.join(", ")}`);
  }
}

export function applyLegacyImportPlan(sqlite: Database.Database, plan: LegacyImportPlan): ImportReconciliation {
  assertEmptyTarget(sqlite);

  const insertLocation = sqlite.prepare(
    "INSERT INTO locations (id, name, description, sort_order) VALUES (?, ?, ?, ?)",
  );
  const insertCard = sqlite.prepare(
    "INSERT INTO cards (id, slug, name, description, care_notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertCardLocation = sqlite.prepare("INSERT INTO card_locations (card_id, location_id) VALUES (?, ?)");
  const insertPlan = sqlite.prepare(
    "INSERT INTO maintenance_plans (id, card_id, name, action_type, instructions, enabled, include_in_digest) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertSchedule = sqlite.prepare(
    "INSERT INTO plan_schedules (id, plan_id, schedule_type, interval_quantity, interval_unit) VALUES (?, ?, ?, ?, ?)",
  );
  const insertRecord = sqlite.prepare(
    "INSERT INTO maintenance_records (id, plan_id, card_id, completed_on, notes, source, legacy_table, legacy_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO household_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING").run();

    for (const location of plan.locations) {
      insertLocation.run(location.id, location.name, location.description, location.sortOrder);
    }
    for (const card of plan.cards) {
      insertCard.run(card.id, card.slug, card.name, card.description, card.careNotes, card.sortOrder);
      for (const locationId of card.locationIds) insertCardLocation.run(card.id, locationId);
    }
    for (const maintenancePlan of plan.plans) {
      insertPlan.run(
        maintenancePlan.id,
        maintenancePlan.cardId,
        maintenancePlan.name,
        maintenancePlan.actionType,
        maintenancePlan.instructions,
        maintenancePlan.enabled ? 1 : 0,
        maintenancePlan.includeInDigest ? 1 : 0,
      );
      if (maintenancePlan.schedule) {
        insertSchedule.run(
          `legacy-schedule:${maintenancePlan.id}`,
          maintenancePlan.id,
          maintenancePlan.schedule.scheduleType,
          maintenancePlan.schedule.intervalQuantity,
          maintenancePlan.schedule.intervalUnit,
        );
      }
    }
    for (const record of plan.records) {
      insertRecord.run(
        record.id,
        record.planId,
        record.cardId,
        record.completedOn,
        record.notes,
        record.source,
        record.legacyTable,
        record.legacyId,
      );
    }
  })();

  const foreignKeyViolations = (sqlite.pragma("foreign_key_check") as unknown[]).length;
  const quickCheckRows = sqlite.pragma("quick_check") as Array<{ quick_check: string }>;
  const reconciliation: ImportReconciliation = {
    locations: count(sqlite, "locations"),
    cards: count(sqlite, "cards"),
    cardLocations: count(sqlite, "card_locations"),
    plans: count(sqlite, "maintenance_plans"),
    schedules: count(sqlite, "plan_schedules"),
    records: count(sqlite, "maintenance_records"),
    foreignKeyViolations,
    quickCheck: quickCheckRows.map((row) => row.quick_check).join(", "),
  };

  const expectedSchedules = plan.plans.filter((maintenancePlan) => maintenancePlan.schedule !== null).length;
  if (
    reconciliation.locations !== plan.summary.locations ||
    reconciliation.cards !== plan.summary.cards ||
    reconciliation.plans !== plan.summary.plans ||
    reconciliation.schedules !== expectedSchedules ||
    reconciliation.records !== plan.summary.records ||
    reconciliation.foreignKeyViolations !== 0 ||
    reconciliation.quickCheck !== "ok"
  ) {
    throw new Error(`Post-import reconciliation failed: ${JSON.stringify(reconciliation)}`);
  }

  return reconciliation;
}
