import type Stripe from "stripe";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { adminClient, newUser } from "@/test/db";
import { toRow } from "./cloud";
import { handleStripeEvent } from "./payments";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await adminClient().auth.admin.deleteUser(id);
});
afterEach(async () => {
  await adminClient().from("app_config").update({ payments_live: false }).eq("id", true);
});

async function user(label: string) {
  const u = await newUser(label);
  created.push(u.id);
  return u;
}

let seq = 0;
function event(type: string, object: Record<string, unknown>, created = 1_790_000_000 + seq++): Stripe.Event {
  return { id: `evt_${seq}`, object: "event", type, created, data: { object } } as unknown as Stripe.Event;
}

function subscription(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `sub_${userId.slice(0, 8)}`,
    object: "subscription",
    status: "active",
    customer: `cus_${userId.slice(0, 8)}`,
    cancel_at_period_end: false,
    metadata: { user_id: userId },
    items: { object: "list", data: [{ current_period_end: 1_792_000_000 }] },
    ...overrides,
  };
}

async function profile(id: string) {
  const { data } = await adminClient()
    .from("profiles")
    .select("is_pro, pro_status, pro_until, stripe_customer_id, stripe_subscription_id")
    .eq("id", id)
    .single();
  return data;
}

describe("Stripe webhook events", () => {
  it("checkout links the Stripe customer to the user", async () => {
    const { id } = await user("checkout");
    const result = await handleStripeEvent(
      adminClient(),
      event("checkout.session.completed", { object: "checkout.session", client_reference_id: id, customer: "cus_checkout" }),
    );
    expect(result).toBe("updated");
    expect((await profile(id))?.stripe_customer_id).toBe("cus_checkout");
  });

  it("a subscription makes the user Pro, and deleting it ends Pro", async () => {
    const { id } = await user("sub");
    await handleStripeEvent(adminClient(), event("customer.subscription.created", subscription(id)));
    expect(await profile(id)).toEqual({
      is_pro: true,
      pro_status: "active",
      pro_until: new Date(1_792_000_000 * 1000).toISOString().replace("Z", "+00:00").replace(".000", ""),
      stripe_customer_id: `cus_${id.slice(0, 8)}`,
      stripe_subscription_id: `sub_${id.slice(0, 8)}`,
    });

    await handleStripeEvent(adminClient(), event("customer.subscription.updated", subscription(id, { cancel_at_period_end: true })));
    expect(await profile(id)).toMatchObject({ is_pro: true, pro_status: "canceling" });

    await handleStripeEvent(adminClient(), event("customer.subscription.deleted", subscription(id, { status: "canceled" })));
    expect(await profile(id)).toMatchObject({ is_pro: false, pro_status: "canceled" });
  });

  it("ignores an older event that arrives late", async () => {
    const { id } = await user("order");
    await handleStripeEvent(adminClient(), event("customer.subscription.deleted", subscription(id, { status: "canceled" }), 1_800_000_000));
    const stale = await handleStripeEvent(adminClient(), event("customer.subscription.created", subscription(id), 1_799_999_000));
    expect(stale).toBe("ignored");
    expect((await profile(id))?.is_pro).toBe(false);
  });

  it("finds the user by Stripe customer when metadata is missing", async () => {
    const { id } = await user("bycustomer");
    await adminClient().from("profiles").update({ stripe_customer_id: "cus_lookup" }).eq("id", id);
    await handleStripeEvent(adminClient(), event("customer.subscription.created", subscription(id, { metadata: {}, customer: "cus_lookup" })));
    expect((await profile(id))?.is_pro).toBe(true);
    expect(await handleStripeEvent(adminClient(), event("customer.subscription.created", subscription(id, { metadata: {}, customer: "cus_unknown" })))).toBe("ignored");
  });

  it("the first event switches payments on, which ends the free preview's extra room", async () => {
    const { id, client } = await user("preview");
    await adminClient().from("profiles").update({ pro_preview: true }).eq("id", id);
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: crypto.randomUUID(), name: `Sub ${i}`, price: 1, cycle: "month" as const, nextCharge: "2026-10-01",
      billingDay: 1, category: "Other" as const, color: "#4B5E58", used: true, trial: false,
    }));
    expect((await client.from("subscriptions").insert(six.slice(0, 5).map((s) => toRow(s, id)))).error).toBeNull();

    await handleStripeEvent(adminClient(), event("invoice.paid", { object: "invoice" }));
    const { data } = await adminClient().from("app_config").select("payments_live").single();
    expect(data?.payments_live).toBe(true);

    const sixth = await client.from("subscriptions").insert(toRow(six[5], id));
    expect(sixth.error?.hint).toBe("free_limit");
  });

  it("users can't change their own plan fields", async () => {
    const { id, client } = await user("tamper");
    const { error } = await client.from("profiles").update({ stripe_customer_id: "cus_fake" }).eq("id", id);
    expect(error?.code).toBe("42501");
    expect((await client.from("app_config").select("*")).error?.code).toBe("42501");
  });
});
