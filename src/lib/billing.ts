/**
 * Drip's money and date logic. Pure functions only: no DOM, no storage, no React.
 *
 * Dates are calendar dates (`YYYY-MM-DD`) in the user's local time zone. All
 * arithmetic runs on whole days, so time zones and daylight saving can't shift
 * a charge onto the wrong day.
 */
import { CURRENCIES } from "./catalog";
import type { CurrencyCode, Cycle, ISODate, Subscription } from "./types";

/* ------------------------------------------------------------------------ */
/* Calendar dates                                                           */
/* ------------------------------------------------------------------------ */

interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function parse(iso: string): CalendarDate | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function mustParse(iso: ISODate): CalendarDate {
  const date = parse(iso);
  if (!date) throw new RangeError(`Invalid date "${iso}", expected YYYY-MM-DD`);
  return date;
}

function format({ year, month, day }: CalendarDate): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days since 1970-01-01. */
function toEpochDay({ year, month, day }: CalendarDate): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.round(date.getTime() / DAY_MS);
}

function fromEpochDay(epochDay: number): CalendarDate {
  const date = new Date(epochDay * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && parse(value) !== null;
}

/** Charge dates Drip accepts. Anything outside is a typo (or corrupted data). */
export const MIN_DATE: ISODate = "2000-01-01";
export const MAX_DATE: ISODate = "2100-12-31";

export function isSupportedDate(value: unknown): value is ISODate {
  return isISODate(value) && value >= MIN_DATE && value <= MAX_DATE;
}

/** Today's date on the user's device. */
export function todayISO(now: Date = new Date()): ISODate {
  return format({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function dayOfMonth(iso: ISODate): number {
  return mustParse(iso).day;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return format(fromEpochDay(toEpochDay(mustParse(iso)) + days));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toEpochDay(mustParse(to)) - toEpochDay(mustParse(from));
}

/**
 * Moves a date by whole months. The day is `billingDay` (default: the date's own
 * day), capped at the length of the target month: Jan 31 + 1 month is Feb 28.
 */
export function addMonths(iso: ISODate, months: number, billingDay?: number): ISODate {
  const date = mustParse(iso);
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  const day = Math.min(billingDay ?? date.day, daysInMonth(year, month));
  return format({ year, month, day });
}

/** The charge date one billing cycle after `iso`. */
export function nextCycleDate(iso: ISODate, cycle: Cycle, billingDay?: number): ISODate {
  switch (cycle) {
    case "week":
      return addDays(iso, 7);
    case "month":
      return addMonths(iso, 1, billingDay);
    case "quarter":
      return addMonths(iso, 3, billingDay);
    case "year":
      return addMonths(iso, 12, billingDay);
  }
}

/** "today", "tomorrow", "in 5 days". */
export function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "Oct 3" in the user's locale. */
export function formatShortDate(iso: ISODate, locale?: string): string {
  const { year, month, day } = mustParse(iso);
  return new Date(year, month - 1, day).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------------ */
/* Rolling past dates forward                                               */
/* ------------------------------------------------------------------------ */

const MAX_ROLL_STEPS = 5000;

/**
 * Moves a charge date that has passed to the next one on or after `today`.
 * A free trial whose end date has passed becomes a paid plan at its after-trial price.
 */
export function rollForward(sub: Subscription, today: ISODate): Subscription {
  if (sub.nextCharge >= today) return sub;

  let next = sub.nextCharge;
  for (let step = 0; next < today && step < MAX_ROLL_STEPS; step++) {
    next = nextCycleDate(next, sub.cycle, sub.billingDay);
  }

  if (!sub.trial) return { ...sub, nextCharge: next };

  const { priceAfterTrial, ...paid } = sub;
  return { ...paid, nextCharge: next, trial: false, price: priceAfterTrial ?? sub.price };
}

/** Rolls every subscription forward. Returns the same array when nothing changed. */
export function rollAllForward(subs: Subscription[], today: ISODate): Subscription[] {
  let changed = false;
  const rolled = subs.map((sub) => {
    const next = rollForward(sub, today);
    if (next !== sub) changed = true;
    return next;
  });
  return changed ? rolled : subs;
}

/* ------------------------------------------------------------------------ */
/* Money math                                                               */
/* ------------------------------------------------------------------------ */

/** What a price costs per month: weekly × 52 / 12, quarterly / 3, yearly / 12. */
export function monthlyEquivalent(price: number, cycle: Cycle): number {
  switch (cycle) {
    case "week":
      return (price * 52) / 12;
    case "month":
      return price;
    case "quarter":
      return price / 3;
    case "year":
      return price / 12;
  }
}

/** What each charge will cost. A free trial costs its after-trial price once it ends. */
export function chargeAmount(sub: Subscription): number {
  return sub.trial ? (sub.priceAfterTrial ?? 0) : sub.price;
}

/** What the user pays per month right now. Free trials count as 0 until they end. */
export function monthlyTotal(subs: readonly Subscription[]): number {
  return subs.reduce((sum, sub) => (sub.trial ? sum : sum + monthlyEquivalent(sub.price, sub.cycle)), 0);
}

/** Yearly cost of everything marked as not used, trials at their after-trial price. */
export function yearlySavings(subs: readonly Subscription[]): number {
  const monthly = subs.reduce(
    (sum, sub) => (sub.used ? sum : sum + monthlyEquivalent(chargeAmount(sub), sub.cycle)),
    0,
  );
  return monthly * 12;
}

/* ------------------------------------------------------------------------ */
/* Upcoming charges                                                         */
/* ------------------------------------------------------------------------ */

export const WINDOW_DAYS = 30;

export interface Charge {
  sub: Subscription;
  date: ISODate;
  /** Days from today: 0 is today. */
  day: number;
  amount: number;
  /** A free trial ends on this date and starts charging. */
  trialEnds: boolean;
}

/**
 * Every charge from today up to (not including) `today + days`, repeats included,
 * sorted by date. Expects subscriptions that were already rolled forward.
 */
export function upcomingCharges(
  subs: readonly Subscription[],
  today: ISODate,
  days: number = WINDOW_DAYS,
): Charge[] {
  const charges: Charge[] = [];
  for (const sub of subs) {
    let date = sub.nextCharge;
    let day = daysBetween(today, date);
    // A week is the shortest cycle, so there are never more charges than days.
    for (let n = 0; day < days && n <= days; n++) {
      if (day >= 0) {
        charges.push({ sub, date, day, amount: chargeAmount(sub), trialEnds: sub.trial && n === 0 });
      }
      date = nextCycleDate(date, sub.cycle, sub.billingDay);
      day = daysBetween(today, date);
    }
  }
  return charges.sort((a, b) => a.day - b.day || a.sub.name.localeCompare(b.sub.name));
}

export interface DayTotal {
  date: ISODate;
  amount: number;
  /** A free trial turns into a paid plan on this day. */
  trialEnds: boolean;
}

/** Charges added up per day, one entry for each day in the window. */
export function dailyTotals(
  charges: readonly Charge[],
  today: ISODate,
  days: number = WINDOW_DAYS,
): DayTotal[] {
  const totals: DayTotal[] = Array.from({ length: days }, (_, i) => ({
    date: addDays(today, i),
    amount: 0,
    trialEnds: false,
  }));
  for (const charge of charges) {
    const slot = totals[charge.day];
    if (!slot) continue;
    slot.amount += charge.amount;
    if (charge.trialEnds) slot.trialEnds = true;
  }
  return totals;
}

export interface Summary {
  monthly: number;
  yearly: number;
  count: number;
  /** Total of all charges in the next 30 days. */
  next30: number;
  /** "You could save / yr": what the unused subscriptions cost per year. */
  savings: number;
  charges: Charge[];
}

export function summarize(subs: readonly Subscription[], today: ISODate): Summary {
  const monthly = monthlyTotal(subs);
  const charges = upcomingCharges(subs, today);
  return {
    monthly,
    yearly: monthly * 12,
    count: subs.length,
    next30: charges.reduce((sum, charge) => sum + charge.amount, 0),
    savings: yearlySavings(subs),
    charges,
  };
}

/** Sorted by next charge date, soonest first. */
export function sortByNextCharge(subs: readonly Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => a.nextCharge.localeCompare(b.nextCharge) || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------------ */
/* Formatting and parsing money                                             */
/* ------------------------------------------------------------------------ */

/** Rounds to whole cents, half away from zero (1.005 → 1.01, which plain Math.round gets wrong). */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const cents = Math.round(Number(`${Math.abs(amount).toFixed(10)}e2`));
  return (Math.sign(amount) * cents) / 100 || 0;
}

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? "€";
}

/** "€13.99" */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  return currencySymbol(currency) + roundMoney(amount).toFixed(2);
}

/** Like `formatMoney` but drops ".00": "€14", "€13.99". Used for the chart labels. */
export function formatMoneyShort(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency).replace(/\.00$/, "");
}

const PRICE_INPUT = /^(\d{1,6}(\.\d{0,2})?|\.\d{1,2})$/;

/**
 * Reads a price the user typed. Accepts "9.99", "9,99" (EU keyboards), "€9.99", "12".
 * Returns null for anything else, including negatives and more than 2 decimals.
 */
export function parsePrice(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/^[€$£]\s*/, "")
    .replace(/\s*[€$£]$/, "")
    .replace(",", ".");
  if (!PRICE_INPUT.test(cleaned)) return null;
  return Number(cleaned);
}
