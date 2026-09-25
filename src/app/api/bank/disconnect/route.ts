import { bankConfigured, getBankApi } from "@/lib/bank/server";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/**
 * Disconnects a bank: ends the consent with the provider and forgets the
 * connection. Subscriptions it added stay (they're the user's now).
 */
export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string") return json({ error: "Expected { id }." }, 400);

  const admin = getAdmin();
  const { data: connection } = await admin
    .from("bank_connections")
    .select("id, session_id")
    .eq("id", body.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return json({ error: "Not found." }, 404);

  if (connection.session_id && bankConfigured()) {
    await getBankApi()
      .deleteSession(connection.session_id)
      .catch((error) => console.error("Ending bank consent failed", error));
  }
  const { error } = await admin.from("bank_connections").delete().eq("id", connection.id);
  if (error) return json({ error: "Couldn't disconnect. Try again." }, 500);
  return json({ disconnected: true });
}
