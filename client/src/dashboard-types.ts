export type DueState = "unscheduled" | "upcoming" | "due_soon" | "due" | "overdue" | "completed" | "paused";

export type Schedule =
  | { scheduleType: "relative"; intervalQuantity: number; intervalUnit: "days" | "weeks" | "months" | "years"; firstDueOn?: string | null }
  | { scheduleType: "fixed"; fixedDates: string[]; firstDueOn?: string | null }
  | { scheduleType: "one_time"; oneTimeDueOn: string };

export interface DashboardPlan {
  id: string;
  name: string;
  actionType: string;
  instructions: string | null;
  enabled: boolean;
  includeInDigest: boolean;
  state: DueState;
  dueOn: string | null;
  lastCompletedOn: string | null;
  schedule: Schedule | null;
}

export interface DashboardCard {
  id: string;
  name: string;
  description: string | null;
  careNotes: string | null;
  enabled: boolean;
  state: DueState;
  nextDueOn: string | null;
  locationIds: string[];
  locationNames: string[];
  plans: DashboardPlan[];
  recentRecords: Array<{ id: string; planName: string; completedOn: string; notes: string | null; photoUrls: string[] }>;
  coverPhotoUrl: string | null;
}

export interface DashboardData {
  household: { displayName: string; zipCode: string | null; growingZone: string | null; dueSoonDays: number; digestCadence: "daily" | "weekly" | "monthly"; digestDay: number; digestLocalTime: string; backupDestination: string | null; backupRetentionDays: number };
  notificationRecipients: string[];
  smtpConfigured: boolean;
  today: string;
  locations: Array<{ id: string; name: string }>;
  counts: Record<DueState, number>;
  cards: DashboardCard[];
  recentActivity: Array<{ id: string; cardName: string; planName: string; completedOn: string; notes: string | null }>;
}

export type EditorState =
  | { kind: "settings" }
  | { kind: "card"; card?: DashboardCard }
  | { kind: "plan"; card: DashboardCard; plan?: DashboardPlan }
  | { kind: "complete"; card: DashboardCard; plan: DashboardPlan };
