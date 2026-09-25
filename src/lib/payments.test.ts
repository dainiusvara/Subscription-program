import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutSessionParams, isProStatus, managedPaymentsEnabled, periodEnd, planFromSubscription } from "./payments";

describe("Checkout for Pro", () => {
  const input = { customer: "cus_123", userId: "user-1", price: "price_monthly", site: "https://www.dripsubs.com" };

  afterEach(() => vi.unstubAllEnvs());

  it("starts a subscription tied to the user, and returns to the app", () => {
    const params = checkoutSessionParams({ ...input, managed: false });
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_123",
      client_reference_id: "user-1",
      line_items: [{ price: "price_monthly", quantity: 1 }],
      subscription_data: { metadata: { user_id: "user-1" } },
      success_url: "https://www.dripsubs.com/?checkout=success",
      cancel_url: "https://www.dripsubs.com/?checkout=cancelled",
    });
    expect(params).not.toHaveProperty("managed_payments");
  });

  it("makes Stripe the merchant of record only when Managed Payments is on", () => {
    expect(checkoutSessionParams({ ...input, managed: true }).managed_payments).toEqual({ enabled: true });
    // Stripe controls tax itself then, so these must never be sent alongside it.
    const params = checkoutSessionParams({ ...input, managed: true });
    expect(params).not.toHaveProperty("automatic_tax");
    expect(params).not.toHaveProperty("payment_method_types");
    expect(params).not.toHaveProperty("customer_update");
  });

  it("reads Managed Payments from STRIPE_MANAGED_PAYMENTS", () => {
    vi.stubEnv("STRIPE_MANAGED_PAYMENTS", "true");
    expect(managedPaymentsEnabled()).toBe(true);
    vi.stubEnv("STRIPE_MANAGED_PAYMENTS", "");
    expect(managedPaymentsEnabled()).toBe(false);
  });
});

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
