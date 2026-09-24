import { afterAll, describe, expect, it } from "vitest";
import { adminClient, newUser } from "@/test/db";
import { toRow, type OutboxOp } from "./cloud";
import { pullAccount, pushOps } from "./sync";
import type { Subscription } from "./types";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await adminClient().auth.admin.deleteUser(id);
});

async function user(label: string) {
  const u = await newUser(label);
  created.push(u.id);
  return u;
}

function sub(name: string, overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: crypto.randomUUID(),
    name,
    price: 9.99,
    cycle: "month",
    nextCharge: "2026-10-15",
    billingDay: 15,
    category: "Streaming",
    color: "#7A3B8F",
    used: true,
    trial: false,
    ...overrides,
  };
}

describe("profiles", () => {
  it("are created on sign-up with Free defaults", async () => {
    const { client, id } = await user("profile");
    const { data } = await client.from("profiles").select("*").eq("id", id).single();
    expect(data).toMatchObject({ id, currency: "EUR", is_pro: false, pro_preview: false });
  });

  it("let users change their currency but not their plan", async () => {
    const { client, id } = await user("plan");
    expect((await client.from("profiles").update({ currency: "GBP" }).eq("id", id)).error).toBeNull();
    const pro = await client.from("profiles").update({ is_pro: true }).eq("id", id);
    expect(pro.error?.code).toBe("42501");
    const preview = await client.from("profiles").update({ pro_preview: true }).eq("id", id);
    expect(preview.error?.code).toBe("42501");
    const { data } = await client.from("profiles").select("currency, is_pro, pro_preview").eq("id", id).single();
    expect(data).toEqual({ currency: "GBP", is_pro: false, pro_preview: false });
  });
});

describe("row-level security", () => {
  it("keeps each user's subscriptions private", async () => {
    const alice = await user("alice");
    const bob = await user("bob");
    const netflix = sub("Netflix");
    expect((await alice.client.from("subscriptions").insert(toRow(netflix, alice.id))).error).toBeNull();

    expect((await bob.client.from("subscriptions").select("id")).data).toEqual([]);
    expect((await bob.client.from("profiles").select("id").eq("id", alice.id)).data).toEqual([]);

    // Bob can't take over, change or delete Alice's row.
    const hijack = await bob.client.from("subscriptions").upsert(toRow({ ...netflix, name: "Mine now" }, bob.id));
    expect(hijack.error).not.toBeNull();
    await bob.client.from("subscriptions").update({ name: "Mine now" }).eq("id", netflix.id);
    await bob.client.from("subscriptions").delete().eq("id", netflix.id);
    const { data } = await alice.client.from("subscriptions").select("name").eq("id", netflix.id).single();
    expect(data?.name).toBe("Netflix");

    // Nor insert rows on her behalf.
    const forged = await bob.client.from("subscriptions").insert(toRow(sub("Forged"), alice.id));
    expect(forged.error?.code).toBe("42501");
  });

  it("blocks signed-out requests", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_LOCAL_API_URL!, process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY!);
    const { error } = await anon.from("subscriptions").select("id");
    expect(error?.code).toBe("42501");
  });

  it("rejects invalid data", async () => {
    const { client, id } = await user("checks");
    const bad = await client.from("subscriptions").insert({ ...toRow(sub("Bad"), id), cycle: "daily" });
    expect(bad.error?.code).toBe("23514");
    const colour = await client.from("subscriptions").insert({ ...toRow(sub("Bad"), id), color: "red" });
    expect(colour.error?.code).toBe("23514");
  });
});

describe("Free limit in the database", () => {
  it("stops the 6th subscription on Free, but allows edits", async () => {
    const { client, id } = await user("limit");
    const five = Array.from({ length: 5 }, (_, i) => sub(`Sub ${i}`));
    expect((await client.from("subscriptions").insert(five.map((s) => toRow(s, id)))).error).toBeNull();

    const sixth = await client.from("subscriptions").insert(toRow(sub("Sixth"), id));
    expect(sixth.error?.hint).toBe("free_limit");

    const edit = await client.from("subscriptions").upsert(toRow({ ...five[0], price: 1.5 }, id));
    expect(edit.error).toBeNull();
  });

  it("counts rows inserted in the same request", async () => {
    const { client, id } = await user("batch");
    const six = Array.from({ length: 6 }, (_, i) => sub(`Sub ${i}`));
    const { error } = await client.from("subscriptions").insert(six.map((s) => toRow(s, id)));
    expect(error?.hint).toBe("free_limit");
    expect((await client.from("subscriptions").select("id")).data).toEqual([]);
  });

  it("lifts the limit with Pro or Pro preview", async () => {
    const { client, id } = await user("pro");
    await adminClient().from("profiles").update({ pro_preview: true }).eq("id", id);
    const seven = Array.from({ length: 7 }, (_, i) => sub(`Sub ${i}`));
    expect((await client.from("subscriptions").insert(seven.map((s) => toRow(s, id)))).error).toBeNull();
  });
});

describe("sync", () => {
  it("pushes queued changes and reads them back", async () => {
    const { client, id } = await user("sync");
    const netflix = sub("Netflix");
    const trial = sub("Disney+", { trial: true, price: 0, priceAfterTrial: 9.99 });
    const ops: OutboxOp[] = [
      { kind: "upsert", sub: netflix },
      { kind: "upsert", sub: trial },
      { kind: "currency", currency: "USD" },
    ];
    const pushed = await pushOps(client, id, ops);
    expect(pushed).toEqual({ sent: ops, rejected: [], offline: false });

    const second = await pushOps(client, id, [
      { kind: "upsert", sub: { ...netflix, used: false } },
      { kind: "delete", id: trial.id },
    ]);
    expect(second.rejected).toEqual([]);

    const pulled = await pullAccount(client, id);
    expect(pulled).toEqual({
      ok: true,
      data: { subs: [{ ...netflix, used: false }], currency: "USD", pro: false, proPreview: false },
    });
  });

  it("keeps the good changes when the server refuses one", async () => {
    const { client, id } = await user("partial");
    const six = Array.from({ length: 6 }, (_, i): OutboxOp => ({ kind: "upsert", sub: sub(`Sub ${i}`) }));
    const result = await pushOps(client, id, six);
    expect(result.sent).toHaveLength(5);
    expect(result.rejected).toEqual([{ op: six[5], reason: "The Free plan covers 5 subscriptions." }]);
    expect(result.offline).toBe(false);
  });

  it("reports offline without losing anything", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const unreachable = createClient("http://127.0.0.1:9", "sb_publishable_x", { auth: { persistSession: false } });
    const ops: OutboxOp[] = [{ kind: "upsert", sub: sub("Netflix") }];
    expect(await pushOps(unreachable as never, "u", ops)).toEqual({ sent: [], rejected: [], offline: true });
    expect(await pullAccount(unreachable as never, "u")).toMatchObject({ ok: false, offline: true });
  });
});

describe("account deletion", () => {
  it("removes the profile and subscriptions", async () => {
    const { client, id } = await user("delete");
    await client.from("subscriptions").insert(toRow(sub("Netflix"), id));
    expect((await adminClient().auth.admin.deleteUser(id)).error).toBeNull();
    const admin = adminClient();
    expect((await admin.from("subscriptions").select("id").eq("user_id", id)).data).toEqual([]);
    expect((await admin.from("profiles").select("id").eq("id", id)).data).toEqual([]);
  });
});
