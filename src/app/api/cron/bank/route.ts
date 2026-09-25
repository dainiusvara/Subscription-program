import { runBankSync } from "@/lib/bank-sync";
import { bankConfigured, getBankApi } from "@/lib/bank/server";
import { cronAuthorized } from "@/lib/cron";
import { realSenders, siteUrl } from "@/lib/senders";
import { getAdmin, json } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * Reads every connected bank once a day and adds new subscriptions. Runs
 * before the reminders job (see vercel.json), so new finds get reminders too.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Unauthorized" }, 401);
  if (!bankConfigured()) return json({ skipped: "Bank connections aren't set up." });
  const result = await runBankSync(getAdmin(), getBankApi(), realSenders(), { siteUrl: siteUrl(request) });
  return json(result);
}
