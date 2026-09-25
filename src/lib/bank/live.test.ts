import { describe, expect, it } from "vitest";
import { addMonths } from "../billing";
import { detectSubscriptions } from "./detect";
import { CONSENT_DAYS, consentUntil, fromApiTransaction, planBankSync, syncFrom } from "./live";
import type { Transaction } from "./statement";
import type { Subscription } from "../types";

const TODAY = "2026-09-25";

describe("reading bank transactions", () => {
  it("reads a card payment: creditor and remittance text, money out as negative", () => {
    expect(
      fromApiTransaction({
        booking_date: "2026-09-20",
        status: "BOOK",
        credit_debit_indicator: "DBIT",
        transaction_amount: { currency: "EUR", amount: "13.99" },
        creditor: { name: "NETFLIX.COM" },
        debtor: { name: "Laura Example" },
        remittance_information: ["Card payment 4411", "Amsterdam"],
      }),
    ).toEqual({ date: "2026-09-20", description: "NETFLIX.COM Card payment 4411 Amsterdam", amount: -13.99 });
  });

  it("reads incoming money as positive, naming the payer", () => {
    expect(
      fromApiTransaction({
        value_date: "2026-09-01",
        credit_debit_indicator: "CRDT",
        transaction_amount: { amount: "1500.00" },
        debtor: { name: "Employer UAB" },
      }),
    ).toEqual({ date: "2026-09-01", description: "Employer UAB", amount: 1500 });
  });

  it("falls back to the amount's sign without a debit/credit flag", () => {
    expect(
      fromApiTransaction({ booking_date: "2026-09-02", transaction_amount: { amount: "-5.99" }, remittance_information: ["SPOTIFY"] })
        ?.amount,
    ).toBe(-5.99);
  });

  it("skips pending payments and anything it can't read", () => {
    const base = { booking_date: "2026-09-02", transaction_amount: { amount: "-5" }, remittance_information: ["X"] };
    expect(fromApiTransaction({ ...base, status: "PDNG" })).toBeNull();
    expect(fromApiTransaction({ ...base, booking_date: "02.09.2026" })).toBeNull();
    expect(fromApiTransaction({ ...base, transaction_amount: { amount: "abc" } })).toBeNull();
    expect(fromApiTransaction({ ...base, remittance_information: [] })).toBeNull();
  });
});

function monthly(description: string, amount: number, day: number, months: number, from = "2026-03"): Transaction[] {
  return Array.from({ length: months }, (_, m) => ({
    date: addMonths(`${from}-${String(day).padStart(2, "0")}`, m),
    description,
    amount,
  }));
}

let n = 0;
const makeId = () => `new-${++n}`;

function tracked(name: string): Subscription {
  return {
    id: `own-${name}`,
    name,
    price: 10,
    cycle: "month",
    nextCharge: "2026-10-01",
    billingDay: 1,
    category: "Other",
    color: "#4B5E58",
    used: true,
    trial: false,
  };
}

describe("a single charge from a new subscription", () => {
  it("adds a subscription-only service after its first charge", () => {
    const found = detectSubscriptions([{ date: "2026-09-23", description: "NETFLIX.COM", amount: -13.99 }], TODAY, [], {
      newServices: true,
    });
    expect(found.map((c) => [c.name, c.price, c.cycle, c.nextCharge])).toEqual([["Netflix", 13.99, "month", "2026-10-23"]]);
  });

  it("still needs two charges for stores that sell one-off things too, or old charges, or CSV files", () => {
    const appStore = [{ date: "2026-09-23", description: "APPLE.COM/BILL App Store", amount: -4.99 }];
    expect(detectSubscriptions(appStore, TODAY, [], { newServices: true })).toEqual([]);
    const old = [{ date: "2026-07-01", description: "NETFLIX.COM", amount: -13.99 }];
    expect(detectSubscriptions(old, TODAY, [], { newServices: true })).toEqual([]);
    const csv = [{ date: "2026-09-23", description: "NETFLIX.COM", amount: -13.99 }];
    expect(detectSubscriptions(csv, TODAY)).toEqual([]);
  });
});

describe("planBankSync", () => {
  const feed: Transaction[] = [
    ...monthly("SPOTIFY P2A3B4", -11.99, 9, 7),
    ...monthly("FitZone Vilnius direct debit", -29, 3, 7),
    { date: "2026-09-21", description: "NETFLIX.COM 866", amount: -13.99 },
    // Stopped in May: probably cancelled already.
    ...monthly("Deezer", -10.99, 12, 3, "2026-02"),
    // Groceries: not a subscription.
    { date: "2026-09-01", description: "MAXIMA LT", amount: -42.1 },
    { date: "2026-09-08", description: "MAXIMA LT", amount: -17.35 },
    { date: "2026-09-15", description: "MAXIMA LT", amount: -63.2 },
  ];

  it("adds what's new, recognises what the user already has, and skips stopped ones", () => {
    const plan = planBankSync(feed, TODAY, [tracked("Spotify")], new Set(), makeId);
    expect(plan.add.map((a) => [a.sub.name, a.sub.price, a.sub.cycle, a.sub.nextCharge, a.sub.billingDay])).toEqual([
      ["FitZone Vilnius", 29, "month", "2026-10-03", 3],
      ["Netflix", 13.99, "month", "2026-10-21", 21],
    ]);
    expect(plan.add.every((a) => a.sub.used && !a.sub.trial && a.sub.id.startsWith("new-"))).toBe(true);
    expect(plan.matched).toEqual([{ key: "service:spotify#0", subscriptionId: "own-Spotify" }]);
  });

  it("never adds a merchant twice, even after the user deleted it", () => {
    const first = planBankSync(feed, TODAY, [], new Set(), makeId);
    const handled = new Set([...first.add.map((a) => a.key), ...first.matched.map((m) => m.key)]);
    expect(planBankSync(feed, TODAY, [], handled, makeId)).toEqual({ add: [], matched: [] });
  });
});

describe("sync windows", () => {
  it("reads over a year the first time, then the last 89 days", () => {
    expect(syncFrom(TODAY, true)).toBe("2025-08-21");
    expect(syncFrom(TODAY, false)).toBe("2026-06-28");
  });

  it("asks for 180 days of access, or what the bank allows", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    expect(consentUntil(now, null).toISOString()).toBe(new Date(now.getTime() + CONSENT_DAYS * 86_400_000).toISOString());
    expect(consentUntil(now, 90 * 86_400).toISOString()).toBe("2026-12-24T00:00:00.000Z");
  });
});
