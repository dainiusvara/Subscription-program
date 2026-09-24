/**
 * The app's single source of truth in the browser. Components read it with
 * `useDrip()` and change it through `dripActions` / `dripAuth`.
 *
 * - Signed out ("local"): data lives in localStorage on this device.
 * - Signed in ("cloud"): data lives in the Supabase account. This device keeps
 *   a cached copy plus an outbox of changes the server hasn't confirmed yet, so
 *   the app opens and works offline and catches up when the connection returns.
 */
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { todayISO } from "./billing";
import { CURRENCIES } from "./catalog";
import { applyOutbox, diffSubs, enqueue, pendingCurrency, withUuid, type OutboxOp } from "./cloud";
import { cloudConfigured, paymentsEnabled } from "./config";
import { newId } from "./ids";
import { disablePush } from "./push";
import * as transitions from "./state";
import { STORAGE_KEY, loadState, sanitizeState, sanitizeSubscription, saveState } from "./storage";
import { authedFetch, getSupabase } from "./supabase/browser";
import { pullAccount, pushOps } from "./sync";
import type { CurrencyCode, DripState, ISODate, SubscriptionInput } from "./types";

export type Account =
  | { kind: "local" }
  | {
      kind: "cloud";
      userId: string;
      email: string;
      pending: number;
      syncing: boolean;
      offline: boolean;
      /** Email reminders 3 days before each charge (Pro). */
      remindEmail: boolean;
    };

export interface Notice {
  id: number;
  text: string;
}

export interface DripSnapshot {
  state: DripState;
  today: ISODate;
  account: Account;
  /** A short message for the toast. */
  notice: Notice | null;
  /** Accounts are configured for this deployment. */
  cloudAvailable: boolean;
}

const CLOUD_KEY = "drip:cloud";
/** Unsent changes kept after an unexpected sign-out, restored when the same user signs back in. */
const PENDING_KEY = "drip:pending";
const NOTICE_MS = 2600;

interface CloudCache {
  userId: string;
  email: string;
  state: DripState;
  outbox: OutboxOp[];
  remindEmail: boolean;
}

let snapshot: DripSnapshot | null = null;
let cloud: CloudCache | null = null;
let syncing = false;
let offline = false;
let flushing = false;
let flushAgain = false;
let notice: Notice | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let authStarted = false;
const listeners = new Set<() => void>();
let dayTimer: ReturnType<typeof setInterval> | undefined;

/* ------------------------------------------------------------------------ */
/* Persistence                                                              */
/* ------------------------------------------------------------------------ */

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function sanitizeOps(raw: unknown): OutboxOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: OutboxOp[] = [];
  for (const item of raw) {
    if (item?.kind === "upsert") {
      const sub = sanitizeSubscription(item.sub);
      if (sub) ops.push({ kind: "upsert", sub });
    } else if (item?.kind === "delete" && typeof item.id === "string") {
      ops.push({ kind: "delete", id: item.id });
    } else if (item?.kind === "currency" && CURRENCIES.some((c) => c.code === item.currency)) {
      ops.push({ kind: "currency", currency: item.currency });
    }
  }
  return ops;
}

function loadCloud(): CloudCache | null {
  try {
    const raw = JSON.parse(storage()?.getItem(CLOUD_KEY) ?? "null");
    const state = sanitizeState(raw?.state);
    if (typeof raw?.userId !== "string" || !state) return null;
    return {
      userId: raw.userId,
      email: typeof raw.email === "string" ? raw.email : "",
      state,
      outbox: sanitizeOps(raw.outbox),
      remindEmail: raw.remindEmail !== false,
    };
  } catch {
    return null;
  }
}

function saveCloud(cache: CloudCache | null) {
  try {
    if (cache) storage()?.setItem(CLOUD_KEY, JSON.stringify(cache));
    else storage()?.removeItem(CLOUD_KEY);
  } catch {
    // Storage full or blocked: the in-memory copy keeps working for this visit.
  }
}

