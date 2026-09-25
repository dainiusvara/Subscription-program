import { afterAll, describe, expect, it } from "vitest";
import { adminClient, newUser } from "@/test/db";
import { CONNECTION_COLUMNS, runBankSync, syncConnection, type ConnectionRow } from "./bank-sync";
import { BankApiError, type ApiTransaction, type BankApi } from "./bank/enable-banking";
import { toRow } from "./cloud";
import type { Senders } from "./reminder-job";
import type { Subscription } from "./types";

const NOW = new Date("2026-09-25T09:00:00Z");
const created: string[] = [];

afterAll(async () => {
  for (const id of created) await adminClient().auth.admin.deleteUser(id);
});

function sub(name: string, overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: crypto.randomUUID(),
    name,
    price: 9.99,
    cycle: "month",
    nextCharge: "2026-10-05",
    billingDay: 5,
    category: "Other",
    color: "#4B5E58",
    used: true,
    trial: false,
    ...overrides,
  };
}

async function user(label: string, pro = true) {
  const u = await newUser(label);
  created.push(u.id);
  await adminClient().from("profiles").update({ pro_preview: pro, timezone: "Europe/Vilnius" }).eq("id", u.id);
  return u;
}

function charge(date: string, name: string, amount: string): ApiTransaction {
  return {
    booking_date: date,
    status: "BOOK",
    credit_debit_indicator: "DBIT",
    transaction_amount: { currency: "EUR", amount },
    creditor: { name },
  };
}

/** A bank that returns the given transactions, or throws. */
function fakeBank(feed: ApiTransaction[] | Error): BankApi & { reads: number } {
  const api = {
    reads: 0,
    listBanks: async () => [],
    startAuth: async () => "https://bank.test",
    createSession: async () => ({ sessionId: "s", accounts: [], bankName: "", bankCountry: "", validUntil: null }),
    deleteSession: async () => undefined,
    transactions: async () => {
      api.reads++;
      if (feed instanceof Error) throw feed;
      return feed;
    },
  };
  return api;
}

const FEED: ApiTransaction[] = [
  charge("2026-09-21", "NETFLIX.COM", "13.99"),
  ...["2026-06-03", "2026-07-03", "2026-08-03", "2026-09-03"].map((d) => charge(d, "FitZone Vilnius", "29.00")),
  ...["2026-07-09", "2026-08-09", "2026-09-09"].map((d) => charge(d, "SPOTIFY AB", "11.99")),
];

