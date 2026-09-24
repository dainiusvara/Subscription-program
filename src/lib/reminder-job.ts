/**
 * The daily reminder job: for every Pro user, find charges in the next 3 days
 * (in their time zone) and send one email and one notification per device,
 * never repeating a reminder. Senders are passed in, so tests run against the
 * real database without sending anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromRow, SUBSCRIPTION_COLUMNS, type SubscriptionRow } from "./cloud";
import { CURRENCIES } from "./catalog";
import { dueReminders, reminderEmail, reminderKey, reminderPush, todayInTimeZone, type Reminder } from "./reminders";
import type { Database } from "./supabase/database.types";
import type { CurrencyCode, Subscription } from "./types";

type Admin = SupabaseClient<Database>;
type Channel = "email" | "push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Senders {
  email?: (message: { to: string; subject: string; text: string; html: string }) => Promise<void>;
  /** Returns "gone" when the device unsubscribed, so it can be forgotten. */
  push?: (target: PushTarget, payload: string) => Promise<"ok" | "gone">;
}

export interface JobResult {
  users: number;
  emails: number;
  pushes: number;
  failures: number;
}

const BATCH = 200;

export async function runReminders(
  admin: Admin,
  senders: Senders,
  options: { now?: Date; siteUrl: string },
): Promise<JobResult> {
  const now = options.now ?? new Date();
  const result: JobResult = { users: 0, emails: 0, pushes: 0, failures: 0 };
  // Once payments are live, the free preview no longer includes reminders.
  const { data: config } = await admin.from("app_config").select("payments_live").eq("id", true).maybeSingle();
  const paymentsLive = config?.payments_live ?? false;

  for (let from = 0; ; from += BATCH) {
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, currency, timezone, remind_email, is_pro, pro_preview")
      .or("is_pro.eq.true,pro_preview.eq.true")
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw error;
    if (!profiles || profiles.length === 0) break;

    const ids = profiles.map((p) => p.id);
    const [subsRes, devicesRes, logRes] = await Promise.all([
      admin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("user_id", ids),
      admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids),
      admin.from("reminder_log").select("subscription_id, charge_date, channel").in("user_id", ids)
        .gte("charge_date", new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (devicesRes.error) throw devicesRes.error;
    if (logRes.error) throw logRes.error;

    const subsByUser = groupBy(
      (subsRes.data as SubscriptionRow[]).map((row) => ({ userId: row.user_id, sub: fromRow(row) })),
      (x) => x.userId,
    );
    const devicesByUser = groupBy(devicesRes.data ?? [], (d) => d.user_id);
    const sent = new Set((logRes.data ?? []).map((l) => `${l.channel}:${reminderKey(l.subscription_id, l.charge_date)}`));

    for (const profile of profiles) {
      if (!profile.is_pro && paymentsLive) continue;
      const subs = (subsByUser.get(profile.id) ?? []).map((x) => x.sub).filter((s): s is Subscription => s !== null);
      if (subs.length === 0) continue;
      const devices = devicesByUser.get(profile.id) ?? [];
      const today = todayInTimeZone(profile.timezone, now);
      const currency: CurrencyCode = CURRENCIES.some((c) => c.code === profile.currency)
        ? (profile.currency as CurrencyCode)
        : "EUR";
      const alreadySent = (channel: Channel) =>
        new Set([...sent].filter((k) => k.startsWith(`${channel}:`)).map((k) => k.slice(channel.length + 1)));
      result.users++;

      if (profile.remind_email && senders.email) {
        const due = dueReminders(subs, today, alreadySent("email"));
        const claimed = await claim(admin, profile.id, "email", due);
        if (claimed.length > 0) {
          try {
            const email = (await admin.auth.admin.getUserById(profile.id)).data.user?.email;
            if (!email) throw new Error("User has no email");
            await senders.email({ to: email, ...reminderEmail(claimed, currency, options.siteUrl) });
            result.emails++;
          } catch (err) {
            console.error("Reminder email failed", profile.id, err);
            await release(admin, "email", claimed);
            result.failures++;
          }
        }
      }

      if (devices.length > 0 && senders.push) {
        const due = dueReminders(subs, today, alreadySent("push"));
        const claimed = await claim(admin, profile.id, "push", due);
        if (claimed.length > 0) {
          const payload = JSON.stringify(reminderPush(claimed, currency));
          let delivered = 0;
          for (const device of devices) {
            try {
              if ((await senders.push(device, payload)) === "gone") {
                await admin.from("push_subscriptions").delete().eq("id", device.id);
              } else {
                delivered++;
              }
            } catch (err) {
              console.error("Push failed", device.id, err);
            }
          }
          if (delivered > 0) result.pushes += delivered;
          else {
            await release(admin, "push", claimed);
            result.failures++;
          }
        }
      }
    }

    if (profiles.length < BATCH) break;
  }
  return result;
}

/**
 * Records reminders as sent before sending. The primary key makes this atomic,
 * so two runs at the same time can't both send the same reminder.
 */
async function claim(admin: Admin, userId: string, channel: Channel, due: Reminder[]): Promise<Reminder[]> {
  if (due.length === 0) return [];
  const { data, error } = await admin
    .from("reminder_log")
    .upsert(
      due.map((r) => ({ subscription_id: r.subscriptionId, charge_date: r.chargeDate, channel, user_id: userId })),
      { onConflict: "subscription_id,charge_date,channel", ignoreDuplicates: true },
    )
    .select("subscription_id, charge_date");
  if (error) throw error;
  const won = new Set((data ?? []).map((row) => reminderKey(row.subscription_id, row.charge_date)));
  return due.filter((r) => won.has(reminderKey(r.subscriptionId, r.chargeDate)));
}

/** Sending failed: forget the claim so the next run tries again. */
async function release(admin: Admin, channel: Channel, reminders: Reminder[]) {
  for (const r of reminders) {
    await admin
      .from("reminder_log")
      .delete()
      .match({ subscription_id: r.subscriptionId, charge_date: r.chargeDate, channel });
  }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
