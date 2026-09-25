/**
 * Syncing live bank connections: read recent transactions, find subscriptions
 * and add the new ones to the user's list. Runs right after the user connects
 * a bank, when they tap "Check now", and once a day for everyone (the cron job).
 *
 * Transactions are read into memory and dropped: only what was found is kept.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "./billing";
import { CURRENCIES, CYCLE_UNITS } from "./catalog";
import { SUBSCRIPTION_COLUMNS, fromRow, toRow, type SubscriptionRow } from "./cloud";
import { BankApiError, type BankApi } from "./bank/enable-banking";
import { fromApiTransaction, planBankSync, syncFrom } from "./bank/live";
import type { Transaction } from "./bank/statement";
import { newId } from "./ids";
import { escapeHtml, todayInTimeZone, type EmailMessage, type PushMessage } from "./reminders";
import type { Senders } from "./reminder-job";
import type { Database } from "./supabase/database.types";
import type { CurrencyCode, Subscription } from "./types";

type Admin = SupabaseClient<Database>;

export interface ConnectionRow {
  id: string;
  user_id: string;
  bank_name: string;
  session_id: string | null;
  account_ids: string[];
  status: string;
  last_synced_at: string | null;
}

export const CONNECTION_COLUMNS = "id, user_id, bank_name, session_id, account_ids, status, last_synced_at";

export type SyncOutcome =
  | { ok: true; added: Subscription[] }
  | { ok: false; reason: "not_pro" | "expired" | "error"; message: string };

/** Pro (paid, or the free preview while payments aren't live) can use bank connections. */
export async function userHasPro(admin: Admin, userId: string): Promise<boolean> {
  const [{ data: profile }, { data: config }] = await Promise.all([
    admin.from("profiles").select("is_pro, pro_preview").eq("id", userId).maybeSingle(),
    admin.from("app_config").select("payments_live").eq("id", true).maybeSingle(),
  ]);
  if (!profile) return false;
  return profile.is_pro || (profile.pro_preview && !(config?.payments_live ?? false));
}

async function readTransactions(api: BankApi, accounts: readonly string[], from: string): Promise<Transaction[]> {
  const all: Transaction[] = [];
  for (const account of accounts) {
    for (const raw of await api.transactions(account, from)) {
      const t = fromApiTransaction(raw);
      if (t) all.push(t);
    }
  }
  return all;
}

export async function syncConnection(
  admin: Admin,
  api: BankApi,
  connection: ConnectionRow,
  options: { now?: Date; first?: boolean; makeId?: () => string } = {},
): Promise<SyncOutcome> {
  const now = options.now ?? new Date();
  const userId = connection.user_id;
  if (!connection.session_id || connection.status !== "active") {
    return { ok: false, reason: "expired", message: "Reconnect your bank to keep finding subscriptions." };
  }
  if (!(await userHasPro(admin, userId))) {
    return { ok: false, reason: "not_pro", message: "Bank connections are part of Drip Pro." };
  }

  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const today = todayInTimeZone(profile?.timezone ?? "UTC", now);

  let transactions: Transaction[];
  try {
    try {
      transactions = await readTransactions(api, connection.account_ids, syncFrom(today, options.first ?? false));
    } catch (error) {
      // Some banks refuse a long history; the last 90 days always work.
      if (!options.first || !(error instanceof BankApiError) || error.consentEnded) throw error;
      transactions = await readTransactions(api, connection.account_ids, syncFrom(today, false));
    }
  } catch (error) {
    const expired = error instanceof BankApiError && error.consentEnded;
    const message = expired
      ? `${connection.bank_name} no longer shares your transactions. Reconnect to keep finding subscriptions.`
      : `Couldn't read from ${connection.bank_name} just now. Drip tries again tomorrow.`;
    await admin
      .from("bank_connections")
      .update({ last_error: message, ...(expired ? { status: "expired" } : {}) })
      .eq("id", connection.id);
    if (!expired) console.error("Bank sync failed", connection.id, error);
    return { ok: false, reason: expired ? "expired" : "error", message };
  }

  const [subsRes, handledRes] = await Promise.all([
    admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("user_id", userId),
    admin.from("bank_detections").select("merchant_key").eq("user_id", userId),
  ]);
  if (subsRes.error) throw subsRes.error;
  if (handledRes.error) throw handledRes.error;
  const existing = (subsRes.data as SubscriptionRow[]).map(fromRow).filter((s): s is Subscription => s !== null);
  const handled = new Set((handledRes.data ?? []).map((d) => d.merchant_key));
  const plan = planBankSync(transactions, today, existing, handled, options.makeId ?? newId);

  // Claim each merchant first. The primary key makes this atomic, so two syncs
  // running at once can't both add the same subscription.
  const added: Subscription[] = [];
  if (plan.add.length > 0) {
    const { data: claimed, error } = await admin
      .from("bank_detections")
      .upsert(
        plan.add.map((p) => ({ user_id: userId, merchant_key: p.key, outcome: "added" })),
        { onConflict: "user_id,merchant_key", ignoreDuplicates: true },
      )
      .select("merchant_key");
    if (error) throw error;
    const won = new Set((claimed ?? []).map((c) => c.merchant_key));
    for (const { key, sub } of plan.add) {
      if (!won.has(key)) continue;
      const insert = await admin.from("subscriptions").insert(toRow(sub, userId));
      if (insert.error) {
        // e.g. the Free limit after Pro ended mid-sync: let a later sync try again.
        await admin.from("bank_detections").delete().match({ user_id: userId, merchant_key: key });
        continue;
      }
      await admin.from("bank_detections").update({ subscription_id: sub.id }).match({ user_id: userId, merchant_key: key });
      added.push(sub);
    }
  }
  if (plan.matched.length > 0) {
    await admin.from("bank_detections").upsert(
      plan.matched.map((m) => ({ user_id: userId, merchant_key: m.key, outcome: "matched", subscription_id: m.subscriptionId })),
      { onConflict: "user_id,merchant_key", ignoreDuplicates: true },
    );
  }

  await admin
    .from("bank_connections")
    .update({ last_synced_at: now.toISOString(), last_error: null })
    .eq("id", connection.id);
  return { ok: true, added };
}

