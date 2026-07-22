import { z } from "zod";

const legacyUserSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable().optional(),
});

const fertilizationLogSchema = z.object({
  id: z.number().int(),
  categoryId: z.string(),
  fertilizerType: z.string(),
  appliedDate: z.string(),
  loggedByUserId: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const pestControlLogSchema = z.object({
  id: z.number().int(),
  categoryId: z.string(),
  pestType: z.string(),
  treatmentMethod: z.string(),
  treatedDate: z.string(),
  loggedByUserId: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const pruningLogSchema = z.object({
  id: z.number().int(),
  categoryId: z.string(),
  pruningType: z.string(),
  prunedDate: z.string(),
  loggedByUserId: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const taskCompletionSchema = z.object({
  id: z.number().int(),
  categoryId: z.string(),
  taskType: z.string(),
  completedDate: z.string(),
  completedByUserId: z.number().int(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
});

const emailPreferenceSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
});

export const legacyDatabaseExportSchema = z.object({
  users: z.array(legacyUserSchema),
  fertilizationLogs: z.array(fertilizationLogSchema),
  pestControlLogs: z.array(pestControlLogSchema),
  pruningLogs: z.array(pruningLogSchema),
  taskCompletions: z.array(taskCompletionSchema),
  emailPreferences: z.array(emailPreferenceSchema),
  plantCategorySettings: z.array(z.unknown()),
});

const legacyCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  plants: z.array(z.string()),
  recommendedFertilizer: z.array(z.string()),
  intervalDays: z.number().int().positive(),
  notes: z.string().nullable().optional(),
});

const legacyZoneSchema = z.object({
  id: z.number().int(),
  label: z.string(),
  description: z.string(),
  plantCategoryIds: z.array(z.string()),
});

const treatmentSchema = z.object({
  label: z.string(),
  description: z.string(),
});

export const legacyConfigSchema = z.object({
  sourceCommit: z.string(),
  categories: z.array(legacyCategorySchema),
  zones: z.array(legacyZoneSchema),
  treatments: z.record(z.string(), treatmentSchema),
});

const fertilizerSettingSchema = z.object({
  enabled: z.boolean(),
  intervalDays: z.number().int().positive().nullable(),
});

const categorySettingsSchema = z.object({
  categoryId: z.string(),
  fertilizerSettings: z.record(z.string(), fertilizerSettingSchema),
});

export const legacyBrowserExportSchema = z.object({
  exportDate: z.string(),
  origin: z.string(),
  browserLocalStorage: z.object({
    "yard-tracker-plant-settings": z.record(z.string(), categorySettingsSchema),
    "yard-tracker-custom-categories": z.array(z.unknown()).nullable(),
    "dismissed-mulch-reminders": z.record(z.string(), z.unknown()).nullable(),
  }),
});

export type LegacyDatabaseExport = z.infer<typeof legacyDatabaseExportSchema>;
export type LegacyConfig = z.infer<typeof legacyConfigSchema>;
export type LegacyBrowserExport = z.infer<typeof legacyBrowserExportSchema>;

export interface PlannedLocation {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface PlannedCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  careNotes: string | null;
  locationIds: string[];
  sortOrder: number;
}

export interface PlannedPlan {
  id: string;
  cardId: string;
  name: string;
  actionType: string;
  instructions: string | null;
  enabled: boolean;
  includeInDigest: boolean;
  schedule: null | {
    scheduleType: "relative";
    intervalQuantity: number;
    intervalUnit: "days";
  };
}

export interface PlannedRecord {
  id: string;
  planId: string | null;
  cardId: string;
  completedOn: string;
  notes: string | null;
  source: "manus";
  legacyTable: "fertilizationLogs" | "pestControlLogs" | "pruningLogs";
  legacyId: number;
}

export interface ExcludedRecord {
  table: "taskCompletions" | "fertilizationLogs" | "pestControlLogs" | "pruningLogs" | "emailPreferences";
  id: number;
  reason: string;
}

export interface LegacyImportPlan {
  source: {
    legacyCommit: string;
    browserExportDate: string;
    browserOrigin: string;
    householdUserCount: number;
  };
  locations: PlannedLocation[];
  cards: PlannedCard[];
  plans: PlannedPlan[];
  records: PlannedRecord[];
  exclusions: ExcludedRecord[];
  warnings: string[];
  summary: {
    cards: number;
    locations: number;
    plans: number;
    records: number;
    exclusions: number;
    fertilizationRecords: number;
    pestControlRecords: number;
    pruningRecords: number;
  };
}

function dateOnly(value: string): string {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match) throw new Error(`Invalid legacy date: ${value}`);
  return match[0];
}

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function cardId(categoryId: string): string {
  return `legacy-card:${categoryId}`;
}

function locationId(zoneId: number): string {
  return `legacy-location:${zoneId}`;
}

function treatmentPlanId(categoryId: string, treatmentType: string): string {
  return `legacy-plan:${categoryId}:${treatmentType}`;
}

function isFruitTreePestFixture(log: z.infer<typeof pestControlLogSchema>): boolean {
  return (
    log.categoryId === "fruit-trees" &&
    normalized(log.pestType) === "aphids" &&
    normalized(log.treatmentMethod) === "neem oil" &&
    dateOnly(log.treatedDate) === "2026-03-08" &&
    normalized(log.notes) === "sprayed all fruit trees"
  );
}

export function buildLegacyImportPlan(input: {
  database: unknown;
  browser: unknown;
  config: unknown;
}): LegacyImportPlan {
  const database = legacyDatabaseExportSchema.parse(input.database);
  const browser = legacyBrowserExportSchema.parse(input.browser);
  const config = legacyConfigSchema.parse(input.config);
  const settings = browser.browserLocalStorage["yard-tracker-plant-settings"];
  const validUserIds = new Set(database.users.map((user) => user.id));
  const categoriesById = new Map(config.categories.map((category) => [category.id, category]));
  const exclusions: ExcludedRecord[] = [];
  const warnings: string[] = [];

  const locations: PlannedLocation[] = config.zones.map((zone, index) => ({
    id: locationId(zone.id),
    name: zone.label,
    description: zone.description,
    sortOrder: index,
  }));

  const cards: PlannedCard[] = config.categories.map((category, index) => ({
    id: cardId(category.id),
    slug: category.id,
    name: category.name,
    description: category.plants.join(", "),
    careNotes: category.notes ?? null,
    locationIds: config.zones.filter((zone) => zone.plantCategoryIds.includes(category.id)).map((zone) => locationId(zone.id)),
    sortOrder: index,
  }));

  const plans = new Map<string, PlannedPlan>();

  for (const category of config.categories) {
    const categorySettings = settings[category.id];
    if (!categorySettings) {
      warnings.push(`No browser settings found for category ${category.id}; using source recommendations`);
    }

    const configuredTreatments = categorySettings?.fertilizerSettings;
    const treatmentTypes = configuredTreatments
      ? Object.entries(configuredTreatments)
          .filter(([, treatment]) => treatment.enabled)
          .map(([treatmentType]) => treatmentType)
      : category.recommendedFertilizer;

    for (const treatmentType of treatmentTypes) {
      if (treatmentType === "none") continue;
      const metadata = config.treatments[treatmentType];
      const override = configuredTreatments?.[treatmentType]?.intervalDays;
      const id = treatmentPlanId(category.id, treatmentType);
      plans.set(id, {
        id,
        cardId: cardId(category.id),
        name: metadata?.label ?? treatmentType,
        actionType: treatmentType,
        instructions: metadata?.description ?? null,
        enabled: true,
        includeInDigest: true,
        schedule: {
          scheduleType: "relative",
          intervalQuantity: override ?? category.intervalDays,
          intervalUnit: "days",
        },
      });
    }
  }

  function ensureHistoryPlan(categoryId: string, actionType: string, name: string): string | null {
    if (!categoriesById.has(categoryId)) {
      warnings.push(`History references unknown category ${categoryId}`);
      return null;
    }

    const id = treatmentPlanId(categoryId, actionType);
    if (!plans.has(id)) {
      plans.set(id, {
        id,
        cardId: cardId(categoryId),
        name,
        actionType,
        instructions: "Imported historical activity; configure a new schedule if this work should recur.",
        enabled: false,
        includeInDigest: false,
        schedule: null,
      });
    }
    return id;
  }

  const records: PlannedRecord[] = [];

  for (const log of database.fertilizationLogs) {
    if (!validUserIds.has(log.loggedByUserId)) {
      exclusions.push({ table: "fertilizationLogs", id: log.id, reason: "References a non-household test user" });
      continue;
    }
    if (!categoriesById.has(log.categoryId)) {
      exclusions.push({ table: "fertilizationLogs", id: log.id, reason: "References an unknown category" });
      continue;
    }

    const planId = ensureHistoryPlan(log.categoryId, log.fertilizerType, config.treatments[log.fertilizerType]?.label ?? log.fertilizerType);
    records.push({
      id: `legacy-record:fertilizationLogs:${log.id}`,
      planId,
      cardId: cardId(log.categoryId),
      completedOn: dateOnly(log.appliedDate),
      notes: log.notes ?? null,
      source: "manus",
      legacyTable: "fertilizationLogs",
      legacyId: log.id,
    });
  }

  for (const log of database.pestControlLogs) {
    if (!validUserIds.has(log.loggedByUserId)) {
      exclusions.push({ table: "pestControlLogs", id: log.id, reason: "References a synthetic test user" });
      continue;
    }
    if (isFruitTreePestFixture(log)) {
      exclusions.push({ table: "pestControlLogs", id: log.id, reason: "Exact match for the production-polluting pest test fixture" });
      continue;
    }
    if (!categoriesById.has(log.categoryId)) {
      exclusions.push({ table: "pestControlLogs", id: log.id, reason: "References an unknown category" });
      continue;
    }

    const actionType = `pest-control:${normalized(log.treatmentMethod).replaceAll(" ", "-")}`;
    const planId = ensureHistoryPlan(log.categoryId, actionType, `Pest control: ${log.treatmentMethod}`);
    records.push({
      id: `legacy-record:pestControlLogs:${log.id}`,
      planId,
      cardId: cardId(log.categoryId),
      completedOn: dateOnly(log.treatedDate),
      notes: log.notes ?? `${log.pestType} — ${log.treatmentMethod}`,
      source: "manus",
      legacyTable: "pestControlLogs",
      legacyId: log.id,
    });
  }

  for (const log of database.pruningLogs) {
    if (!validUserIds.has(log.loggedByUserId)) {
      exclusions.push({ table: "pruningLogs", id: log.id, reason: "References a synthetic test user" });
      continue;
    }
    if (!categoriesById.has(log.categoryId)) {
      exclusions.push({ table: "pruningLogs", id: log.id, reason: "References an unknown category" });
      continue;
    }

    const actionType = `pruning:${normalized(log.pruningType).replaceAll(" ", "-")}`;
    const planId = ensureHistoryPlan(log.categoryId, actionType, `Pruning: ${log.pruningType}`);
    records.push({
      id: `legacy-record:pruningLogs:${log.id}`,
      planId,
      cardId: cardId(log.categoryId),
      completedOn: dateOnly(log.prunedDate),
      notes: log.notes ?? null,
      source: "manus",
      legacyTable: "pruningLogs",
      legacyId: log.id,
    });
  }

  for (const log of database.taskCompletions) {
    exclusions.push({
      table: "taskCompletions",
      id: log.id,
      reason: log.categoryId.startsWith("test-category-")
        ? "Test-suite task completion"
        : "Legacy task completion requires manual review",
    });
  }

  for (const preference of database.emailPreferences) {
    exclusions.push({
      table: "emailPreferences",
      id: preference.id,
      reason: "Notification settings will be deliberately reconfigured for the shared household digest",
    });
  }

  if ((browser.browserLocalStorage["yard-tracker-custom-categories"]?.length ?? 0) > 0) {
    warnings.push("Custom categories exist and require a future importer extension");
  }

  const fertilizationRecords = records.filter((record) => record.legacyTable === "fertilizationLogs").length;
  const pestControlRecords = records.filter((record) => record.legacyTable === "pestControlLogs").length;
  const pruningRecords = records.filter((record) => record.legacyTable === "pruningLogs").length;
  const plannedPlans = [...plans.values()].sort((left, right) => left.id.localeCompare(right.id));

  return {
    source: {
      legacyCommit: config.sourceCommit,
      browserExportDate: browser.exportDate,
      browserOrigin: browser.origin,
      householdUserCount: database.users.length,
    },
    locations,
    cards,
    plans: plannedPlans,
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
    exclusions: exclusions.sort((left, right) => left.table.localeCompare(right.table) || left.id - right.id),
    warnings,
    summary: {
      cards: cards.length,
      locations: locations.length,
      plans: plannedPlans.length,
      records: records.length,
      exclusions: exclusions.length,
      fertilizationRecords,
      pestControlRecords,
      pruningRecords,
    },
  };
}
