/**
 * Notifications on this device (Web Push). Needs the service worker, so it
 * works in production builds and in the installed app. On iPhone and iPad,
 * Safari only allows it once Drip is added to the Home Screen.
 */
import { getSupabase, authedFetch } from "./supabase/browser";

export type PushStatus =
  | "unconfigured" // the server has no notification keys
  | "unsupported" // this browser can't do it
  | "needs-install" // iPhone/iPad: add to Home Screen first
  | "denied" // the user blocked notifications for this site
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (!("PushManager" in window) || !("Notification" in window)) return isIOS() ? "needs-install" : "unsupported";
  const reg = await registration();
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function enablePush(): Promise<{ ok: boolean; message?: string }> {
  const reg = await registration();
  const supabase = getSupabase();
  if (!reg || !supabase) return { ok: false, message: "Notifications aren't available here." };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications are blocked. Allow them for Drip in your browser settings." };
  }
  try {
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
    const { endpoint, keys } = subscription.toJSON();
    const { error } = await supabase.rpc("register_push", {
      p_endpoint: endpoint ?? "",
      p_p256dh: keys?.p256dh ?? "",
      p_auth: keys?.auth ?? "",
    });
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't turn on notifications. Check your connection and try again." };
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  await getSupabase()?.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}

export async function sendTestPush(): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await authedFetch("/api/push/test", { method: "POST" });
    const body = await response.json();
    if (!response.ok) return { ok: false, message: body.error ?? "Couldn't send a test." };
    return body.delivered > 0 ? { ok: true } : { ok: false, message: "No device received it. Turn notifications off and on again." };
  } catch {
    return { ok: false, message: "You're offline." };
  }
}