async function connect(userId: string, overrides: Record<string, unknown> = {}): Promise<ConnectionRow> {
  const { data, error } = await adminClient()
    .from("bank_connections")
    .insert({
      user_id: userId,
      bank_name: "Swedbank",
      bank_country: "LT",
      status: "active",
      session_id: crypto.randomUUID(),
      account_ids: ["acc-1"],
      ...overrides,
    })
    .select(CONNECTION_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

describe("bank sync", () => {
  it("adds new subscriptions, matches known ones, and never re-adds a deleted one", async () => {
    const laura = await user("bank-laura");
    await laura.client.from("subscriptions").insert(toRow(sub("Spotify"), laura.id));
    const connection = await connect(laura.id);

    const first = await syncConnection(adminClient(), fakeBank(FEED), connection, { now: NOW, first: true });
    expect(first.ok && first.added.map((s) => [s.name, s.price, s.nextCharge])).toEqual([
      ["FitZone Vilnius", 29, "2026-10-03"],
      ["Netflix", 13.99, "2026-10-21"],
    ]);

    // She sees them in her own list, and which ones came from the bank.
    const { data: rows } = await laura.client.from("subscriptions").select("id, name").order("name");
    expect(rows?.map((r) => r.name)).toEqual(["FitZone Vilnius", "Netflix", "Spotify"]);
    const { data: detections } = await laura.client.from("bank_detections").select("merchant_key, outcome, subscription_id");
    expect(detections?.map((d) => d.outcome).sort()).toEqual(["added", "added", "matched"]);

    // She deletes the gym; the next sync leaves it deleted.
    const gym = rows!.find((r) => r.name === "FitZone Vilnius")!;
    await laura.client.from("subscriptions").delete().eq("id", gym.id);
    const again = await syncConnection(adminClient(), fakeBank(FEED), connection, { now: NOW });
    expect(again).toEqual({ ok: true, added: [] });
    const { count } = await laura.client.from("subscriptions").select("id", { count: "exact", head: true });
    expect(count).toBe(2);

    const { data: status } = await laura.client.from("bank_connections").select("status, last_synced_at, last_error");
    expect(status).toEqual([{ status: "active", last_synced_at: expect.any(String), last_error: null }]);
  });

  it("two syncs at once add each subscription only once", async () => {
    const tomas = await user("bank-race");
    const connection = await connect(tomas.id);
    await Promise.all([
      syncConnection(adminClient(), fakeBank(FEED), connection, { now: NOW }),
      syncConnection(adminClient(), fakeBank(FEED), connection, { now: NOW }),
    ]);
    const { data } = await tomas.client.from("subscriptions").select("name");
    expect(data?.map((r) => r.name).sort()).toEqual(["FitZone Vilnius", "Netflix", "Spotify Premium"]);
  });

  it("marks the connection expired when the bank's consent ended", async () => {
    const u = await user("bank-expired");
    const connection = await connect(u.id);
    const outcome = await syncConnection(adminClient(), fakeBank(new BankApiError(401, "EXPIRED_SESSION", "expired")), connection, { now: NOW });
    expect(outcome).toMatchObject({ ok: false, reason: "expired" });
    const { data } = await u.client.from("bank_connections").select("status, last_error").single();
    expect(data?.status).toBe("expired");
    expect(data?.last_error).toMatch(/Reconnect/);
  });

  it("keeps the connection on a temporary error, and does nothing without Pro", async () => {
    const u = await user("bank-flaky");
    const connection = await connect(u.id);
    const flaky = await syncConnection(adminClient(), fakeBank(new BankApiError(503, null, "down")), connection, { now: NOW });
    expect(flaky).toMatchObject({ ok: false, reason: "error" });
    const { data } = await u.client.from("bank_connections").select("status").single();
    expect(data?.status).toBe("active");

    const free = await user("bank-free", false);
    const bank = fakeBank(FEED);
    expect(await syncConnection(adminClient(), bank, await connect(free.id), { now: NOW })).toMatchObject({ reason: "not_pro" });
    expect(bank.reads).toBe(0);
  });

  it("the daily run tells users what it added", async () => {
    const u = await user("bank-daily");
    await connect(u.id);
    const emails: { to: string; subject: string }[] = [];
    const senders: Senders = { email: async (m) => void emails.push(m) };
    const result = await runBankSync(adminClient(), fakeBank(FEED), senders, { now: NOW, siteUrl: "https://drip.test" });
    expect(result.added).toBeGreaterThanOrEqual(3);
    expect(emails.find((e) => e.to === u.email)?.subject).toBe("Drip added 3 subscriptions from your bank");
  });
});

describe("bank tables are locked down", () => {
  it("users read their own connection's status, never the provider session or anyone else's", async () => {
    const a = await user("bank-a");
    const b = await user("bank-b");
    await connect(a.id);

    const own = await a.client.from("bank_connections").select("bank_name, status");
    expect(own.data).toEqual([{ bank_name: "Swedbank", status: "active" }]);
    const secret = await a.client.from("bank_connections").select("session_id");
    expect(secret.error?.code).toBe("42501");
    const state = await a.client.from("bank_connections").select("auth_state");
    expect(state.error?.code).toBe("42501");
    const other = await b.client.from("bank_connections").select("bank_name");
    expect(other.data).toEqual([]);
  });

  it("users can't create, change or delete connections or detections themselves", async () => {
    const a = await user("bank-write");
    const insert = await a.client
      .from("bank_connections")
      .insert({ user_id: a.id, bank_name: "Fake", bank_country: "LT", status: "active" });
    expect(insert.error?.code).toBe("42501");
    await connect(a.id);
    const update = await a.client.from("bank_connections").update({ status: "expired" }).eq("user_id", a.id);
    expect(update.error?.code).toBe("42501");
    const detection = await a.client.from("bank_detections").insert({ user_id: a.id, merchant_key: "x", outcome: "added" });
    expect(detection.error?.code).toBe("42501");
  });
});

describe("cancelled subscriptions in the database", () => {
  it("don't count towards the Free limit, and restoring one counts as adding", async () => {
    const u = await user("cancel-free", false);
    const five = Array.from({ length: 5 }, (_, i) => sub(`Sub ${i}`));
    expect((await u.client.from("subscriptions").insert(five.map((s) => toRow(s, u.id)))).error).toBeNull();

    // Cancel one: a slot opens.
    const cancelled = { ...five[0], cancelledOn: "2026-09-25" };
    expect((await u.client.from("subscriptions").upsert(toRow(cancelled, u.id))).error).toBeNull();
    expect((await u.client.from("subscriptions").insert(toRow(sub("Sixth"), u.id))).error).toBeNull();

    // Five are being paid for again, so restoring is refused.
    const restore = await u.client.from("subscriptions").update({ cancelled_on: null }).eq("id", five[0].id);
    expect(restore.error?.hint).toBe("free_limit");

    // Adding one that is already cancelled is fine.
    const extra = await u.client.from("subscriptions").insert(toRow(sub("Old", { cancelledOn: "2026-01-01" }), u.id));
    expect(extra.error).toBeNull();
  });

  it("can't stay shared with the family", async () => {
    const u = await user("cancel-shared");
    const { data: family } = await u.client.rpc("create_household", { p_name: "Home" });
    const row = { ...toRow(sub("Netflix", { cancelledOn: "2026-09-25", shared: true }), u.id, family!.id) };
    const { error } = await u.client.from("subscriptions").insert(row);
    expect(error?.code).toBe("23514");
  });
});
