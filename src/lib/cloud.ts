/**
 * Pure helpers for syncing with the cloud database: mapping rows, working out
 * what changed, and the outbox of changes waiting to be sent. No network calls
 * here, so everything is unit-tested.
 */
import { newId } from "./ids";
import { sanitizeSubscription } from "./storage";
import type { CurrencyCode, Subscription } from "./types";

/** A row of the `subscriptions` table (see supabase/migrations). */
export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  price: number;
  price_after_trial: number | null;
  cycle: string;
  next_charge: string;
  billing_day: number;
  category: string;
  color: string;
  used: boolean;
  trial: boolean;
  /** Set when shared with the family. */
  household_id?: string | null;
  /** Set when the user cancelled it. */
  cancelled_on?: string | null;
}

export const SUBSCRIPTION_COLUMNS =
  "id, user_id, name, price, price_after_trial, cycle, next_charge, billing_day, category, color, used, trial, household_id, cancelled_on";

/** `householdId` is the user's family, used when the subscription is shared. */
export function toRow(sub: Subscription, userId: string, householdId: string | null = null): SubscriptionRow {
  return {
    id: sub.id,
    user_id: userId,
    name: sub.name,
    price: sub.price,
    price_after_trial: sub.trial ? (sub.priceAfterTrial ?? 0) : null,
    cycle: sub.cycle,
    next_charge: sub.nextCharge,
    billing_day: sub.billingDay,
    category: sub.category,
    color: sub.color,
    used: sub.used,
    trial: sub.trial,
    household_id: sub.shared && householdId ? householdId : null,
    cancelled_on: sub.cancelledOn ?? null,
  };
}

/** Returns null for a row that doesn't pass the same checks as local data. */
export function fromRow(row: SubscriptionRow): Subscription | null {
  return sanitizeSubscription({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    priceAfterTrial: row.price_after_trial === null ? undefined : Number(row.price_after_trial),
    cycle: row.cycle,
    nextCharge: row.next_charge,
    billingDay: row.billing_day,
    category: row.category,
    color: row.color,
    used: row.used,
    trial: row.trial,
    shared: Boolean(row.household_id),
    cancelledOn: row.cancelled_on ?? undefined,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database needs UUID ids; data saved by very early versions may not have them. */
export function withUuid(sub: Subscription, makeId: () => string = newId): Subscription {
  return UUID.test(sub.id) ? sub : { ...sub, id: makeId() };
}

/* ------------------------------------------------------------------------ */
/* Outbox: changes made on this device that the server hasn't confirmed yet  */
/* ------------------------------------------------------------------------ */

export type OutboxOp =
  | { kind: "upsert"; sub: Subscription }
  | { kind: "delete"; id: string }
  | { kind: "currency"; currency: CurrencyCode };

function opKey(op: OutboxOp): string {
  if (op.kind === "currency") return "currency";
  return `sub:${op.kind === "upsert" ? op.sub.id : op.id}`;
}

/** Adds changes, keeping only the latest one per subscription (and per setting). */
export function enqueue(outbox: readonly OutboxOp[], ops: readonly OutboxOp[]): OutboxOp[] {
  const replaced = new Set(ops.map(opKey));
  return [...outbox.filter((op) => !replaced.has(opKey(op))), ...ops];
}

/** The changes that turn `prev` into `next`. */
export function diffSubs(prev: readonly Subscription[], next: readonly Subscription[]): OutboxOp[] {
  const before = new Map(prev.map((sub) => [sub.id, sub]));
  const after = new Set(next.map((sub) => sub.id));
  const ops: OutboxOp[] = [];
  for (const sub of next) {
    const old = before.get(sub.id);
    if (!old || !sameSubscription(old, sub)) ops.push({ kind: "upsert", sub });
  }
  for (const sub of prev) {
    if (!after.has(sub.id)) ops.push({ kind: "delete", id: sub.id });
  }
  return ops;
}

function sameSubscription(a: Subscription, b: Subscription): boolean {
  return (
    a.name === b.name &&
    a.price === b.price &&
    (a.priceAfterTrial ?? null) === (b.priceAfterTrial ?? null) &&
    a.cycle === b.cycle &&
    a.nextCharge === b.nextCharge &&
    a.billingDay === b.billingDay &&
    a.category === b.category &&
    a.color === b.color &&
    a.used === b.used &&
    a.trial === b.trial &&
    Boolean(a.shared) === Boolean(b.shared) &&
    (a.cancelledOn ?? null) === (b.cancelledOn ?? null)
  );
}

/** The server's list with this device's unsent changes laid on top. */
export function applyOutbox(subs: readonly Subscription[], outbox: readonly OutboxOp[]): Subscription[] {
  const byId = new Map(subs.map((sub) => [sub.id, sub]));
  for (const op of outbox) {
    if (op.kind === "upsert") byId.set(op.sub.id, op.sub);
    else if (op.kind === "delete") byId.delete(op.id);
  }
  return [...byId.values()];
}

/** The currency change waiting to be sent, if any. */
export function pendingCurrency(outbox: readonly OutboxOp[]): CurrencyCode | null {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const op = outbox[i];
    if (op.kind === "currency") return op.currency;
  }
  return null;
}

/**
 * Errors from supabase-js carry a Postgres/PostgREST code when the server
 * answered. No code means the request never got there (offline, DNS, timeout).
 */
export function isNetworkError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error) && !error?.code;
}

/** A readable reason for a change the server refused. */
export function describeRejection(error: { message?: string; hint?: string }): string {
  if (error.hint === "free_limit" || /Free plan covers/i.test(error.message ?? "")) {
    return "The Free plan covers 5 subscriptions.";
  }
  return "The server didn't accept this change.";
}
