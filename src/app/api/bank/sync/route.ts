import { CONNECTION_COLUMNS, syncConnection } from "@/lib/bank-sync";
import { bankConfigured, getBankApi } from "@/lib/bank/server";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Banks allow about 4 reads a day while the user isn't logging in at the bank.
 * With the daily check and the first read, every 6 hours stays within that.
 */
const MIN_MINUTES_BETWEEN = 6 * 60;

/** "Check now": syncs the signed-in user's banks and returns what was added. */
export async function POST(request: Request) {
  if (!bankConfigured()) return json({ error: "Bank connections aren't set up yet." }, 503);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);

  const admin = getAdmin();
  const { data: connections, error } = await admin
    .from("bank_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) return json({ error: "Couldn't load your banks." }, 500);

  const api = getBankApi();
  const cutoff = Date.now() - MIN_MINUTES_BETWEEN * 60_000;
  const added: string[] = [];
  const problems: string[] = [];
  let checked = 0;
  for (const connection of connections ?? []) {
    if (connection.last_synced_at && Date.parse(connection.last_synced_at) > cutoff) continue;
    checked++;
    const outcome = await syncConnection(admin, api, connection).catch(() => null);
    if (outcome?.ok) added.push(...outcome.added.map((s) => s.name));
    else problems.push(outcome?.message ?? `Couldn't read from ${connection.bank_name} just now.`);
  }
  return json({ checked, added, problems });
}
