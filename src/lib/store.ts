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
import { bankEnabled, cloudConfigured, paymentsEnabled } from "./config";
import { newId } from "./ids";
import { createFamily, joinFamily, leaveFamily, loadFamily, removeMember, renewInviteCode, type Family } from "./family";
import { disablePush } from "./push";
import * as transitions from "./state";
import { STORAGE_KEY, loadState, sanitizeState, sanitizeSubscription, saveState } from "./storage";
import { authedFetch, getSupabase } from "./supabase/browser";
import { pullAccount, pullBank, pushOps, type BankData } from "./sync";
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
      /** Paid Pro details from Stripe. */
      proStatus: string | null;
      proUntil: string | null;
      /** The user's family, if they're in one. */
      family: Family | null;
      /** Connected banks and what they found. Null until loaded from the account. */
      bank: BankData | null;
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
  proStatus: string | null;
  proUntil: string | null;
  family: Family | null;
  bank: BankData | null;
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
      proStatus: typeof raw.proStatus === "string" ? raw.proStatus : null,
      proUntil: typeof raw.proUntil === "string" ? raw.proUntil : null,
      family: sanitizeFamily(raw.family),
      bank: sanitizeBank(raw.bank),
    };
  } catch {
    return null;
  }
}

function sanitizeBank(raw: unknown): BankData | null {
  const b = raw as Partial<BankData> | null;
  if (!b || !Array.isArray(b.connections) || !Array.isArray(b.fromBank)) return null;
  return {
    connections: b.connections.filter((c) => typeof c?.id === "string" && typeof c.bankName === "string"),
    fromBank: b.fromBank.filter((id): id is string => typeof id === "string"),
  };
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

/** Families come back from the cache as plain JSON; keep only well-formed ones. */
function sanitizeFamily(raw: unknown): Family | null {
  const f = raw as Partial<Family> | null;
  if (!f || typeof f.id !== "string" || typeof f.ownerId !== "string" || !Array.isArray(f.members) || !Array.isArray(f.shared)) {
    return null;
  }
  const shared = f.shared.flatMap((s) => {
    const sub = sanitizeSubscription(s);
    return sub && typeof (s as { ownerId?: unknown }).ownerId === "string" ? [{ ...sub, ownerId: (s as { ownerId: string }).ownerId }] : [];
  });
  return {
    id: f.id,
    name: typeof f.name === "string" ? f.name : "Family",
    ownerId: f.ownerId,
    inviteCode: typeof f.inviteCode === "string" ? f.inviteCode : "",
    members: f.members.filter((m) => typeof m?.userId === "string").map((m) => ({ userId: m.userId, email: String(m.email ?? "") })),
    shared,
  };
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
          proStatus: cloud.proStatus,
          proUntil: cloud.proUntil,
          family: cloud.family,
          bank: cloud.bank,
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
    const result = await pushOps(supabase, userId, cloud.outbox, cloud.family?.id ?? null);
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
  const [result, family, bank] = await Promise.all([
    pullAccount(supabase, userId),
    loadFamily(supabase).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    ),
    bankEnabled ? pullBank(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  if (!cloud || cloud.userId !== userId) return;
  if (family.ok) cloud = { ...cloud, family: family.value };
  if (bank) cloud = { ...cloud, bank };
  if (!result.ok) {
    offline = result.offline;
    refresh();
    return;
  }
  offline = false;
  const { state: current, today } = read();
  const { data } = result;
  cloud = { ...cloud, remindEmail: data.remindEmail, proStatus: data.proStatus, proUntil: data.proUntil };
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
    proStatus: null,
    proUntil: null,
    family: null,
    bank: null,
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
  /** The user cancelled it with the service: it stays listed as money saved. */
  cancel(id: string) {
    const { state, today } = read();
    commit(transitions.cancelSubscription(state, id, today));
  },
  /** Back to paying for it. Returns false when the Free limit blocks it. */
  restore(id: string): boolean {
    const { state, today } = read();
    const result = transitions.restoreSubscription(state, id, today);
    if (!result.ok) return false;
    commit(result.state);
    return true;
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
  /** Goes to Stripe Checkout to pay for Pro. Resolves only if it failed. */
  async startCheckout(plan: "monthly" | "yearly"): Promise<void> {
    await openStripePage("/api/stripe/checkout", { plan });
  },
  /** Opens Stripe's page for changing plan, card or cancelling. */
  async openBillingPortal(): Promise<void> {
    await openStripePage("/api/stripe/portal", {});
  },
  /** Back from Stripe Checkout: wait for the payment to be confirmed. */
  async confirmCheckout() {
    notify("Payment received. Switching on Pro…");
    for (let i = 0; i < 15; i++) {
      await pull();
      if (read().state.pro) {
        notify("Welcome to Drip Pro!");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    notify("Pro is taking longer than usual to switch on. It will appear shortly.");
  },
  notify,
};

/** Family sharing. Each needs a connection; the family reloads afterwards. */
export const familyActions = {
  create: (name: string) => familyCall((s) => createFamily(s, name), "Family created. Share the invite code."),
  join: (code: string) => familyCall((s) => joinFamily(s, code), "You joined the family"),
  leave: () => familyCall(leaveFamily, "You left the family"),
  remove: (userId: string) => familyCall((s) => removeMember(s, userId), "Removed from the family"),
  renewCode: () => familyCall(renewInviteCode, "New invite code made. The old one no longer works."),
};

async function familyCall<T>(
  run: (supabase: NonNullable<ReturnType<typeof getSupabase>>) => Promise<{ ok: true; value: T } | { ok: false; message: string }>,
  success: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !cloud) return false;
  // Unsent changes first, so nothing is shared into (or out of) the wrong family.
  await flush();
  const result = await run(supabase);
  if (!result.ok) {
    notify(result.message);
    return false;
  }
  await pull();
  notify(success);
  return true;
}

async function openStripePage(path: string, body: object) {
  try {
    const response = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error ?? "No URL");
    window.location.assign(result.url);
  } catch (error) {
    notify(error instanceof Error && !/fetch|network/i.test(error.message) ? error.message : "Couldn't reach Stripe. Check your connection and try again.");
  }
}

/** Live bank connections (Pro). Each needs a connection to Drip's server. */
export const bankActions = {
  /** Banks available in a country, or an error message. */
  async listBanks(country: string): Promise<{ ok: true; banks: BankChoice[] } | { ok: false; message: string }> {
    try {
      const response = await authedFetch(`/api/bank/banks?country=${encodeURIComponent(country)}`);
      const result = await response.json();
      if (!response.ok) return { ok: false, message: result.error ?? "Couldn't load the banks." };
      return { ok: true, banks: result.banks };
    } catch {
      return { ok: false, message: "You're offline. Connect to the internet and try again." };
    }
  },
  /** Goes to the bank's own login page. Resolves only if that failed. */
  async connect(bank: string, country: string): Promise<string> {
    try {
      const response = await authedFetch("/api/bank/connect", { method: "POST", body: JSON.stringify({ bank, country }) });
      const result = await response.json();
      if (!response.ok || !result.url) return result.error ?? "Couldn't reach your bank. Try again.";
      window.location.assign(result.url);
      return "";
    } catch {
      return "You're offline. Connect to the internet and try again.";
    }
  },
  /** Reads the connected banks now and shows what was added. */
  async checkNow(): Promise<void> {
    notify("Checking your bank…");
    try {
      const response = await authedFetch("/api/bank/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await pull();
      const added: string[] = result.added ?? [];
      if (result.problems?.length) notify(result.problems[0]);
      else if (result.checked === 0) notify("Checked in the last few hours. Banks allow only a few checks a day; Drip also checks every morning.");
      else if (added.length === 0) notify("Nothing new. Drip checks again every day.");
      else notify(`Added ${added.join(", ")} from your bank`);
    } catch (error) {
      notify(error instanceof Error && error.message ? error.message : "Couldn't reach Drip's server. Try again.");
    }
  },
  async disconnect(id: string, bankName: string): Promise<boolean> {
    try {
      const response = await authedFetch("/api/bank/disconnect", { method: "POST", body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error();
      await pull();
      notify(`${bankName} disconnected. Drip no longer reads it.`);
      return true;
    } catch {
      notify("Couldn't disconnect. Check your connection and try again.");
      return false;
    }
  },
  /** Back from the bank: reads the account again so the new subscriptions show. */
  async afterConnect(result: { connected: boolean; added: number; failed: boolean }) {
    if (!result.connected) return;
    notify("Bank connected. Looking for subscriptions…");
    await pull();
    if (result.failed) notify("Bank connected. Drip couldn't read it yet and tries again tomorrow.");
    else if (result.added > 0) {
      notify(`Bank connected. Drip found and added ${result.added} ${result.added === 1 ? "subscription" : "subscriptions"}.`);
    } else notify("Bank connected. Nothing new found yet: Drip checks every day.");
  },
};

export interface BankChoice {
  name: string;
  country: string;
  logo: string | null;
}

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
