/**
 * Which reminders are due and what they say. Pure functions: the daily job in
 * reminder-job.ts does the database work and the sending.
 */
import { CYCLE_UNITS } from "./catalog";
import { formatMoney, relativeDay, rollAllForward, upcomingCharges } from "./billing";
import type { CurrencyCode, ISODate, Subscription } from "./types";

/** Remind this many days before a charge (and before a free trial ends). */
export const REMIND_DAYS = 3;

export interface Reminder {
  subscriptionId: string;
  name: string;
  chargeDate: ISODate;
  daysAway: number;
  amount: number;
  /** The charge is a free trial turning into a paid plan. */
  trialEnds: boolean;
  unit: string;
}

export function reminderKey(subscriptionId: string, chargeDate: ISODate): string {
  return `${subscriptionId}:${chargeDate}`;
}

/**
 * Charges from today up to REMIND_DAYS days away that haven't been reminded
 * yet. Charges closer than 3 days still get one (e.g. a subscription added the
 * day before it charges, or a day the job didn't run).
 */
export function dueReminders(subs: readonly Subscription[], today: ISODate, alreadySent: ReadonlySet<string>): Reminder[] {
  return upcomingCharges(rollAllForward([...subs], today), today, REMIND_DAYS + 1)
    .filter((charge) => !alreadySent.has(reminderKey(charge.sub.id, charge.date)))
    .map((charge) => ({
      subscriptionId: charge.sub.id,
      name: charge.sub.name,
      chargeDate: charge.date,
      daysAway: charge.day,
      amount: charge.amount,
      trialEnds: charge.trialEnds,
      unit: CYCLE_UNITS[charge.sub.cycle],
    }));
}

/** Today's date in an IANA time zone. Falls back to UTC for unknown zones. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 27 Sep". Spelled out by hand: server locale data varies ("Sep" vs "Sept"). */
function longDate(iso: ISODate): string {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month - 1]}`;
}

function line(reminder: Reminder, currency: CurrencyCode): string {
  const when = `${longDate(reminder.chargeDate)} (${relativeDay(reminder.daysAway)})`;
  const price = formatMoney(reminder.amount, currency);
  return reminder.trialEnds
    ? `${reminder.name}: free trial ends ${when}, then ${price} / ${reminder.unit}`
    : `${reminder.name}: ${price} on ${when}`;
}

function headline(reminders: readonly Reminder[], currency: CurrencyCode): string {
  if (reminders.length === 1) {
    const [only] = reminders;
    return only.trialEnds
      ? `Your ${only.name} free trial ends ${relativeDay(only.daysAway)}`
      : `${only.name} charges you ${formatMoney(only.amount, currency)} ${relativeDay(only.daysAway)}`;
  }
  const total = reminders.reduce((sum, r) => sum + r.amount, 0);
  return `${reminders.length} charges coming up: ${formatMoney(total, currency)} in the next ${REMIND_DAYS} days`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

export function reminderEmail(reminders: readonly Reminder[], currency: CurrencyCode, siteUrl: string): EmailMessage {
  const subject = headline(reminders, currency);
  const lines = reminders.map((r) => line(r, currency));
  const cancelHint = "Not using one of these? Cancel it before it charges, then delete it in Drip.";
  const footer = `You get these because reminders are on in Drip. Turn them off in the app: ${siteUrl}`;
  const text = [subject, "", ...lines.map((l) => `- ${l}`), "", cancelHint, "", footer].join("\n");
  const html = `<div style="font-family:Figtree,'Segoe UI',system-ui,sans-serif;color:#15201C;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>
<ul style="padding-left:18px;margin:0 0 16px">${lines.map((l) => `<li style="margin:0 0 6px">${escapeHtml(l)}</li>`).join("")}</ul>
<p style="margin:0 0 16px">${escapeHtml(cancelHint)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(siteUrl)}" style="background:#0A6F6A;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Open Drip</a></p>
<p style="margin:0;font-size:12px;color:#5B6A64">You get these because reminders are on in Drip. You can turn them off in the app.</p>
</div>`;
  return { subject, text, html };
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function reminderPush(reminders: readonly Reminder[], currency: CurrencyCode): PushMessage {
  return {
    title: headline(reminders, currency),
    body: reminders.map((r) => line(r, currency)).join("\n"),
    url: "/",
    tag: `drip-${reminders.map((r) => reminderKey(r.subscriptionId, r.chargeDate)).join(",")}`.slice(0, 120),
  };
}
