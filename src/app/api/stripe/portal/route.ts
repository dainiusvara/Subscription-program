import { getStripe, stripeConfigured } from "@/lib/payments";
import { siteUrl } from "@/lib/senders";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Opens Stripe's Customer Portal: change plan, update card, cancel, download invoices. */
export async function POST(request: Request) {
  if (!stripeConfigured()) return json({ error: "Payments aren't set up yet." }, 503);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const { data: profile } = await getAdmin().from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) return json({ error: "No subscription to manage yet." }, 404);
  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: siteUrl(request),
  });
  return json({ url: session.url });
}
