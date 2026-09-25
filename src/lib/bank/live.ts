/**
 * Turning a live bank feed into subscriptions. Pure functions; the sync in
 * bank-sync.ts does the network and database work.
 */
import { addDays, dayOfMonth, isISODate } from "../billing";
import { normalizeName } from "../cancel-guides";
import type { ISODate, Subscription } from "../types";
import { detectSubscriptions, type Candidate } from "./detect";
import type { ApiTransaction } from "./enable-banking";
import type { Transaction } from "./statement";

/**
 * How far back to read. Right after the user logs in at their bank, most banks
 * share a year or more; after that, usually only the last 90 days.
 */
export const FIRST_SYNC_DAYS = 400;
export const DAILY_SYNC_DAYS = 89;

/** A consent lasts this long unless the bank allows less. */
export const CONSENT_DAYS = 180;

/** One booked transaction in the shape the detector reads, or null if it can't be used. */
export function fromApiTransaction(t: ApiTransaction): Transaction | null {
  // Pending card payments change or vanish; they're picked up once booked.
  if (t.status && !/^BOOK/i.test(t.status)) return null;
  const date = [t.booking_date, t.value_date, t.transaction_date].find((d): d is string => isISODate(d));
  const raw = Number(t.transaction_amount?.amount);
  if (!date || !Number.isFinite(raw) || raw === 0) return null;

  const indicator = (t.credit_debit_indicator ?? "").toUpperCase();
  const outgoing = indicator === "DBIT" ? true : indicator === "CRDT" ? false : raw < 0;
  // For a payment the other side is the creditor; the debtor is the user themselves.
  const counterparty = outgoing ? t.creditor?.name : t.debtor?.name;
  const description = [counterparty, ...(t.remittance_information ?? [])]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!description) return null;
  return { date, description, amount: outgoing ? -Math.abs(raw) : Math.abs(raw) };
}

export interface PlannedAdd {
  key: string;
  sub: Subscription;
}

export interface SyncPlan {
  /** New subscriptions to add. */
  add: PlannedAdd[];
  /** Found, but the user already tracks it: remember so it isn't offered again. */
  matched: { key: string; subscriptionId: string | null }[];
}

/**
 * What to do with what the detector found. A merchant is handled once: if the
 * user later deletes the subscription Drip added, it isn't added back.
 * Subscriptions that look stopped (no recent charge) are left alone.
 */
export function planBankSync(
  transactions: readonly Transaction[],
  today: ISODate,
  existing: readonly Subscription[],
  handled: ReadonlySet<string>,
  makeId: () => string,
): SyncPlan {
  const candidates = detectSubscriptions(transactions, today, existing, { newServices: true });
  const plan: SyncPlan = { add: [], matched: [] };
  for (const candidate of candidates) {
    if (handled.has(candidate.key) || candidate.stopped) continue;
    if (candidate.alreadyTracked) {
      plan.matched.push({ key: candidate.key, subscriptionId: findTracked(candidate, existing)?.id ?? null });
      continue;
    }
    plan.add.push({ key: candidate.key, sub: toSubscription(candidate, makeId()) });
  }
  return plan;
}

function findTracked(candidate: Candidate, existing: readonly Subscription[]): Subscription | undefined {
  const name = normalizeName(candidate.name.replace(/ \([\d.]+\)$/, ""));
  return existing.find((s) => {
    const n = normalizeName(s.name);
    return n === name || n.includes(name) || name.includes(n);
  });
}

function toSubscription(candidate: Candidate, id: string): Subscription {
  return {
    id,
    name: candidate.name,
    price: candidate.price,
    cycle: candidate.cycle,
    nextCharge: candidate.nextCharge,
    billingDay: dayOfMonth(candidate.lastCharge),
    category: candidate.category,
    color: candidate.color,
    used: true,
    trial: false,
  };
}

/** The first day to read transactions from. */
export function syncFrom(today: ISODate, first: boolean): ISODate {
  return addDays(today, -(first ? FIRST_SYNC_DAYS : DAILY_SYNC_DAYS));
}

/** When the consent should end: 180 days, or less if the bank caps it. */
export function consentUntil(now: Date, maxConsentSeconds: number | null): Date {
  const days = maxConsentSeconds ? Math.min(CONSENT_DAYS, Math.floor(maxConsentSeconds / 86_400)) : CONSENT_DAYS;
  return new Date(now.getTime() + Math.max(1, days) * 86_400_000);
}
