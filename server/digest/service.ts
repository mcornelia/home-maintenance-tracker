import type Database from "better-sqlite3";
import nodemailer from "nodemailer";
import { nanoid } from "nanoid";
import { readDashboard } from "../dashboard/read";

interface DigestSettings {
  displayName: string;
  timezone: string;
  digestCadence: "daily" | "weekly" | "monthly";
  digestDay: number;
  digestLocalTime: string;
}

export interface MailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year); const month = Number(values.month); const day = Number(values.day);
  return { year, month, day, hour: Number(values.hour), minute: Number(values.minute), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), date: `${values.year}-${values.month}-${values.day}` };
}

export function digestPeriod(settings: DigestSettings, now: Date): { due: boolean; key: string } {
  const local = localParts(now, settings.timezone);
  const [targetHour, targetMinute] = settings.digestLocalTime.split(":").map(Number);
  const afterTime = local.hour * 60 + local.minute >= targetHour * 60 + targetMinute;
  if (settings.digestCadence === "daily") return { due: afterTime, key: local.date };
  if (settings.digestCadence === "weekly") {
    const weekStart = new Date(Date.UTC(local.year, local.month - 1, local.day - local.weekday));
    return { due: afterTime && local.weekday === settings.digestDay, key: weekStart.toISOString().slice(0, 10) };
  }
  return { due: afterTime && local.day === settings.digestDay, key: `${local.year}-${String(local.month).padStart(2, "0")}` };
}

function renderDigest(sqlite: Database.Database, settings: DigestSettings, now: Date): Omit<MailMessage, "from" | "to"> {
  const dashboard = readDashboard(sqlite, now);
  const items = dashboard.cards.flatMap((card) => card.plans
    .filter((plan) => plan.enabled && plan.includeInDigest && ["overdue", "due", "due_soon"].includes(plan.state))
    .map((plan) => ({ card: card.name, plan: plan.name, state: plan.state, dueOn: plan.dueOn })));
  const lines = items.length ? items.map((item) => `- ${item.card}: ${item.plan} (${item.state.replace("_", " ")}${item.dueOn ? `, ${item.dueOn}` : ""})`) : ["Nothing is due soon. Ravenwood is caught up."];
  const rows = items.length ? items.map((item) => `<tr><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(item.card)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(item.plan)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(item.state.replace("_", " "))}${item.dueOn ? ` · ${item.dueOn}` : ""}</td></tr>`).join("") : `<tr><td style="padding:12px" colspan="3">Nothing is due soon. Ravenwood is caught up.</td></tr>`;
  return {
    subject: `${settings.displayName}: ${items.length ? `${items.length} items need attention` : "all caught up"}`,
    text: [`Ravenwood — ${settings.displayName}`, "", ...lines, "", "Open Ravenwood on your household network for details."].join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;color:#20251f;max-width:640px"><h1 style="font-family:Georgia,serif">${escapeHtml(settings.displayName)}</h1><p>${items.length ? `${items.length} maintenance items need attention.` : "Everything is on schedule."}</p><table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table><p style="color:#68776f;font-size:13px">Open Ravenwood on your household network for details.</p></div>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function smtpConfigured(environment: NodeJS.ProcessEnv): boolean {
  return Boolean(environment.SMTP_HOST && environment.SMTP_FROM);
}

export async function runDigestIfDue(sqlite: Database.Database, options: { environment?: NodeJS.ProcessEnv; now?: Date; send?: (message: MailMessage) => Promise<void>; force?: boolean } = {}) {
  const environment = options.environment ?? process.env;
  const now = options.now ?? new Date();
  const settings = sqlite.prepare("SELECT display_name AS displayName, timezone, digest_cadence AS digestCadence, digest_day AS digestDay, digest_local_time AS digestLocalTime FROM household_settings WHERE id = 1").get() as DigestSettings | undefined;
  if (!settings) return { status: "unconfigured" as const };
  const recipients = (sqlite.prepare("SELECT email FROM notification_recipients WHERE enabled = 1 ORDER BY email").all() as Array<{ email: string }>).map((row) => row.email);
  if (!recipients.length || !smtpConfigured(environment)) return { status: "unconfigured" as const };
  const period = digestPeriod(settings, now);
  if (!options.force && !period.due) return { status: "not_due" as const, periodKey: period.key };
  const prior = sqlite.prepare("SELECT status FROM scheduler_runs WHERE job_name = 'email-digest' AND period_key = ?").get(period.key) as { status: string } | undefined;
  if (!options.force && prior?.status === "succeeded") return { status: "already_sent" as const, periodKey: period.key };
  const startedAt = now.getTime();
  sqlite.prepare(`INSERT INTO scheduler_runs (id, job_name, period_key, status, started_at) VALUES (?, 'email-digest', ?, 'started', ?)
    ON CONFLICT(job_name, period_key) DO UPDATE SET status = 'started', error_summary = NULL, started_at = excluded.started_at, finished_at = NULL`)
    .run(nanoid(), period.key, startedAt);
  try {
    const content = renderDigest(sqlite, settings, now);
    const message: MailMessage = { ...content, from: environment.SMTP_FROM!, to: recipients };
    if (options.send) await options.send(message);
    else {
      const transporter = nodemailer.createTransport({ host: environment.SMTP_HOST, port: Number(environment.SMTP_PORT ?? 587), secure: environment.SMTP_SECURE === "true", auth: environment.SMTP_USER ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD } : undefined });
      await transporter.sendMail(message);
    }
    sqlite.prepare("UPDATE scheduler_runs SET status = 'succeeded', finished_at = ? WHERE job_name = 'email-digest' AND period_key = ?").run(Date.now(), period.key);
    return { status: "sent" as const, periodKey: period.key, recipients: recipients.length };
  } catch (error) {
    const summary = error instanceof Error ? error.message.slice(0, 500) : "Unknown email error";
    sqlite.prepare("UPDATE scheduler_runs SET status = 'failed', error_summary = ?, finished_at = ? WHERE job_name = 'email-digest' AND period_key = ?").run(summary, Date.now(), period.key);
    return { status: "failed" as const, periodKey: period.key, error: summary };
  }
}
