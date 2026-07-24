import type Database from "better-sqlite3";
import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { requireSession } from "../auth/session";

function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validMonthDay(value: string): boolean {
  return validCalendarDate(`2000-${value}`);
}

const dateOnly = z.string().refine(validCalendarDate, "Use a valid calendar date");
const monthDay = z.string().refine(validMonthDay, "Use a valid MM-DD date");
const assetArea = z.enum(["grounds", "household"]);
const assetCategory = z.enum([
  "plants_landscaping",
  "exterior_drainage",
  "hvac",
  "water_plumbing",
  "kitchen",
  "laundry",
  "safety",
  "electrical_resilience",
  "other",
]);
const scheduleSchema = z.discriminatedUnion("scheduleType", [
  z.object({
    scheduleType: z.literal("relative"),
    intervalQuantity: z.number().int().min(1).max(3650),
    intervalUnit: z.enum(["days", "weeks", "months", "years"]),
    firstDueOn: dateOnly.nullable().optional(),
  }),
  z.object({ scheduleType: z.literal("fixed"), fixedDates: z.array(monthDay).min(1).max(12), firstDueOn: dateOnly.nullable().optional() }),
  z.object({ scheduleType: z.literal("one_time"), oneTimeDueOn: dateOnly }),
]);

const cardCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  area: assetArea.default("grounds"),
  category: assetCategory.default("plants_landscaping"),
  description: z.string().trim().max(500).nullable().optional(),
  careNotes: z.string().trim().max(4000).nullable().optional(),
  locationIds: z.array(z.string().min(1)).max(20).default([]),
});
const cardUpdateSchema = cardCreateSchema.partial().extend({ enabled: z.boolean().optional() });
const planCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  actionType: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(4000).nullable().optional(),
  enabled: z.boolean().default(true),
  includeInDigest: z.boolean().default(true),
  schedule: scheduleSchema.nullable().default(null),
});
const planUpdateSchema = planCreateSchema.partial();
const completionSchema = z.object({ completedOn: dateOnly, notes: z.string().trim().max(4000).nullable().optional(), satisfiesDueOn: dateOnly.nullable().optional() });
const settingsSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  zipCode: z.union([z.string().regex(/^\d{5}$/), z.null()]).optional(),
  growingZone: z.string().trim().max(20).nullable().optional(),
  dueSoonDays: z.number().int().min(0).max(90).optional(),
  digestCadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  digestDay: z.number().int().min(0).max(28).optional(),
  digestLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  notificationRecipients: z.array(z.string().email()).max(20).optional(),
  backupDestination: z.string().trim().max(1000).nullable().optional(),
  backupRetentionDays: z.number().int().min(1).max(365).optional(),
}).superRefine((settings, context) => {
  if (settings.digestCadence === "weekly" && settings.digestDay !== undefined && settings.digestDay > 6) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["digestDay"], message: "Weekly digests require a weekday from Sunday through Saturday" });
  }
  if (settings.digestCadence === "monthly" && settings.digestDay !== undefined && settings.digestDay < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["digestDay"], message: "Monthly digests require a day from 1 through 28" });
  }
});
const locationSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).nullable().optional() });

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "card";
}

