import { realSenders } from "@/lib/senders";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Sends a test notification to the signed-in user's devices. */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const push = realSenders().push;
  if (!push) return json({ error: "Notifications aren't set up on this server." }, 503);

  const { data: devices } = await getAdmin()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);
  const payload = JSON.stringify({
    title: "Drip notifications are on",
    body: "You'll get a reminder 3 days before each charge.",
    url: "/",
    tag: "drip-test",
  });
  let delivered = 0;
  for (const device of devices ?? []) {
    try {
      if ((await push(device, payload)) === "gone") await getAdmin().from("push_subscriptions").delete().eq("id", device.id);
      else delivered++;
    } catch {
      // Counted as not delivered.
    }
  }
  return json({ delivered });
}
