/**
 * State transitions for the subscription list. Pure functions: each takes the
 * current state and returns a new one, so they're easy to test and to reuse
 * when the data moves to the cloud database.
 */
import { addDays, dayOfMonth, rollAllForward } from "./billing";
import { CATEGORY_COLORS, FREE_LIMIT } from "./catalog";
import type { CurrencyCode, DripState, ISODate, Subscription, SubscriptionInput } from "./types";

type MakeId = () => string;

/** The example list a first-time visitor sees, dated relative to today. */
export function createSampleState(today: ISODate, makeId: MakeId): DripState {
  const sub = (
    fields: Omit<Subscription, "id" | "nextCharge" | "billingDay">,
    inDays: number,
  ): Subscription => {
    const nextCharge = addDays(today, inDays);
    return { id: makeId(), nextCharge, billingDay: dayOfMonth(nextCharge), ...fields };
  };
  return {
    version: 1,
    currency: "EUR",
    pro: false,
    proPreview: false,
    example: true,
    subs: [
      sub({ name: "Netflix", price: 13.99, cycle: "month", category: "Streaming", color: "#B81D24", used: true, trial: false }, 3),
      sub({ name: "Spotify", price: 11.99, cycle: "month", category: "Music", color: "#1A9E4B", used: true, trial: false }, 9),
      sub({ name: "Xbox Game Pass", price: 14.99, cycle: "month", category: "Gaming", color: "#1F7A1F", used: false, trial: false }, 16),
      sub({ name: "Disney+", price: 0, priceAfterTrial: 9.99, cycle: "month", category: "Streaming", color: "#1D3C8F", used: false, trial: true }, 5),
      sub({ name: "iCloud+", price: 29.99, cycle: "year", category: "Cloud storage", color: "#3A7BD5", used: true, trial: false }, 24),
    ],
  };
}

export function hasPro(state: DripState): boolean {
  return state.pro || state.proPreview;
}

export function isAtFreeLimit(state: DripState): boolean {
  return !hasPro(state) && state.subs.length >= FREE_LIMIT;
}

/** Applies the form input to a new or existing subscription. */
function applyInput(input: SubscriptionInput, existing?: Subscription): Omit<Subscription, "id" | "used"> {
  // Keep the billing day when the date wasn't touched, so an edit on Feb 28
  // doesn't turn a plan billed on the 31st into one billed on the 28th.
  const billingDay =
    existing && existing.nextCharge === input.nextCharge ? existing.billingDay : dayOfMonth(input.nextCharge);

  // A logo that was just its category's colour follows the category.
  const keptColor =
    existing && existing.color !== CATEGORY_COLORS[existing.category] ? existing.color : undefined;

  return {
    name: input.name.trim(),
    price: input.trial ? 0 : input.price,
    ...(input.trial ? { priceAfterTrial: input.price } : {}),
    cycle: input.cycle,
    nextCharge: input.nextCharge,
    billingDay,
    category: input.category,
    color: input.color ?? keptColor ?? CATEGORY_COLORS[input.category],
    trial: input.trial,
  };
}

export type AddResult =
  | { ok: true; state: DripState; sub: Subscription }
  | { ok: false; reason: "limit" };

export function addSubscription(state: DripState, input: SubscriptionInput, id: string): AddResult {
  // The first subscription the user adds replaces the examples.
  const base: DripState = state.example ? { ...state, subs: [], example: false } : state;
  if (isAtFreeLimit(base)) return { ok: false, reason: "limit" };
  const sub: Subscription = { id, used: true, ...applyInput(input) };
  return { ok: true, state: { ...base, subs: [...base.subs, sub] }, sub };
}

export function updateSubscription(state: DripState, id: string, input: SubscriptionInput): DripState {
  return {
    ...state,
    subs: state.subs.map((sub) => (sub.id === id ? { id, used: sub.used, ...applyInput(input, sub) } : sub)),
  };
}

export function deleteSubscription(state: DripState, id: string): DripState {
  return { ...state, subs: state.subs.filter((sub) => sub.id !== id) };
}

export function toggleUsed(state: DripState, id: string): DripState {
  return { ...state, subs: state.subs.map((sub) => (sub.id === id ? { ...sub, used: !sub.used } : sub)) };
}

export function clearExamples(state: DripState): DripState {
  return { ...state, subs: [], example: false };
}

export function setCurrency(state: DripState, currency: CurrencyCode): DripState {
  return { ...state, currency };
}

export function setProPreview(state: DripState, proPreview: boolean): DripState {
  return { ...state, proPreview };
}

/** Moves past charge dates forward. Returns the same object when nothing changed. */
export function rollState(state: DripState, today: ISODate): DripState {
  const subs = rollAllForward(state.subs, today);
  return subs === state.subs ? state : { ...state, subs };
}
