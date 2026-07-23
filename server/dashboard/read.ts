import type Database from "better-sqlite3";
import { calculateDue, type Completion, type DateOnly, type DueState, type Schedule } from "../../shared/scheduling";

interface CardRow {
  id: string;
  slug: string;
  name: string;
  area: "grounds" | "household";
  category: string;
  description: string | null;
  careNotes: string | null;
  enabled: number;
  sortOrder: number;
  coverAttachmentId: string | null;
}

interface PlanRow {
  id: string;
  cardId: string;
  name: string;
  actionType: string;
  instructions: string | null;
  enabled: number;
  includeInDigest: number;
  scheduleType: "relative" | "fixed" | "one_time" | null;
  intervalQuantity: number | null;
  intervalUnit: "days" | "weeks" | "months" | "years" | null;
  fixedDatesJson: string | null;
  oneTimeDueOn: DateOnly | null;
  firstDueOn: DateOnly | null;
}

interface RecordRow {
  id: string;
  planId: string | null;
  cardId: string;
  completedOn: DateOnly;
  satisfiesDueOn: DateOnly | null;
  notes: string | null;
  planName: string | null;
}

export interface DashboardPlan {
  id: string;
  name: string;
  actionType: string;
  instructions: string | null;
  enabled: boolean;
  includeInDigest: boolean;
  state: DueState;
  dueOn: DateOnly | null;
  lastCompletedOn: DateOnly | null;
  schedule: Schedule | null;
}

export interface DashboardRecord {
  id: string;
  planName: string;
  completedOn: DateOnly;
  notes: string | null;
  photoUrls: string[];
}

export interface DashboardCard {
  id: string;
  slug: string;
  name: string;
  area: "grounds" | "household";
  category: string;
  description: string | null;
  careNotes: string | null;
  enabled: boolean;
  state: DueState;
  nextDueOn: DateOnly | null;
  locationIds: string[];
  locationNames: string[];
  plans: DashboardPlan[];
  recentRecords: DashboardRecord[];
  coverPhotoUrl: string | null;
}

const STATE_PRIORITY: DueState[] = ["overdue", "due", "due_soon", "upcoming", "unscheduled", "completed", "paused"];

