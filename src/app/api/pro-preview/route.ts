import { paymentsEnabled } from "@/lib/config";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Turns the free Pro preview on or off for the signed-in user. Only while payments aren't live. */
export async function POST(request: Request) {
  if (paymentsEnabled) return json({ error: "Pro preview has ended. Upgrade to Pro instead." }, 403);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);

  const body = await request.json().catch(() => null);
  if (typeof body?.on !== "boolean") return json({ error: "Expected { on: boolean }." }, 400);

  const { error } = await getAdmin().from("profiles").update({ pro_preview: body.on }).eq("id", user.id);
  if (error) return json({ error: "Couldn't save." }, 500);
  return json({ proPreview: body.on });
}
