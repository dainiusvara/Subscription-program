import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, newUser } from "@/test/db";
import { toRow } from "./cloud";
import { runReminders, type Senders } from "./reminder-job";
import type { Subscription } from "./types";

// 09:00 UTC = 12:00 in Vilnius, so "today" is 2026-09-24 for every test user.
const NOW = new Date("2026-09-24T09:00:00Z");
const SITE = "https://drip.example";
const created: string[] = [];

afterAll(async () => {
  for (const id of created) await adminClient().auth.admin.deleteUser(id);
});

beforeEach(async () => {
  // Other test files leave Pro users behind; keep this run to our own users.
  await adminClient().from("profiles").update({ is_pro: false, pro_preview: false }).not("id", "in", `(${created.join(",") || "00000000-0000-0000-0000-000000000000"})`);
});

function sub(name: string, nextCharge: string, overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: crypto.randomUUID(),
    name,
    price: 9.99,
    cycle: "month",
    nextCharge,
    billingDay: Number(nextCharge.slice(8)),
    category: "Streaming",
    color: "#7A3B8F",
    used: true,
    trial: false,
    ...overrides,
  };
}

async function proUser(label: string, subs: Subscription[], profile: Record<string, unknown> = {}) {
  const user = await newUser(label);
  created.push(user.id);
  await adminClient()
    .from("profiles")
    .update({ pro_preview: true, timezone: "Europe/Vilnius", ...profile })
    .eq("id", user.id);
  if (subs.length) {
    const { error } = await user.client.from("subscriptions").insert(subs.map((s) => toRow(s, user.id)));
    if (error) throw error;
  }
  return user;
}

function recorder() {
  const emails: { to: string; subject: string; text: string }[] = [];
  const pushes: { endpoint: string; payload: { title: string; body: string } }[] = [];
  const senders: Senders = {
    email: async (message) => void emails.push(message),
    push: async (target, payload) => {
      pushes.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
      return target.endpoint.includes("gone") ? "gone" : "ok";
    },
  };
  return { emails, pushes, senders };
}

