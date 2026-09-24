/**
 * Talking to the cloud database: sending queued changes and reading the
 * account's data. Row-level security on the server limits every call to the
 * signed-in user's own rows.
 */
import { SUBSCRIPTION_COLUMNS, describeRejection, fromRow, isNetworkError, toRow, type OutboxOp } from "./cloud";
import { CURRENCIES } from "./catalog";
import type { DripSupabase } from "./supabase/browser";
import type { CurrencyCode, Subscription } from "./types";

export interface PushResult {
  /** Ops the server accepted. */
  sent: OutboxOp[];
  /** Ops the server refused; they are dropped and the reason shown to the user. */
  rejected: { op: OutboxOp; reason: string }[];
  /** The network failed; the remaining ops stay queued. */
  offline: boolean;
}

export async function pushOps(supabase: DripSupabase, userId: string, ops: readonly OutboxOp[]): Promise<PushResult> {
  const result: PushResult = { sent: [], rejected: [], offline: false };
  const upserts = ops.filter((op): op is Extract<OutboxOp, { kind: "upsert" }> => op.kind === "upsert");
  const deletes = ops.filter((op): op is Extract<OutboxOp, { kind: "delete" }> => op.kind === "delete");
  const currency = ops.filter((op) => op.kind === "currency");

  if (upserts.length > 0) {
    const { error } = await supabase.from("subscriptions").upsert(upserts.map((op) => toRow(op.sub, userId)));
    if (!error) {
      result.sent.push(...upserts);
    } else if (isNetworkError(error)) {
      return { ...result, offline: true };
    } else {
      // One refused row fails the whole batch: retry one by one to keep the good ones.
      for (const op of upserts) {
        const single = await supabase.from("subscriptions").upsert(toRow(op.sub, userId));
        if (!single.error) result.sent.push(op);
        else if (isNetworkError(single.error)) return { ...result, offline: true };
        else result.rejected.push({ op, reason: describeRejection(single.error) });
      }
    }
  }

  if (deletes.length > 0) {
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .in(
        "id",
        deletes.map((op) => op.id),
      );
    if (!error) result.sent.push(...deletes);
    else if (isNetworkError(error)) return { ...result, offline: true };
    else result.rejected.push(...deletes.map((op) => ({ op, reason: describeRejection(error) })));
  }

  for (const op of currency) {
    if (op.kind !== "currency") continue;
    const { error } = await supabase.from("profiles").update({ currency: op.currency }).eq("id", userId);
    if (!error) result.sent.push(op);
    else if (isNetworkError(error)) return { ...result, offline: true };
    else result.rejected.push({ op, reason: describeRejection(error) });
  }

  return result;
}

export interface AccountData {
  subs: Subscription[];
  currency: CurrencyCode;
  pro: boolean;
  proPreview: boolean;
}

export type PullResult = { ok: true; data: AccountData } | { ok: false; offline: boolean; message: string };

export async function pullAccount(supabase: DripSupabase, userId: string): Promise<PullResult> {
  const [profile, rows] = await Promise.all([
    supabase.from("profiles").select("currency, is_pro, pro_preview").eq("id", userId).single(),
    supabase.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("user_id", userId),
  ]);
  const error = profile.error ?? rows.error;
  if (error || !profile.data || !rows.data) {
    return { ok: false, offline: isNetworkError(error), message: error?.message ?? "No data" };
  }
  const currency = CURRENCIES.some((c) => c.code === profile.data.currency)
    ? (profile.data.currency as CurrencyCode)
    : "EUR";
  return {
    ok: true,
    data: {
      subs: rows.data.map(fromRow).filter((sub): sub is Subscription => sub !== null),
      currency,
      pro: profile.data.is_pro,
      proPreview: profile.data.pro_preview,
    },
  };
}
