import { describe, expect, it } from "vitest";
import {
  dueReminders,
  escapeHtml,
  isValidTimeZone,
  reminderEmail,
  reminderKey,
  reminderPush,
  todayInTimeZone,
} from "./reminders";
import type { Subscription } from "./types";

const TODAY = "2026-09-24";

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: overrides.name ?? "netflix",
    name: "Netflix",
    price: 13.99,
    cycle: "month",
    nextCharge: "2026-09-27",
    billingDay: 27,
    category: "Streaming",
    color: "#B81D24",
    used: true,
    trial: false,
    ...overrides,
  };
}

describe("dueReminders", () => {
  it("includes charges from today to 3 days away", () => {
    const subs = [
      sub({ id: "a", name: "Today", nextCharge: "2026-09-24" }),
      sub({ id: "b", name: "In3", nextCharge: "2026-09-27" }),
      sub({ id: "c", name: "In4", nextCharge: "2026-09-28" }),
    ];
    expect(dueReminders(subs, TODAY, new Set()).map((r) => [r.name, r.daysAway])).toEqual([
      ["Today", 0],
      ["In3", 3],
    ]);
  });

  it("never reminds about a cancelled subscription", () => {
    const subs = [sub({ id: "a", nextCharge: "2026-09-26", cancelledOn: "2026-09-20" })];
    expect(dueReminders(subs, TODAY, new Set())).toEqual([]);
  });

  it("skips what was already sent", () => {
    const subs = [sub({ id: "a", nextCharge: "2026-09-26" })];
    expect(dueReminders(subs, TODAY, new Set([reminderKey("a", "2026-09-26")]))).toEqual([]);
  });

  it("rolls stale dates forward before checking", () => {
    const stale = sub({ id: "a", nextCharge: "2026-08-26", billingDay: 26 });
    expect(dueReminders([stale], TODAY, new Set())).toMatchObject([{ chargeDate: "2026-09-26", daysAway: 2 }]);
  });

  it("flags a free trial ending, with the price it turns into", () => {
    const trial = sub({ id: "t", name: "Disney+", trial: true, price: 0, priceAfterTrial: 9.99, nextCharge: "2026-09-27" });
    expect(dueReminders([trial], TODAY, new Set())).toEqual([
      { subscriptionId: "t", name: "Disney+", chargeDate: "2026-09-27", daysAway: 3, amount: 9.99, trialEnds: true, unit: "month" },
    ]);
  });
});

describe("time zones", () => {
  it("finds today in the user's zone", () => {
    const lateUtc = new Date("2026-09-24T22:30:00Z");
    expect(todayInTimeZone("UTC", lateUtc)).toBe("2026-09-24");
    expect(todayInTimeZone("Europe/Vilnius", lateUtc)).toBe("2026-09-25");
    expect(todayInTimeZone("America/Los_Angeles", new Date("2026-09-25T03:00:00Z"))).toBe("2026-09-24");
    expect(todayInTimeZone("Not/AZone", lateUtc)).toBe("2026-09-24");
  });

  it("validates zone names", () => {
    expect(isValidTimeZone("Europe/Vilnius")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});

describe("messages", () => {
  const one = dueReminders([sub()], TODAY, new Set());
  const trial = dueReminders(
    [sub({ id: "t", name: "Disney+", trial: true, price: 0, priceAfterTrial: 9.99, nextCharge: "2026-09-25", billingDay: 25 })],
    TODAY,
    new Set(),
  );

  it("names the charge in the subject", () => {
    expect(reminderEmail(one, "EUR", "https://drip.example").subject).toBe("Netflix charges you €13.99 in 3 days");
    expect(reminderEmail(trial, "EUR", "https://drip.example").subject).toBe("Your Disney+ free trial ends tomorrow");
  });

  it("sums several charges", () => {
    const email = reminderEmail([...one, ...trial], "GBP", "https://drip.example");
    expect(email.subject).toBe("2 charges coming up: £23.98 in the next 3 days");
    expect(email.text).toContain("- Netflix: £13.99 on Sun 27 Sep (in 3 days)");
    expect(email.text).toContain("- Disney+: free trial ends Fri 25 Sep (tomorrow), then £9.99 / month");
    expect(email.text).toContain("https://drip.example");
  });

  it("escapes names in the HTML", () => {
    const sneaky = dueReminders([sub({ name: '<img src=x onerror="alert(1)">' })], TODAY, new Set());
    const { html } = reminderEmail(sneaky, "EUR", "https://drip.example");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml(`a&b'c`)).toBe("a&amp;b&#39;c");
  });

  it("words the cancel hint for one or several charges", () => {
    expect(reminderEmail(one, "EUR", "https://drip.example").text).toContain("Not using it anymore?");
    expect(reminderEmail([...one, ...trial], "EUR", "https://drip.example").text).toContain("Not using one of these?");
  });

  it("builds a notification", () => {
    expect(reminderPush(one, "EUR")).toEqual({
      title: "Netflix charges you €13.99 in 3 days",
      body: "Netflix: €13.99 on Sun 27 Sep (in 3 days)",
      url: "/",
      tag: "drip-netflix:2026-09-27",
    });
  });
});
