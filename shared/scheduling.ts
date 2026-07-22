export type DateOnly = `${number}-${number}-${number}`;
export type MonthDay = `${number}-${number}`;

export type RelativeSchedule = {
  scheduleType: "relative";
  intervalQuantity: number;
  intervalUnit: "days" | "weeks" | "months" | "years";
  firstDueOn?: DateOnly | null;
};

export type FixedSchedule = {
  scheduleType: "fixed";
  fixedDates: MonthDay[];
  firstDueOn?: DateOnly | null;
};

export type OneTimeSchedule = {
  scheduleType: "one_time";
  oneTimeDueOn: DateOnly;
};

export type Schedule = RelativeSchedule | FixedSchedule | OneTimeSchedule;

export type Completion = {
  completedOn: DateOnly;
  satisfiesDueOn?: DateOnly | null;
};

export type DueState = "unscheduled" | "upcoming" | "due_soon" | "due" | "overdue" | "completed" | "paused";

export type DueResult = {
  state: DueState;
  dueOn: DateOnly | null;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY = /^(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDate(year: number, month: number, day: number): DateOnly {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
}

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function parseMonthDay(value: string): { month: number; day: number } {
  const match = MONTH_DAY.exec(value);
  if (!match) throw new Error(`Invalid month-day value: ${value}`);
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(2000, month)) {
    throw new Error(`Invalid month-day value: ${value}`);
  }
  return { month, day };
}

function dateToEpochDay(value: DateOnly): number {
  const { year, month, day } = parseDate(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function compareDateOnly(left: DateOnly, right: DateOnly): number {
  return dateToEpochDay(left) - dateToEpochDay(right);
}

export function addToDate(value: DateOnly, quantity: number, unit: RelativeSchedule["intervalUnit"]): DateOnly {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Interval quantity must be a positive integer");
  const { year, month, day } = parseDate(value);

  if (unit === "days" || unit === "weeks") {
    const date = new Date(Date.UTC(year, month - 1, day + quantity * (unit === "weeks" ? 7 : 1)));
    return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const monthOffset = unit === "years" ? quantity * 12 : quantity;
  const absoluteMonth = year * 12 + (month - 1) + monthOffset;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  return formatDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

function latestCompletion(completions: Completion[]): Completion | undefined {
  return [...completions].sort((a, b) => compareDateOnly(b.completedOn, a.completedOn))[0];
}

function fixedOccurrence(year: number, monthDay: MonthDay): DateOnly {
  const { month, day } = parseMonthDay(monthDay);
  return formatDate(year, month, Math.min(day, daysInMonth(year, month)));
}

function nextFixedDue(schedule: FixedSchedule, today: DateOnly, completions: Completion[]): DateOnly | null {
  if (schedule.fixedDates.length === 0) return null;
  const { year } = parseDate(today);
  const start = schedule.firstDueOn ?? formatDate(year, 1, 1);
  const satisfied = new Set(completions.map((completion) => completion.satisfiesDueOn).filter(Boolean));
  const occurrences = [year, year + 1]
    .flatMap((candidateYear) => schedule.fixedDates.map((monthDay) => fixedOccurrence(candidateYear, monthDay)))
    .filter((date) => compareDateOnly(date, start) >= 0)
    .sort(compareDateOnly);

  const latestPastOrToday = [...occurrences]
    .filter((date) => compareDateOnly(date, today) <= 0)
    .reverse()
    .find((date) => !satisfied.has(date));
  if (latestPastOrToday) return latestPastOrToday;
  return occurrences.find((date) => compareDateOnly(date, today) > 0 && !satisfied.has(date)) ?? null;
}

function stateForDate(dueOn: DateOnly, today: DateOnly, dueSoonDays: number): DueState {
  const delta = compareDateOnly(dueOn, today);
  if (delta < 0) return "overdue";
  if (delta === 0) return "due";
  if (delta <= dueSoonDays) return "due_soon";
  return "upcoming";
}

export function calculateDue(input: {
  schedule: Schedule | null;
  completions?: Completion[];
  today: DateOnly;
  dueSoonDays?: number;
  enabled?: boolean;
}): DueResult {
  const { schedule, today } = input;
  const completions = input.completions ?? [];
  const dueSoonDays = input.dueSoonDays ?? 14;
  parseDate(today);
  if (!Number.isInteger(dueSoonDays) || dueSoonDays < 0) throw new Error("Due-soon days must be a non-negative integer");
  if (input.enabled === false) return { state: "paused", dueOn: null };
  if (!schedule) return { state: "unscheduled", dueOn: null };

  let dueOn: DateOnly | null;
  if (schedule.scheduleType === "relative") {
    const latest = latestCompletion(completions);
    dueOn = latest
      ? addToDate(latest.completedOn, schedule.intervalQuantity, schedule.intervalUnit)
      : schedule.firstDueOn ?? null;
  } else if (schedule.scheduleType === "fixed") {
    dueOn = nextFixedDue(schedule, today, completions);
  } else {
    if (completions.length > 0) return { state: "completed", dueOn: schedule.oneTimeDueOn };
    dueOn = schedule.oneTimeDueOn;
  }

  if (!dueOn) return { state: "unscheduled", dueOn: null };
  return { state: stateForDate(dueOn, today, dueSoonDays), dueOn };
}
