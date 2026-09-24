/**
 * The real email and push senders used by the reminder job. Server only.
 * Configured by environment variables; see DEPLOY.md.
 */
import webpush from "web-push";
import type { PushTarget, Senders } from "./reminder-job";

/** Email through Resend (https://resend.com). */
async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const response = await fetch(`${process.env.RESEND_API_URL ?? "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REMINDER_FROM_EMAIL ?? "Drip <onboarding@resend.dev>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

let vapidReady = false;

function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function sendPush(target: PushTarget, payload: string): Promise<"ok" | "gone"> {
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:reminders@example.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      TTL: 24 * 60 * 60,
    });
    return "ok";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw error;
  }
}

/** Only the channels that are configured on this server. */
export function realSenders(): Senders {
  return {
    email: process.env.RESEND_API_KEY ? sendEmail : undefined,
    push: pushConfigured() ? sendPush : undefined,
  };
}

export function siteUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}
