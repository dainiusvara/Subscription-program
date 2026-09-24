/**
 * The app's single source of truth in the browser. Data lives in localStorage
 * for now (step 2 of the roadmap moves it to Supabase). Components read it
 * with `useDrip()` and change it through `dripActions`.
 */
import { useSyncExternalStore } from "react";
import { todayISO } from "./billing";
import { newId } from "./ids";
import * as transitions from "./state";
import { STORAGE_KEY, loadState, saveState } from "./storage";
import type { CurrencyCode, DripState, ISODate, SubscriptionInput } from "./types";

export interface DripSnapshot {
  state: DripState;
  today: ISODate;
}

let snapshot: DripSnapshot | null = null;
const listeners = new Set<() => void>();
let dayTimer: ReturnType<typeof setInterval> | undefined;

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function read(): DripSnapshot {
  if (!snapshot) {
    const today = todayISO();
    const loaded = loadState(storage(), today, newId);
    const state = transitions.rollState(loaded, today);
    if (state !== loaded) saveState(storage(), state);
    snapshot = { state, today };
  }
  return snapshot;
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: DripState) {
  const { today } = read();
  const state = transitions.rollState(next, today);
  snapshot = { state, today };
  saveState(storage(), state);
  emit();
}

/** Picks up a new day when the app was left open past midnight or resumed from the background. */
function refreshDay() {
  if (!snapshot) return;
  const today = todayISO();
  if (today === snapshot.today) return;
  const state = transitions.rollState(snapshot.state, today);
  if (state !== snapshot.state) saveState(storage(), state);
  snapshot = { state, today };
  emit();
}

/** Another tab changed the data. */
function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  snapshot = null;
  emit();
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") refreshDay();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", onVisibilityChange);
    dayTimer = setInterval(refreshDay, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshDay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(dayTimer);
    }
  };
}

/** The current data, or null during server rendering and hydration. */
export function useDrip(): DripSnapshot | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export const dripActions = {
  /** Returns false when the Free limit blocks the add. */
  add(input: SubscriptionInput): boolean {
    const result = transitions.addSubscription(read().state, input, newId());
    if (!result.ok) return false;
    commit(result.state);
    return true;
  },
  update(id: string, input: SubscriptionInput) {
    commit(transitions.updateSubscription(read().state, id, input));
  },
  remove(id: string) {
    commit(transitions.deleteSubscription(read().state, id));
  },
  toggleUsed(id: string) {
    commit(transitions.toggleUsed(read().state, id));
  },
  clearExamples() {
    commit(transitions.clearExamples(read().state));
  },
  setCurrency(currency: CurrencyCode) {
    commit(transitions.setCurrency(read().state, currency));
  },
  setProPreview(on: boolean) {
    commit(transitions.setProPreview(read().state, on));
  },
};