describe("reminder job", () => {
  it("emails Pro users once about charges in the next 3 days", async () => {
    const alice = await proUser("alice", [
      sub("Netflix", "2026-09-27"),
      sub("Gym", "2026-09-29"),
      sub("Disney+", "2026-09-25", { trial: true, price: 0, priceAfterTrial: 8.99 }),
    ]);
    const free = await newUser("free");
    created.push(free.id);
    await free.client.from("subscriptions").insert(toRow(sub("Spotify", "2026-09-25"), free.id));

    const first = recorder();
    const result = await runReminders(adminClient(), first.senders, { now: NOW, siteUrl: SITE });
    expect(result).toMatchObject({ emails: 1, failures: 0 });
    expect(first.emails).toHaveLength(1);
    expect(first.emails[0].to).toBe(alice.email);
    expect(first.emails[0].subject).toBe("2 charges coming up: €18.98 in the next 3 days");
    expect(first.emails[0].text).toContain("Disney+: free trial ends Fri 25 Sep (tomorrow), then €8.99 / month");
    expect(first.emails[0].text).toContain("Netflix: €9.99 on Sun 27 Sep (in 3 days)");
    expect(first.emails[0].text).not.toContain("Gym");

    const second = recorder();
    await runReminders(adminClient(), second.senders, { now: NOW, siteUrl: SITE });
    expect(second.emails).toEqual([]);

    // Two days later the gym is inside the window; the others were already sent.
    const later = recorder();
    await runReminders(adminClient(), later.senders, { now: new Date("2026-09-26T09:00:00Z"), siteUrl: SITE });
    expect(later.emails.map((e) => e.subject)).toEqual(["Gym charges you €9.99 in 3 days"]);
  });

  it("uses the user's time zone", async () => {
    // 22:30 UTC on the 24th is already the 25th in Vilnius, so the 28th is 3 days away there.
    const vilnius = await proUser("tz-vilnius", [sub("Netflix", "2026-09-28")]);
    const la = await proUser("tz-la", [sub("Netflix", "2026-09-28")], { timezone: "America/Los_Angeles" });
    const { emails, senders } = recorder();
    await runReminders(adminClient(), senders, { now: new Date("2026-09-24T22:30:00Z"), siteUrl: SITE });
    expect(emails.map((e) => e.to)).toContain(vilnius.email);
    expect(emails.map((e) => e.to)).not.toContain(la.email);
  });

  it("respects the email setting and sends to every registered device", async () => {
    const bob = await proUser("bob", [sub("Netflix", "2026-09-26")], { remind_email: false });
    for (const endpoint of ["https://push.example/phone", "https://push.example/laptop"]) {
      const { error } = await bob.client.rpc("register_push", { p_endpoint: endpoint, p_p256dh: "key", p_auth: "auth" });
      expect(error).toBeNull();
    }
    const { emails, pushes, senders } = recorder();
    await runReminders(adminClient(), senders, { now: NOW, siteUrl: SITE });
    expect(emails.filter((e) => e.to === bob.email)).toEqual([]);
    const bobs = pushes.filter((p) => p.endpoint.startsWith("https://push.example/"));
    expect(bobs.map((p) => p.endpoint).sort()).toEqual(["https://push.example/laptop", "https://push.example/phone"]);
    expect(bobs[0].payload.title).toBe("Netflix charges you €9.99 in 2 days");
  });

  it("forgets devices that unsubscribed", async () => {
    const carol = await proUser("carol", [sub("Netflix", "2026-09-26")]);
    await carol.client.rpc("register_push", { p_endpoint: "https://push.example/gone-1", p_p256dh: "k", p_auth: "a" });
    const { senders } = recorder();
    await runReminders(adminClient(), senders, { now: NOW, siteUrl: SITE });
    const { data } = await adminClient().from("push_subscriptions").select("id").eq("user_id", carol.id);
    expect(data).toEqual([]);
  });

  it("tries again next run when sending fails", async () => {
    const dave = await proUser("dave", [sub("Netflix", "2026-09-26")]);
    const failing: Senders = {
      email: async () => {
        throw new Error("Resend is down");
      },
    };
    const failed = await runReminders(adminClient(), failing, { now: NOW, siteUrl: SITE });
    expect(failed.failures).toBeGreaterThanOrEqual(1);
    const { emails, senders } = recorder();
    await runReminders(adminClient(), senders, { now: NOW, siteUrl: SITE });
    expect(emails.map((e) => e.to)).toContain(dave.email);
  });
});

describe("reminder tables are protected", () => {
  it("keeps the log server-only and devices private", async () => {
    const erin = await proUser("erin", []);
    const frank = await proUser("frank", []);
    expect((await erin.client.from("reminder_log").select("*")).error?.code).toBe("42501");
    await erin.client.rpc("register_push", { p_endpoint: "https://push.example/erin", p_p256dh: "k", p_auth: "a" });
    expect((await frank.client.from("push_subscriptions").select("endpoint")).data).toEqual([]);
    const direct = await frank.client
      .from("push_subscriptions")
      .insert({ user_id: frank.id, endpoint: "https://push.example/x", p256dh: "k", auth: "a" });
    expect(direct.error?.code).toBe("42501");
  });

  it("moves a device to whoever signed in on it last", async () => {
    const gina = await proUser("gina", []);
    const hank = await proUser("hank", []);
    const endpoint = "https://push.example/shared-tablet";
    await gina.client.rpc("register_push", { p_endpoint: endpoint, p_p256dh: "k", p_auth: "a" });
    await hank.client.rpc("register_push", { p_endpoint: endpoint, p_p256dh: "k", p_auth: "a" });
    const { data } = await adminClient().from("push_subscriptions").select("user_id").eq("endpoint", endpoint);
    expect(data).toEqual([{ user_id: hank.id }]);
  });

  it("lets users set their time zone and email preference, but checks the zone length", async () => {
    const ivy = await proUser("ivy", []);
    expect((await ivy.client.from("profiles").update({ timezone: "Asia/Tokyo", remind_email: false }).eq("id", ivy.id)).error).toBeNull();
    const tooLong = await ivy.client.from("profiles").update({ timezone: "x".repeat(65) }).eq("id", ivy.id);
    expect(tooLong.error?.code).toBe("23514");
  });
});
