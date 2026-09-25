import { randomBytes } from "node:crypto";
import { userHasPro } from "@/lib/bank-sync";
import { consentUntil } from "@/lib/bank/live";
import { CALLBACK_PATH, bankConfigured, getBankApi, isCountryCode, stateCookie } from "@/lib/bank/server";
import { siteUrl } from "@/lib/senders";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Most people have one or two banks. */
const MAX_CONNECTIONS = 5;

/**
 * Starts connecting a bank: returns the address of the bank's own login page.
 * The bank sends the user back to /api/bank/callback afterwards.
 */
export async function POST(request: Request) {
  if (!bankConfigured()) return json({ error: "Bank connections aren't set up yet." }, 503);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);

  const body = await request.json().catch(() => null);
  const bank = typeof body?.bank === "string" ? body.bank.trim() : "";
  const country = typeof body?.country === "string" ? body.country.toUpperCase() : "";
  if (!bank || bank.length > 200 || !isCountryCode(country)) return json({ error: "Expected { bank, country }." }, 400);

  const admin = getAdmin();
  if (!(await userHasPro(admin, user.id))) return json({ error: "Connecting a bank is part of Drip Pro." }, 403);

  // Unfinished attempts don't count; they're replaced by this one.
  await admin.from("bank_connections").delete().eq("user_id", user.id).eq("status", "pending");
  const { count } = await admin.from("bank_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_CONNECTIONS) return json({ error: `You can connect up to ${MAX_CONNECTIONS} banks.` }, 409);

  const api = getBankApi();
  let maxConsentSeconds: number | null = null;
  try {
    const known = (await api.listBanks(country)).find((b) => b.name === bank);
    if (!known) return json({ error: "That bank isn't available." }, 400);
    maxConsentSeconds = known.maxConsentSeconds;
  } catch (error) {
    console.error("Listing banks failed", error);
    return json({ error: "Couldn't reach the bank service. Try again in a minute." }, 502);
  }

  const state = randomBytes(24).toString("base64url");
  const { error: insertError } = await admin
    .from("bank_connections")
    .insert({ user_id: user.id, bank_name: bank, bank_country: country, status: "pending", auth_state: state });
  if (insertError) return json({ error: "Couldn't start connecting. Try again." }, 500);

  const site = siteUrl(request);
  try {
    const url = await api.startAuth({
      bank,
      country,
      state,
      redirectUrl: `${site}${CALLBACK_PATH}`,
      validUntil: consentUntil(new Date(), maxConsentSeconds),
    });
    return Response.json(
      { url },
      { headers: { "Cache-Control": "no-store", "Set-Cookie": stateCookie(state, site) } },
    );
  } catch (error) {
    console.error("Starting bank login failed", error);
    await admin.from("bank_connections").delete().eq("auth_state", state);
    return json({ error: "Couldn't reach your bank. Try again in a minute." }, 502);
  }
}
