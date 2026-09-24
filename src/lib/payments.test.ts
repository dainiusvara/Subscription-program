import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isProStatus, periodEnd, planFromSubscription } from "./payments";

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_123",
    object: "subscription",
    status: "active",
    customer: "cus_123",
    cancel_at_period_end: false,
    metadata: { user_id: "user-1" },
    items: { object: "list", data: [{ current_period_end: 1_790_000_000 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("Stripe subscription → plan", () => {
  it("counts active, trialing and past_due as Pro", () => {
    expect(["active", "trialing", "past_due"].every(isProStatus)).toBe(true);
    expect(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"].some(isProStatus)).toBe(false);
  });

  it("reads the period end from the items, or the subscription on older API versions", () => {
    expect(periodEnd(subscription())).toBe(1_790_000_000);
    expect(periodEnd(subscription({ items: { data: [] }, current_period_end: 1_700_000_000 }))).toBe(1_700_000_000);
    expect(periodEnd(subscription({ items: { data: [] } }))).toBeNull();
  });

  it("maps an active subscription", () => {
    expect(planFromSubscription(subscription())).toEqual({
      is_pro: true,
      pro_status: "active",
      pro_until: new Date(1_790_000_000 * 1000).toISOString(),
      stripe_subscription_id: "sub_123",
      stripe_customer_id: "cus_123",
    });
  });

  it("keeps Pro until the period ends after a cancellation", () => {
    expect(planFromSubscription(subscription({ cancel_at_period_end: true }))).toMatchObject({ is_pro: true, pro_status: "canceling" });
    expect(planFromSubscription(subscription({ status: "canceled", cancel_at_period_end: true }))).toMatchObject({
      is_pro: false,
      pro_status: "canceled",
    });
  });

  it("accepts an expanded customer object", () => {
    expect(planFromSubscription(subscription({ customer: { id: "cus_9" } })).stripe_customer_id).toBe("cus_9");
  });
});