function uniqueSlug(sqlite: Database.Database, name: string): string {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (sqlite.prepare("SELECT 1 FROM cards WHERE slug = ?").get(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function parseBody<T>(schema: z.ZodType<T>, request: Request, response: Response): T | null {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Please check the highlighted information", details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

function writeSchedule(sqlite: Database.Database, planId: string, schedule: z.infer<typeof scheduleSchema> | null): void {
  sqlite.prepare("DELETE FROM plan_schedules WHERE plan_id = ?").run(planId);
  if (!schedule) return;
  sqlite.prepare(`INSERT INTO plan_schedules
    (id, plan_id, schedule_type, interval_quantity, interval_unit, fixed_dates_json, one_time_due_on, first_due_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      `schedule:${planId}`,
      planId,
      schedule.scheduleType,
      schedule.scheduleType === "relative" ? schedule.intervalQuantity : null,
      schedule.scheduleType === "relative" ? schedule.intervalUnit : null,
      schedule.scheduleType === "fixed" ? JSON.stringify(schedule.fixedDates) : null,
      schedule.scheduleType === "one_time" ? schedule.oneTimeDueOn : null,
      schedule.scheduleType !== "one_time" ? (schedule.firstDueOn ?? null) : null,
    );
}

function replaceCardLocations(sqlite: Database.Database, cardId: string, locationIds: string[]): void {
  const uniqueIds = [...new Set(locationIds)];
  const known = uniqueIds.filter((id) => sqlite.prepare("SELECT 1 FROM locations WHERE id = ? AND archived_at IS NULL").get(id));
  if (known.length !== uniqueIds.length) throw new Error("One or more selected locations no longer exist");
  sqlite.prepare("DELETE FROM card_locations WHERE card_id = ?").run(cardId);
  const insert = sqlite.prepare("INSERT INTO card_locations (card_id, location_id) VALUES (?, ?)");
  for (const locationId of known) insert.run(cardId, locationId);
}

export function registerMutationRoutes(app: Express, sqlite: Database.Database): void {
  const authenticated = requireSession(sqlite);

  app.put("/api/settings", authenticated, (request, response) => {
    const body = parseBody(settingsSchema, request, response);
    if (!body) return;
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapping = {
      displayName: "display_name",
      zipCode: "zip_code",
      growingZone: "growing_zone",
      dueSoonDays: "due_soon_days",
      digestCadence: "digest_cadence",
      digestDay: "digest_day",
      digestLocalTime: "digest_local_time",
      backupDestination: "backup_destination",
      backupRetentionDays: "backup_retention_days",
    } as const;
    for (const [key, column] of Object.entries(mapping)) {
      if (body[key as keyof typeof body] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(body[key as keyof typeof body]);
      }
    }
    sqlite.transaction(() => {
      if (fields.length) {
        fields.push("updated_at = ?");
        values.push(Date.now(), 1);
        sqlite.prepare(`UPDATE household_settings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      }
      if (body.notificationRecipients !== undefined) {
        sqlite.prepare("DELETE FROM notification_recipients").run();
        const insert = sqlite.prepare("INSERT INTO notification_recipients (id, email, enabled) VALUES (?, ?, 1)");
        for (const email of [...new Set(body.notificationRecipients.map((item) => item.toLowerCase()))]) insert.run(`recipient:${nanoid()}`, email);
      }
    })();
    response.status(204).end();
  });

  app.post("/api/locations", authenticated, (request, response) => {
    const body = parseBody(locationSchema, request, response);
    if (!body) return;
    const id = `location:${nanoid()}`;
    const sortOrder = (sqlite.prepare("SELECT coalesce(max(sort_order), -1) + 1 AS value FROM locations").get() as { value: number }).value;
    sqlite.prepare("INSERT INTO locations (id, name, description, sort_order) VALUES (?, ?, ?, ?)").run(id, body.name, body.description ?? null, sortOrder);
    response.status(201).json({ id });
  });

  app.patch("/api/locations/:id", authenticated, (request, response) => {
    const body = parseBody(locationSchema.partial(), request, response);
    if (!body) return;
    const existing = sqlite.prepare("SELECT id FROM locations WHERE id = ? AND archived_at IS NULL").get(request.params.id);
    if (!existing) return void response.status(404).json({ error: "Location not found" });
    if (body.name !== undefined) sqlite.prepare("UPDATE locations SET name = ?, updated_at = ? WHERE id = ?").run(body.name, Date.now(), request.params.id);
    if (body.description !== undefined) sqlite.prepare("UPDATE locations SET description = ?, updated_at = ? WHERE id = ?").run(body.description, Date.now(), request.params.id);
    response.status(204).end();
  });

  app.post("/api/cards", authenticated, (request, response) => {
    const body = parseBody(cardCreateSchema, request, response);
    if (!body) return;
    const id = `card:${nanoid()}`;
    const sortOrder = (sqlite.prepare("SELECT coalesce(max(sort_order), -1) + 1 AS value FROM cards").get() as { value: number }).value;
    try {
      sqlite.transaction(() => {
        sqlite.prepare("INSERT INTO cards (id, slug, name, area, category, description, care_notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(id, uniqueSlug(sqlite, body.name), body.name, body.area, body.category, body.description ?? null, body.careNotes ?? null, sortOrder);
        replaceCardLocations(sqlite, id, body.locationIds);
      })();
    } catch (error) {
      return void response.status(400).json({ error: error instanceof Error ? error.message : "Card could not be created" });
    }
    response.status(201).json({ id });
  });

  app.patch("/api/cards/:id", authenticated, (request, response) => {
    const body = parseBody(cardUpdateSchema, request, response);
    if (!body) return;
    const cardId = request.params.id;
    if (!sqlite.prepare("SELECT id FROM cards WHERE id = ? AND archived_at IS NULL").get(cardId)) return void response.status(404).json({ error: "Card not found" });
    try {
      sqlite.transaction(() => {
        const updates: Array<[string, unknown]> = [];
        if (body.name !== undefined) updates.push(["name", body.name]);
        if (body.area !== undefined) updates.push(["area", body.area]);
        if (body.category !== undefined) updates.push(["category", body.category]);
        if (body.description !== undefined) updates.push(["description", body.description]);
        if (body.careNotes !== undefined) updates.push(["care_notes", body.careNotes]);
        if (body.enabled !== undefined) updates.push(["enabled", body.enabled ? 1 : 0]);
        for (const [column, value] of updates) sqlite.prepare(`UPDATE cards SET ${column} = ?, updated_at = ? WHERE id = ?`).run(value, Date.now(), cardId);
        if (body.locationIds !== undefined) replaceCardLocations(sqlite, cardId, body.locationIds);
      })();
    } catch (error) {
      return void response.status(400).json({ error: error instanceof Error ? error.message : "Card could not be updated" });
    }
    response.status(204).end();
  });

  app.delete("/api/cards/:id", authenticated, (request, response) => {
    const result = sqlite.prepare("UPDATE cards SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").run(Date.now(), Date.now(), request.params.id);
    response.status(result.changes ? 204 : 404).end();
  });

  app.post("/api/cards/:cardId/plans", authenticated, (request, response) => {
    const body = parseBody(planCreateSchema, request, response);
    if (!body) return;
    if (!sqlite.prepare("SELECT 1 FROM cards WHERE id = ? AND archived_at IS NULL").get(request.params.cardId)) return void response.status(404).json({ error: "Card not found" });
    const id = `plan:${nanoid()}`;
    sqlite.transaction(() => {
      sqlite.prepare("INSERT INTO maintenance_plans (id, card_id, name, action_type, instructions, enabled, include_in_digest) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, request.params.cardId, body.name, body.actionType, body.instructions ?? null, body.enabled ? 1 : 0, body.includeInDigest ? 1 : 0);
      writeSchedule(sqlite, id, body.schedule);
    })();
    response.status(201).json({ id });
  });

  app.patch("/api/plans/:id", authenticated, (request, response) => {
    const body = parseBody(planUpdateSchema, request, response);
    if (!body) return;
    const planId = request.params.id;
    if (!sqlite.prepare("SELECT 1 FROM maintenance_plans WHERE id = ? AND archived_at IS NULL").get(planId)) return void response.status(404).json({ error: "Plan not found" });
    sqlite.transaction(() => {
      const updates: Array<[string, unknown]> = [];
      if (body.name !== undefined) updates.push(["name", body.name]);
      if (body.actionType !== undefined) updates.push(["action_type", body.actionType]);
      if (body.instructions !== undefined) updates.push(["instructions", body.instructions]);
      if (body.enabled !== undefined) updates.push(["enabled", body.enabled ? 1 : 0]);
      if (body.includeInDigest !== undefined) updates.push(["include_in_digest", body.includeInDigest ? 1 : 0]);
      for (const [column, value] of updates) sqlite.prepare(`UPDATE maintenance_plans SET ${column} = ?, updated_at = ? WHERE id = ?`).run(value, Date.now(), planId);
      if (body.schedule !== undefined) writeSchedule(sqlite, planId, body.schedule);
    })();
    response.status(204).end();
  });

  app.delete("/api/plans/:id", authenticated, (request, response) => {
    const result = sqlite.prepare("UPDATE maintenance_plans SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").run(Date.now(), Date.now(), request.params.id);
    response.status(result.changes ? 204 : 404).end();
  });

  app.post("/api/plans/:id/complete", authenticated, (request, response) => {
    const body = parseBody(completionSchema, request, response);
    if (!body) return;
    const plan = sqlite.prepare("SELECT id, card_id AS cardId FROM maintenance_plans WHERE id = ? AND archived_at IS NULL").get(request.params.id) as { id: string; cardId: string } | undefined;
    if (!plan) return void response.status(404).json({ error: "Plan not found" });
    const id = `record:${nanoid()}`;
    sqlite.prepare("INSERT INTO maintenance_records (id, plan_id, card_id, completed_on, satisfies_due_on, notes) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, plan.id, plan.cardId, body.completedOn, body.satisfiesDueOn ?? null, body.notes ?? null);
    response.status(201).json({ id });
  });

  app.delete("/api/records/:id", authenticated, (request, response) => {
    const result = sqlite.prepare("DELETE FROM maintenance_records WHERE id = ?").run(request.params.id);
    response.status(result.changes ? 204 : 404).end();
  });
}
