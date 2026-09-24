import type Stripe from "stripe";
import { getStripe, handleStripeEvent } from "@/lib/payments";
import { getAdmin, json } from "@/lib/supabase/server";

/**
 * Stripe calls this when a subscription starts, changes or ends. The signature
 * check proves the request really comes from Stripe.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return json({ error: "Missing signature" }, 400);

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return json({ error: "Invalid signature" }, 400);
  }

  try {
    const result = await handleStripeEvent(getAdmin(), event);
    return json({ received: true, result });
  } catch (error) {
    console.error("Stripe webhook failed", event.type, error);
    // A 500 makes Stripe retry later.
    return json({ error: "Webhook handler failed" }, 500);
  }
}