function savePending(userId: string, outbox: OutboxOp[]) {
  try {
    storage()?.setItem(PENDING_KEY, JSON.stringify({ userId, outbox }));
  } catch {
    // Nothing more we can do.
  }
}

function takePending(userId: string): OutboxOp[] {
  try {
    const raw = JSON.parse(storage()?.getItem(PENDING_KEY) ?? "null");
    if (raw?.userId !== userId) return [];
    storage()?.removeItem(PENDING_KEY);
    return sanitizeOps(raw.outbox);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------------ */
/* Snapshot                                                                 */
/* ------------------------------------------------------------------------ */

function build(state: DripState, today: ISODate): DripSnapshot {
  return {
    state,
    today,
    account: cloud
      ? {
          kind: "cloud",
          userId: cloud.userId,
          email: cloud.email,
          pending: cloud.outbox.length,
          syncing,
          offline,
          remindEmail: cloud.remindEmail,
        }
      : { kind: "local" },
    notice,
    cloudAvailable: cloudConfigured,
  };
}

function read(): DripSnapshot {
  if (!snapshot) {
    const today = todayISO();
    cloud = cloudConfigured ? loadCloud() : null;
    if (cloud) {
      snapshot = build(transitions.rollState(cloud.state, today), today);
    } else {
      const loaded = loadState(storage(), today, newId);
      const state = transitions.rollState(loaded, today);
      if (state !== loaded) saveState(storage(), state);
      snapshot = build(state, today);
    }
  }
  return snapshot;
}

function emit() {
  for (const listener of listeners) listener();
}

/** Saves and shows a new state (to the account cache when signed in). */
function publish(state: DripState) {
  const { today } = read();
  if (cloud) {
    cloud = { ...cloud, state };
    saveCloud(cloud);
  } else {
    saveState(storage(), state);
  }
  snapshot = build(state, today);
  emit();
}

/** Re-renders after a change to account status or the notice. */
function refresh() {
  if (!snapshot) return;
  snapshot = build(snapshot.state, snapshot.today);
  emit();
}

function notify(text: string) {
  notice = { id: (notice?.id ?? 0) + 1, text };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice = null;
    refresh();
  }, NOTICE_MS);
  refresh();
}

/** Applies a user's change: saved locally at once, and queued for the account when signed in. */
function commit(next: DripState) {
  const { state: prev, today } = read();
  const state = transitions.rollState(next, today);
  if (cloud) {
    const ops = diffSubs(prev.subs, state.subs);
    if (prev.currency !== state.currency) ops.push({ kind: "currency", currency: state.currency });
    cloud = { ...cloud, outbox: enqueue(cloud.outbox, ops) };
  }
  publish(state);
  if (cloud) void flush();
}

/* ------------------------------------------------------------------------ */
/* Sync with the account                                                    */
/* ------------------------------------------------------------------------ */

async function hasSession(): Promise<boolean> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  return Boolean(data.session);
}

/** Sends queued changes. Changes stay queued while offline. */
async function flush() {
  const supabase = getSupabase();
  if (!supabase || !cloud || cloud.outbox.length === 0) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  syncing = true;
  refresh();
  try {
    if (!(await hasSession())) return;
    const { userId } = cloud;
    const result = await pushOps(supabase, userId, cloud.outbox);
    if (!cloud || cloud.userId !== userId) return;
    const done = new Set<OutboxOp>([...result.sent, ...result.rejected.map((r) => r.op)]);
    cloud = { ...cloud, outbox: cloud.outbox.filter((op) => !done.has(op)) };
    saveCloud(cloud);
    offline = result.offline;
    if (result.rejected.length > 0) {
      notify(`Couldn't save a change. ${result.rejected[0].reason}`);
      await pull();
    }
  } finally {
    flushing = false;
    syncing = false;
    refresh();
    if (flushAgain && !offline) {
      flushAgain = false;
      void flush();
    }
  }
}

