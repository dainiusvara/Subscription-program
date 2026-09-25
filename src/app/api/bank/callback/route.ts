import { syncConnection } from "@/lib/bank-sync";
import { AUTH_MINUTES, STATE_COOKIE, bankConfigured, getBankApi, readCookie, stateCookie } from "@/lib/bank/server";
import { siteUrl } from "@/lib/senders";
import { getAdmin } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Where the bank sends the user after they log in (or give up). Finishes the
 * connection, reads their transactions once and goes back to the app with the
 * result: /?bank=connected&added=N, /?bank=cancelled or /?bank=error.
 */
export async function GET(request: Request) {
  const site = siteUrl(request);
  const back = (query: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `${site}/?${query}`, "Cache-Control": "no-store", "Set-Cookie": stateCookie("", site, 0) },
    });
  if (!bankConfigured()) return back("bank=error");

  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  // The state must match the cookie set when this browser started connecting,
  // so nobody can link their own bank login to someone else's Drip account.
  if (!state || readCookie(request, STATE_COOKIE) !== state) return back("bank=error&reason=expired");

  const admin = getAdmin();
  const since = new Date(Date.now() - AUTH_MINUTES * 60_000).toISOString();
  const { data: connection } = await admin
    .from("bank_connections")
    .select("id, user_id, bank_name")
    .eq("auth_state", state)
    .eq("status", "pending")
    .gte("created_at", since)
    .maybeSingle();
  if (!connection) return back("bank=error&reason=expired");

  if (!code) {
    await admin.from("bank_connections").delete().eq("id", connection.id);
    return back("bank=cancelled");
  }

  const api = getBankApi();
  let session;
  try {
    session = await api.createSession(code);
  } catch (error) {
    console.error("Finishing bank login failed", error);
    await admin.from("bank_connections").delete().eq("id", connection.id);
    return back("bank=error");
  }

  const { data: active, error } = await admin
    .from("bank_connections")
    .update({
      status: "active",
      auth_state: null,
      session_id: session.sessionId,
      account_ids: session.accounts.map((a) => a.uid),
      valid_until: session.validUntil,
      bank_name: session.bankName || connection.bank_name,
    })
    .eq("id", connection.id)
    .select("id, user_id, bank_name, session_id, account_ids, status, last_synced_at")
    .single();
  if (error || !active) {
    await api.deleteSession(session.sessionId).catch(() => undefined);
    return back("bank=error");
  }

  const outcome = await syncConnection(admin, api, active, { first: true }).catch((err) => {
    console.error("First bank sync failed", err);
    return null;
  });
  const added = outcome?.ok ? outcome.added.length : 0;
  return back(`bank=connected&added=${added}${outcome?.ok ? "" : "&sync=failed"}`);
}
