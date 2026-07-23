import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const householdSettings = sqliteTable("household_settings", {
  id: integer("id").primaryKey().default(1),
  displayName: text("display_name").notNull().default("My Yard"),
  zipCode: text("zip_code"),
  growingZone: text("growing_zone"),
  timezone: text("timezone").notNull().default("America/New_York"),
  dueSoonDays: integer("due_soon_days").notNull().default(14),
  digestCadence: text("digest_cadence", { enum: ["daily", "weekly", "monthly"] }).notNull().default("weekly"),
  digestDay: integer("digest_day").notNull().default(0),
  digestLocalTime: text("digest_local_time").notNull().default("09:00"),
  backupDestination: text("backup_destination"),
  backupRetentionDays: integer("backup_retention_days").notNull().default(30),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("locations_name_unique").on(table.name)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    area: text("area", { enum: ["grounds", "household"] }).notNull().default("grounds"),
    category: text("category").notNull().default("plants_landscaping"),
    description: text("description"),
    careNotes: text("care_notes"),
    coverAttachmentId: text("cover_attachment_id"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("cards_slug_unique").on(table.slug), index("cards_active_sort_idx").on(table.archivedAt, table.sortOrder)],
);

export const cardLocations = sqliteTable(
  "card_locations",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.locationId] })],
);

export const maintenancePlans = sqliteTable(
  "maintenance_plans",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    actionType: text("action_type").notNull(),
    instructions: text("instructions"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    includeInDigest: integer("include_in_digest", { mode: "boolean" }).notNull().default(true),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("maintenance_plans_card_idx").on(table.cardId, table.archivedAt)],
);

export const planSchedules = sqliteTable(
  "plan_schedules",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: "cascade" }),
    scheduleType: text("schedule_type", { enum: ["relative", "fixed", "one_time"] }).notNull(),
    intervalQuantity: integer("interval_quantity"),
    intervalUnit: text("interval_unit", { enum: ["days", "weeks", "months", "years"] }),
    fixedDatesJson: text("fixed_dates_json"),
    oneTimeDueOn: text("one_time_due_on"),
    firstDueOn: text("first_due_on"),
    timezone: text("timezone").notNull().default("America/New_York"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("plan_schedules_plan_unique").on(table.planId)],
);

export const maintenanceRecords = sqliteTable(
  "maintenance_records",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").references(() => maintenancePlans.id, { onDelete: "set null" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "restrict" }),
    completedOn: text("completed_on").notNull(),
    satisfiesDueOn: text("satisfies_due_on"),
    notes: text("notes"),
    source: text("source").notNull().default("yard-tracker"),
    legacyTable: text("legacy_table"),
    legacyId: integer("legacy_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("maintenance_records_card_date_idx").on(table.cardId, table.completedOn),
    uniqueIndex("maintenance_records_legacy_unique").on(table.legacyTable, table.legacyId),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    maintenanceRecordId: text("maintenance_record_id").references(() => maintenanceRecords.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull(),
    storedPath: text("stored_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    mimeType: text("mime_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("attachments_card_idx").on(table.cardId), index("attachments_record_idx").on(table.maintenanceRecordId)],
);

export const notificationRecipients = sqliteTable(
  "notification_recipients",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("notification_recipients_email_unique").on(table.email)],
);

export const schedulerRuns = sqliteTable(
  "scheduler_runs",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    periodKey: text("period_key").notNull(),
    status: text("status", { enum: ["started", "succeeded", "failed"] }).notNull(),
    errorSummary: text("error_summary"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [uniqueIndex("scheduler_runs_job_period_unique").on(table.jobName, table.periodKey)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash), index("auth_sessions_expiry_idx").on(table.expiresAt)],
);

export const householdAuth = sqliteTable("household_auth", {
  id: integer("id").primaryKey().default(1),
  passphraseSalt: text("passphrase_salt").notNull(),
  passphraseHash: text("passphrase_hash").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const weatherCache = sqliteTable("weather_cache", {
  zipCode: text("zip_code").primaryKey(),
  provider: text("provider").notNull(),
  payloadJson: text("payload_json").notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
