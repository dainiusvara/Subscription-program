import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/reminder-job";
import { realSenders, siteUrl } from "@/lib/senders";
import { getAdmin, json } from "@/lib/supabase/server";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Sends due reminders. Vercel Cron calls this once a day (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  const result = await runReminders(getAdmin(), realSenders(), { siteUrl: siteUrl(request) });
  return json(result);
}