/* ------------------------------------------------------------------------ */
/* The daily run                                                            */
/* ------------------------------------------------------------------------ */

function addedLine(sub: Subscription, currency: CurrencyCode): string {
  return `${sub.name}: ${formatMoney(sub.price, currency)} / ${CYCLE_UNITS[sub.cycle]}`;
}

export function addedEmail(added: readonly Subscription[], currency: CurrencyCode, siteUrl: string): EmailMessage {
  const subject =
    added.length === 1
      ? `Drip added ${added[0].name} from your bank`
      : `Drip added ${added.length} subscriptions from your bank`;
  const lines = added.map((s) => addedLine(s, currency));
  const hint = "Not right? Open Drip to edit or delete it. Drip won't add it again.";
  const text = [subject, "", ...lines.map((l) => `- ${l}`), "", hint, "", `Open Drip: ${siteUrl}`].join("\n");
  const html = `<div style="font-family:Figtree,'Segoe UI',system-ui,sans-serif;color:#15201C;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>
<ul style="padding-left:18px;margin:0 0 16px">${lines.map((l) => `<li style="margin:0 0 6px">${escapeHtml(l)}</li>`).join("")}</ul>
<p style="margin:0 0 16px">${escapeHtml(hint)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(siteUrl)}" style="background:#0A6F6A;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Open Drip</a></p>
<p style="margin:0;font-size:12px;color:#5B6A64">You get these because your bank is connected to Drip. You can disconnect it in the app.</p>
</div>`;
  return { subject, text, html };
}

export function addedPush(added: readonly Subscription[], currency: CurrencyCode): PushMessage {
  return {
    title: added.length === 1 ? `New subscription: ${added[0].name}` : `${added.length} new subscriptions found`,
    body: `${added.map((s) => addedLine(s, currency)).join("\n")}\nFound in your bank. Tap to check.`,
    url: "/",
    tag: `drip-bank-${added.map((s) => s.id).join(",")}`.slice(0, 120),
  };
}

const BATCH = 500;

export interface BankJobResult {
  connections: number;
  added: number;
  expired: number;
  failures: number;
}

/** Syncs every active connection whose owner has Pro, and tells them about new finds. */
export async function runBankSync(
  admin: Admin,
  api: BankApi,
  senders: Senders,
  options: { now?: Date; siteUrl: string },
): Promise<BankJobResult> {
  const result: BankJobResult = { connections: 0, added: 0, expired: 0, failures: 0 };
  const connections: ConnectionRow[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await admin
      .from("bank_connections")
      .select(CONNECTION_COLUMNS)
      .eq("status", "active")
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw error;
    connections.push(...(data ?? []));
    if (!data || data.length < BATCH) break;
  }

  for (const connection of connections) {
    let outcome: SyncOutcome;
    try {
      outcome = await syncConnection(admin, api, connection, { now: options.now });
    } catch (err) {
      console.error("Bank sync crashed", connection.id, err);
      result.failures++;
      continue;
    }
    if (!outcome.ok) {
      if (outcome.reason === "expired") result.expired++;
      if (outcome.reason === "error") result.failures++;
      continue;
    }
    result.connections++;
    if (outcome.added.length === 0) continue;
    result.added += outcome.added.length;
    await tellUser(admin, senders, connection.user_id, outcome.added, options.siteUrl);
  }
  return result;
}

async function tellUser(admin: Admin, senders: Senders, userId: string, added: Subscription[], siteUrl: string) {
  const [{ data: profile }, { data: devices }] = await Promise.all([
    admin.from("profiles").select("currency, remind_email").eq("id", userId).maybeSingle(),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
  ]);
  const currency: CurrencyCode = CURRENCIES.some((c) => c.code === profile?.currency) ? (profile!.currency as CurrencyCode) : "EUR";
  if (senders.push) {
    const payload = JSON.stringify(addedPush(added, currency));
    for (const device of devices ?? []) {
      try {
        if ((await senders.push(device, payload)) === "gone") await admin.from("push_subscriptions").delete().eq("id", device.id);
      } catch (err) {
        console.error("Push failed", device.id, err);
      }
    }
  }
  if (senders.email && profile?.remind_email) {
    try {
      const email = (await admin.auth.admin.getUserById(userId)).data.user?.email;
      if (email) await senders.email({ to: email, ...addedEmail(added, currency, siteUrl) });
    } catch (err) {
      console.error("Bank email failed", userId, err);
    }
  }
}