/** Reads the account's data and lays this device's unsent changes on top. */
async function pull() {
  const supabase = getSupabase();
  if (!supabase || !cloud || !(await hasSession())) return;
  const { userId } = cloud;
  const result = await pullAccount(supabase, userId);
  if (!cloud || cloud.userId !== userId) return;
  if (!result.ok) {
    offline = result.offline;
    refresh();
    return;
  }
  offline = false;
  const { state: current, today } = read();
  const { data } = result;
  cloud = { ...cloud, remindEmail: data.remindEmail };
  // Reminders go out in the user's own time zone: keep it up to date.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone && timezone !== data.timezone) {
    // Supabase queries only run once awaited; errors just mean we try again next sync.
    void supabase.from("profiles").update({ timezone }).eq("id", userId).then(() => undefined);
  }
  publish(
    transitions.rollState(
      {
        ...current,
        subs: applyOutbox(data.subs, cloud.outbox),
        currency: pendingCurrency(cloud.outbox) ?? data.currency,
        pro: data.pro,
        proPreview: data.proPreview && !paymentsEnabled,
        example: false,
      },
      today,
    ),
  );
}

async function sync() {
  await flush();
  await pull();
}

/** Signed in: move this device's own subscriptions into the account. */
function enterCloud(userId: string, email: string) {
  if (cloud && cloud.userId !== userId) leaveCloud();
  const local = read().state;
  const moved = local.example ? [] : local.subs.map((sub) => withUuid(sub));
  const ops: OutboxOp[] = [...takePending(userId), ...moved.map((sub): OutboxOp => ({ kind: "upsert", sub }))];
  if (!local.example && local.currency !== "EUR") ops.push({ kind: "currency", currency: local.currency });

  cloud = {
    userId,
    email,
    outbox: enqueue([], ops),
    state: { version: 1, subs: applyOutbox([], ops), currency: local.currency, pro: false, proPreview: false, example: false },
    remindEmail: true,
  };
  // The device's list now lives in the account.
  saveState(storage(), { ...local, subs: [], example: false, pro: false, proPreview: false });
  publish(cloud.state);
  notify(
    moved.length > 0
      ? `Signed in. Added ${moved.length} ${moved.length === 1 ? "subscription" : "subscriptions"} from this device to your account.`
      : "Signed in",
  );
}

/** Signed out: back to this device's own list. */
function leaveCloud() {
  if (cloud && cloud.outbox.length > 0) savePending(cloud.userId, cloud.outbox);
  cloud = null;
  offline = false;
  saveCloud(null);
  const { today } = read();
  publish(transitions.rollState(loadState(storage(), today, newId), today));
}

async function onSession(event: string, session: Session | null) {
  const user = session?.user;
  if (user) {
    if (!cloud || cloud.userId !== user.id) enterCloud(user.id, user.email ?? "");
    await sync();
  } else if (cloud && (event === "SIGNED_OUT" || navigator.onLine)) {
    // A missing session while offline may just be an expired token; keep the cache until we know.
    leaveCloud();
  }
}

function startAuth() {
  const supabase = getSupabase();
  if (!supabase || authStarted) return;
  authStarted = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // Calling Supabase inside this callback can deadlock, so continue on the next tick.
    setTimeout(() => void onSession(event, session), 0);
  });
}

/* ------------------------------------------------------------------------ */
/* Subscribing                                                              */
/* ------------------------------------------------------------------------ */

/** Picks up a new day when the app was left open past midnight or resumed from the background. */
function refreshDay() {
  if (!snapshot) return;
  const today = todayISO();
  if (today === snapshot.today) return;
  const state = transitions.rollState(snapshot.state, today);
  snapshot = build(state, today);
  if (cloud) {
    cloud = { ...cloud, state };
    saveCloud(cloud);
  } else {
    saveState(storage(), state);
  }
  emit();
}

