import { cronAuthorized } from "@/lib/cron";
import { runReminders } from "@/lib/reminder-job";
import { realSenders, siteUrl } from "@/lib/senders";
import { getAdmin, json } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Sends due reminders. Vercel Cron calls this once a day (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return json({ error: "Unauthorized" }, 401);
  const result = await runReminders(getAdmin(), realSenders(), { siteUrl: siteUrl(request) });
  return json(result);
}
