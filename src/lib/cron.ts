import { timingSafeEqual } from "node:crypto";

/** Scheduled jobs are called with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