/** Another tab changed the data. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY && event.key !== CLOUD_KEY) return;
  snapshot = null;
  emit();
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  refreshDay();
  if (cloud) void sync();
}

function onOnline() {
  if (cloud) void sync();
}

function onTick() {
  refreshDay();
  if (cloud && cloud.outbox.length > 0) void flush();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshDay);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    dayTimer = setInterval(onTick, 60_000);
    startAuth();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshDay);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(dayTimer);
    }
  };
}

/** The current data, or null during server rendering and hydration. */
export function useDrip(): DripSnapshot | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/* ------------------------------------------------------------------------ */
/* Actions                                                                  */
/* ------------------------------------------------------------------------ */

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
  /** Turns the free Pro preview on or off. Returns false if it couldn't be saved. */
  async setProPreview(on: boolean): Promise<boolean> {
    if (!cloud) {
      commit(transitions.setProPreview(read().state, on));
      return true;
    }
    try {
      const response = await authedFetch("/api/pro-preview", { method: "POST", body: JSON.stringify({ on }) });
      if (!response.ok) throw new Error(String(response.status));
      publish(transitions.setProPreview(read().state, on));
      return true;
    } catch {
      notify("Couldn't reach Drip's server. Try again when you're online.");
      return false;
    }
  },
  /** Email reminders on or off. Needs a connection. */
  async setRemindEmail(on: boolean): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase || !cloud) return false;
    const { userId } = cloud;
    cloud = { ...cloud, remindEmail: on };
    refresh();
    const { error } = await supabase.from("profiles").update({ remind_email: on }).eq("id", userId);
    if (!error) {
      saveCloud(cloud);
      return true;
    }
    if (cloud?.userId === userId) cloud = { ...cloud, remindEmail: !on };
    refresh();
    notify("Couldn't save that. Check your connection and try again.");
    return false;
  },
  notify,
};

export type AuthResult = { ok: true } | { ok: false; message: string };

function authError(error: { message?: string; status?: number } | null): AuthResult {
  if (!error) return { ok: true };
  if (error.status === 429) return { ok: false, message: "Too many tries. Wait a minute and try again." };
  if (/expired|invalid/i.test(error.message ?? "")) {
    return { ok: false, message: "That code didn't work. Check it, or ask for a new one." };
  }
  if (!navigator.onLine || /fetch|network/i.test(error.message ?? "")) {
    return { ok: false, message: "You're offline. Connect to the internet and try again." };
  }
  return { ok: false, message: error.message ?? "Something went wrong. Try again." };
}

export const dripAuth = {
  /** Emails a 6-digit sign-in code. New emails get an account automatically. */
  async sendCode(email: string): Promise<AuthResult> {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, message: "Accounts aren't set up on this server." };
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return authError(error);
  },
  async verifyCode(email: string, code: string): Promise<AuthResult> {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, message: "Accounts aren't set up on this server." };
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    return authError(error);
  },
  /** Signs out on this device only. */
  async signOut() {
    // Stop this device's notifications, so the next person using it doesn't get them.
    await disablePush().catch(() => undefined);
    await getSupabase()?.auth.signOut({ scope: "local" });
  },
  /** Deletes the account and everything in it. */
  async deleteAccount(): Promise<AuthResult> {
    try {
      const response = await authedFetch("/api/account", { method: "DELETE" });
      if (!response.ok) return { ok: false, message: "Couldn't delete the account. Try again." };
    } catch {
      return { ok: false, message: "You're offline. Connect to the internet and try again." };
    }
    // Nothing to keep: drop the cache before signing out so no changes are stashed.
    cloud = null;
    saveCloud(null);
    await getSupabase()?.auth.signOut({ scope: "local" });
    const { today } = read();
    publish(transitions.rollState(loadState(storage(), today, newId), today));
    notify("Your account and its data were deleted");
    return { ok: true };
  },
  /** Sends queued changes and reads the latest data now. */
  syncNow: () => sync(),
};