function dateInTimezone(now: Date, timezone: string): DateOnly {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}` as DateOnly;
}

function scheduleFromRow(row: PlanRow): Schedule | null {
  if (!row.scheduleType) return null;
  if (row.scheduleType === "relative") {
    if (!row.intervalQuantity || !row.intervalUnit) return null;
    return {
      scheduleType: "relative",
      intervalQuantity: row.intervalQuantity,
      intervalUnit: row.intervalUnit,
      firstDueOn: row.firstDueOn,
    };
  }
  if (row.scheduleType === "fixed") {
    const fixedDates = row.fixedDatesJson ? JSON.parse(row.fixedDatesJson) : [];
    if (!Array.isArray(fixedDates) || !fixedDates.every((value) => typeof value === "string")) return null;
    return { scheduleType: "fixed", fixedDates, firstDueOn: row.firstDueOn } as Schedule;
  }
  return row.oneTimeDueOn ? { scheduleType: "one_time", oneTimeDueOn: row.oneTimeDueOn } : null;
}

export function readDashboard(sqlite: Database.Database, now = new Date()) {
  const settings = sqlite
    .prepare("SELECT display_name AS displayName, timezone, due_soon_days AS dueSoonDays, zip_code AS zipCode, growing_zone AS growingZone, digest_cadence AS digestCadence, digest_day AS digestDay, digest_local_time AS digestLocalTime, backup_destination AS backupDestination, backup_retention_days AS backupRetentionDays FROM household_settings WHERE id = 1")
    .get() as { displayName: string; timezone: string; dueSoonDays: number; zipCode: string | null; growingZone: string | null; digestCadence: "daily" | "weekly" | "monthly"; digestDay: number; digestLocalTime: string; backupDestination: string | null; backupRetentionDays: number } | undefined;
  const household = settings ?? {
    displayName: "Ravenwood",
    timezone: "America/New_York",
    dueSoonDays: 14,
    zipCode: null,
    growingZone: null,
    digestCadence: "weekly" as const,
    digestDay: 0,
    digestLocalTime: "09:00",
    backupDestination: null,
    backupRetentionDays: 30,
  };
  const today = dateInTimezone(now, household.timezone);
  const locations = sqlite
    .prepare("SELECT id, name FROM locations WHERE archived_at IS NULL ORDER BY sort_order, name")
    .all() as Array<{ id: string; name: string }>;
  const notificationRecipients = (sqlite.prepare("SELECT email FROM notification_recipients WHERE enabled = 1 ORDER BY email").all() as Array<{ email: string }>).map((row) => row.email);
  const cards = sqlite
    .prepare("SELECT id, slug, name, area, category, description, care_notes AS careNotes, enabled, sort_order AS sortOrder, cover_attachment_id AS coverAttachmentId FROM cards WHERE archived_at IS NULL ORDER BY sort_order, name")
    .all() as CardRow[];
  const cardLocations = sqlite
    .prepare("SELECT cl.card_id AS cardId, l.id, l.name FROM card_locations cl JOIN locations l ON l.id = cl.location_id WHERE l.archived_at IS NULL ORDER BY l.sort_order, l.name")
    .all() as Array<{ cardId: string; id: string; name: string }>;
  const plans = sqlite
    .prepare(`SELECT p.id, p.card_id AS cardId, p.name, p.action_type AS actionType, p.instructions,
      p.enabled, p.include_in_digest AS includeInDigest, s.schedule_type AS scheduleType, s.interval_quantity AS intervalQuantity,
      s.interval_unit AS intervalUnit, s.fixed_dates_json AS fixedDatesJson,
      s.one_time_due_on AS oneTimeDueOn, s.first_due_on AS firstDueOn
      FROM maintenance_plans p LEFT JOIN plan_schedules s ON s.plan_id = p.id
      WHERE p.archived_at IS NULL ORDER BY p.name`)
    .all() as PlanRow[];
  const records = sqlite
    .prepare(`SELECT r.id, r.plan_id AS planId, r.card_id AS cardId, r.completed_on AS completedOn,
      r.satisfies_due_on AS satisfiesDueOn, r.notes, p.name AS planName
      FROM maintenance_records r LEFT JOIN maintenance_plans p ON p.id = r.plan_id
      ORDER BY r.completed_on DESC, r.created_at DESC`)
    .all() as RecordRow[];
  const attachmentRows = sqlite
    .prepare("SELECT id, maintenance_record_id AS recordId FROM attachments ORDER BY created_at")
    .all() as Array<{ id: string; recordId: string | null }>;

  const dashboardCards: DashboardCard[] = cards.map((card) => {
    const cardRecords = records.filter((record) => record.cardId === card.id);
    const dashboardPlans: DashboardPlan[] = plans
      .filter((plan) => plan.cardId === card.id)
      .map((plan) => {
        const completions: Completion[] = cardRecords
          .filter((record) => record.planId === plan.id)
          .map((record) => ({ completedOn: record.completedOn, satisfiesDueOn: record.satisfiesDueOn }));
        const schedule = scheduleFromRow(plan);
        const due = calculateDue({
          schedule,
          completions,
          today,
          dueSoonDays: household.dueSoonDays,
          enabled: Boolean(card.enabled && plan.enabled),
        });
        return {
          id: plan.id,
          name: plan.name,
          actionType: plan.actionType,
          instructions: plan.instructions,
          enabled: Boolean(plan.enabled),
          includeInDigest: Boolean(plan.includeInDigest),
          state: due.state,
          dueOn: due.dueOn,
          lastCompletedOn: completions.map((completion) => completion.completedOn).sort().at(-1) ?? null,
          schedule,
        };
      });
    const activeStates = dashboardPlans.filter((plan) => plan.enabled).map((plan) => plan.state);
    const state = card.enabled
      ? (STATE_PRIORITY.find((candidate) => activeStates.includes(candidate)) ?? "unscheduled")
      : "paused";
    const datedPlans = dashboardPlans
      .filter((plan) => plan.dueOn && ["overdue", "due", "due_soon", "upcoming"].includes(plan.state))
      .sort((left, right) => left.dueOn!.localeCompare(right.dueOn!));
    const assignedLocations = cardLocations.filter((location) => location.cardId === card.id);

    return {
      id: card.id,
      slug: card.slug,
      name: card.name,
      area: card.area,
      category: card.category,
      description: card.description,
      careNotes: card.careNotes,
      enabled: Boolean(card.enabled),
      state,
      nextDueOn: datedPlans[0]?.dueOn ?? null,
      locationIds: assignedLocations.map((location) => location.id),
      locationNames: assignedLocations.map((location) => location.name),
      plans: dashboardPlans,
      recentRecords: cardRecords.slice(0, 3).map((record) => ({
        id: record.id,
        planName: record.planName ?? "Maintenance",
        completedOn: record.completedOn,
        notes: record.notes,
        photoUrls: attachmentRows.filter((attachment) => attachment.recordId === record.id).map((attachment) => `/api/attachments/${encodeURIComponent(attachment.id)}/thumbnail`),
      })),
      coverPhotoUrl: card.coverAttachmentId ? `/api/attachments/${encodeURIComponent(card.coverAttachmentId)}/thumbnail` : null,
    };
  });

  const counts = Object.fromEntries(STATE_PRIORITY.map((state) => [state, dashboardCards.filter((card) => card.state === state).length]));
  return {
    household,
    notificationRecipients,
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
    today,
    locations,
    counts,
    cards: dashboardCards,
    recentActivity: records.slice(0, 8).map((record) => ({
      id: record.id,
      cardName: cards.find((card) => card.id === record.cardId)?.name ?? "Unknown card",
      planName: record.planName ?? "Maintenance",
      completedOn: record.completedOn,
      notes: record.notes,
    })),
  };
}
