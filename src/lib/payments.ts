/**
 * Stripe: Checkout for upgrading, the Customer Portal for managing, and the
 * webhook that sets who is Pro. Server only. Card details never touch Drip:
 * Stripe collects and stores them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { Database } from "./supabase/database.types";

type Admin = SupabaseClient<Database>;

export type Plan = "monthly" | "yearly";

/** Stripe price lookup keys, created by `npm run stripe:setup`. */
export const PRICE_LOOKUP_KEYS: Record<Plan, string> = {
  monthly: "drip_pro_monthly",
  yearly: "drip_pro_yearly",
};

let stripe: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripe ??= new Stripe(key, {
    appInfo: { name: "Drip" },
    // Only for tests against stripe-mock; never set in production.
    ...(process.env.STRIPE_API_HOST
      ? {
          host: process.env.STRIPE_API_HOST,
          port: Number(process.env.STRIPE_API_PORT ?? 12111),
          protocol: "http" as const,
        }
      : {}),
  });
  return stripe;
}

/** Stripe statuses that count as Pro. past_due keeps Pro while Stripe retries the card. */
export function isProStatus(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/** End of the current billing period (seconds). Newer API versions keep it on the items. */
export function periodEnd(subscription: Stripe.Subscription): number | null {
  const item = subscription.items?.data?.[0] as { current_period_end?: number } | undefined;
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return item?.current_period_end ?? legacy ?? null;
}

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export interface ProfilePlan {
  is_pro: boolean;
  pro_status: string;
  pro_until: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
}

/** What a Stripe subscription means for the user's profile. */
export function planFromSubscription(subscription: Stripe.Subscription): ProfilePlan {
  const end = periodEnd(subscription);
  return {
    is_pro: isProStatus(subscription.status),
    pro_status: subscription.cancel_at_period_end && isProStatus(subscription.status) ? "canceling" : subscription.status,
    pro_until: end ? new Date(end * 1000).toISOString() : null,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId(subscription.customer),
  };
}

/** Applies a verified Stripe event. Returns what it did, for logs and tests. */
export async function handleStripeEvent(admin: Admin, event: Stripe.Event): Promise<"updated" | "ignored"> {
  // Receiving real events means payments are live: the free preview stops counting.
  await admin.from("app_config").update({ payments_live: true }).eq("id", true);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customer = customerId(session.customer);
      if (!userId || !customer) return "ignored";
      const { error } = await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", userId);
      if (error) throw error;
      return "updated";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const plan = planFromSubscription(subscription);
      let userId: string | null = subscription.metadata?.user_id ?? null;
      if (!userId && plan.stripe_customer_id) {
        const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", plan.stripe_customer_id).maybeSingle();
        userId = data?.id ?? null;
      }
      if (!userId) return "ignored";
      const eventAt = new Date(event.created * 1000).toISOString();
      // Only apply events at least as new as the last one applied (Stripe may deliver out of order).
      const { data, error } = await admin
        .from("profiles")
        .update({ ...plan, stripe_event_at: eventAt })
        .eq("id", userId)
        .or(`stripe_event_at.is.null,stripe_event_at.lte.${eventAt}`)
        .select("id");
      if (error) throw error;
      return data && data.length > 0 ? "updated" : "ignored";
    }
    default:
      return "ignored";
  }
}

/** Finds the price for a plan by its lookup key. */
export async function priceFor(plan: Plan): Promise<string> {
  const { data } = await getStripe().prices.list({ lookup_keys: [PRICE_LOOKUP_KEYS[plan]], active: true, limit: 1 });
  const price = data[0];
  if (!price) throw new Error(`No active Stripe price with lookup key ${PRICE_LOOKUP_KEYS[plan]}. Run npm run stripe:setup.`);
  return price.id;
}
