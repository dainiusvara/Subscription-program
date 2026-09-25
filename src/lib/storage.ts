/**
 * Saving and loading the local copy of the user's data. Everything read back is
 * validated, because localStorage can hold anything: old versions, edits made
 * in dev tools, half-written data.
 */
import { dayOfMonth, isSupportedDate } from "./billing";
import { CATEGORIES, CATEGORY_COLORS, CURRENCIES } from "./catalog";
import { createSampleState } from "./state";
import type { Category, CurrencyCode, Cycle, DripState, ISODate, Subscription } from "./types";

export const STORAGE_KEY = "drip:state";

const CYCLE_VALUES: readonly Cycle[] = ["week", "month", "quarter", "year"];
const MAX_PRICE = 1_000_000;
const MAX_NAME_LENGTH = 80;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE;
}

export function sanitizeSubscription(raw: unknown): Subscription | null {
  if (!isRecord(raw)) return null;
  const { id, name, price, priceAfterTrial, cycle, nextCharge, billingDay, category, color, used, trial } = raw;

  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  if (!isPrice(price)) return null;
  if (!CYCLE_VALUES.includes(cycle as Cycle)) return null;
  if (!isSupportedDate(nextCharge)) return null;

  const safeCategory: Category = CATEGORIES.includes(category as Category) ? (category as Category) : "Other";
  const isTrial = trial === true;

  return {
    id,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    price,
    ...(isTrial ? { priceAfterTrial: isPrice(priceAfterTrial) ? priceAfterTrial : 0 } : {}),
    cycle: cycle as Cycle,
    nextCharge,
    billingDay:
      Number.isInteger(billingDay) && (billingDay as number) >= 1 && (billingDay as number) <= 31
        ? (billingDay as number)
        : dayOfMonth(nextCharge),
    category: safeCategory,
    color: typeof color === "string" && HEX_COLOR.test(color) ? color : CATEGORY_COLORS[safeCategory],
    used: used !== false,
    trial: isTrial,
    ...(raw.shared === true ? { shared: true } : {}),
    ...(isSupportedDate(raw.cancelledOn) ? { cancelledOn: raw.cancelledOn } : {}),
  };
}

/** Returns a clean state, or null when the data isn't a Drip state at all. */
export function sanitizeState(raw: unknown): DripState | null {
  if (!isRecord(raw) || !Array.isArray(raw.subs)) return null;

  const seen = new Set<string>();
  const subs: Subscription[] = [];
  for (const item of raw.subs) {
    const sub = sanitizeSubscription(item);
    if (sub && !seen.has(sub.id)) {
      seen.add(sub.id);
      subs.push(sub);
    }
  }

  const currency: CurrencyCode = CURRENCIES.some((c) => c.code === raw.currency)
    ? (raw.currency as CurrencyCode)
    : "EUR";

  return {
    version: 1,
    subs,
    currency,
    pro: raw.pro === true,
    proPreview: raw.proPreview === true,
    example: raw.example === true,
  };
}

/** Loads saved data, or the example list on a first visit. */
export function loadState(storage: StorageLike | undefined, today: ISODate, makeId: () => string): DripState {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) {
      const state = sanitizeState(JSON.parse(saved));
      if (state) return state;
    }
  } catch {
    // Unreadable storage or invalid JSON: start fresh.
  }
  return createSampleState(today, makeId);
}

/** Returns false when the browser refused to save (storage full or blocked). */
export function saveState(storage: StorageLike | undefined, state: DripState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
