import { getStripe, priceFor, stripeConfigured, type Plan } from "@/lib/payments";
import { siteUrl } from "@/lib/senders";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Starts Stripe Checkout for Pro. Returns the URL of Stripe's payment page. */
export async function POST(request: Request) {
  if (!stripeConfigured()) return json({ error: "Payments aren't set up yet." }, 503);
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);

  const body = await request.json().catch(() => null);
  const plan: Plan | null = body?.plan === "monthly" || body?.plan === "yearly" ? body.plan : null;
  if (!plan) return json({ error: "Expected { plan: 'monthly' | 'yearly' }." }, 400);

  const admin = getAdmin();
  const { data: profile } = await admin.from("profiles").select("is_pro, stripe_customer_id").eq("id", user.id).single();
  if (profile?.is_pro) return json({ error: "You're already on Pro." }, 409);

  const stripe = getStripe();
  let customer = profile?.stripe_customer_id ?? null;
  if (!customer) {
    customer = (await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } })).id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
  }

  const site = siteUrl(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: await priceFor(plan), quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${site}/?checkout=success`,
    cancel_url: `${site}/?checkout=cancelled`,
  });
  return json({ url: session.url });
}
