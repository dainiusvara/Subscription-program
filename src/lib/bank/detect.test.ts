import { describe, expect, it } from "vitest";
import { addDays, addMonths } from "../billing";
import { detectSubscriptions, findService, merchantKey } from "./detect";
import { sampleStatement } from "./sample";
import { parseStatement, type Transaction } from "./statement";

const TODAY = "2026-09-24";

describe("merchant names", () => {
  it("keeps the words that name the merchant", () => {
    expect(merchantKey("NETFLIX.COM 866-579-7172 CA")).toBe("netflix ca");
    expect(merchantKey("SPOTIFY P2A3B4C5D Stockholm")).toBe("spotify stockholm");
    expect(merchantKey("PAYPAL *GYMSHARK 4029357733")).toBe("gymshark");
    expect(merchantKey("Direct debit FitZone Vilnius")).toBe("fitzone vilnius");
  });

  it("recognises known services, even run together", () => {
    expect(findService("GOOGLE *YouTubePremium g.co/helppay")?.id).toBe("youtube");
    expect(findService("APPLE.COM/BILL · iCloud+ ITUNES.COM")?.id).toBe("icloud");
    expect(findService("Netflix International B.V. · Abo 12345")?.id).toBe("netflix");
    expect(findService("MICROSOFT*XBOX Game Pass")?.id).toBe("xbox");
    expect(findService("Maxima LT")).toBeNull();
  });
});

function monthly(description: string, amount: number, day: number, months: number, from = "2026-02"): Transaction[] {
  return Array.from({ length: months }, (_, m) => ({
    date: addMonths(`${from}-${String(day).padStart(2, "0")}`, m),
    description,
    amount,
  }));
}

describe("detectSubscriptions", () => {
  it("finds the subscriptions in the sample statement and nothing else", () => {
    const { transactions } = parseStatement(sampleStatement(TODAY));
    const found = detectSubscriptions(transactions, TODAY);
    expect(found.map((c) => [c.name, c.price, c.cycle, c.stopped])).toEqual([
      ["Fitzone Vilnius", 29, "month", false],
      ["Netflix", 13.99, "month", false],
      ["YouTube Premium", 13.99, "month", false],
      ["Spotify Premium", 11.99, "month", false],
      ["iCloud+", 2.99, "month", false],
      ["Xbox Game Pass", 14.99, "month", true],
    ]);
    for (const c of found) expect(c.nextCharge >= TODAY).toBe(true);
    expect(found.find((c) => c.name === "Netflix")).toMatchObject({ category: "Streaming", color: "#B81D24" });
  });

  it("predicts the next charge from the last one", () => {
    const found = detectSubscriptions(monthly("Netflix", -13.99, 3, 7), TODAY);
    expect(found[0]).toMatchObject({ lastCharge: "2026-08-03", nextCharge: "2026-10-03", occurrences: 7 });
  });

  it("keeps one subscription through a price rise", () => {
    const txs = [...monthly("Netflix", -12.99, 3, 3), ...monthly("Netflix", -13.99, 3, 3, "2026-05")];
    const found = detectSubscriptions(txs, TODAY);
    expect(found).toHaveLength(1);
    expect(found[0].price).toBe(13.99);
  });

  it("detects weekly, quarterly and yearly charges", () => {
    const weekly = Array.from({ length: 5 }, (_, i) => ({ date: addDays("2026-08-01", i * 7), description: "Delfi Plius", amount: -1.99 }));
    const quarterly = [0, 3, 6].map((m) => ({ date: addMonths("2026-01-10", m), description: "Insurance Co policy", amount: -45 }));
    const yearly = [
      { date: "2025-03-01", description: "Amazon Prime", amount: -89.9 },
      { date: "2026-03-01", description: "Amazon Prime", amount: -89.9 },
    ];
    const found = detectSubscriptions([...weekly, ...quarterly, ...yearly], TODAY);
    expect(Object.fromEntries(found.map((c) => [c.name, c.cycle]))).toEqual({
      "Delfi Plius": "week",
      "Insurance Policy": "quarter",
      "Amazon Prime": "year",
    });
  });

  it("ignores irregular or one-off payments and money coming in", () => {
    const txs: Transaction[] = [
      { date: "2026-06-01", description: "Hardware store", amount: -20 },
      { date: "2026-06-19", description: "Hardware store", amount: -20 },
      { date: "2026-08-30", description: "Hardware store", amount: -20 },
      { date: "2026-07-02", description: "Concert tickets", amount: -60 },
      ...monthly("Employer salary", 2450, 25, 6),
      ...monthly("Rimi", -34.12, 5, 2),
    ];
    expect(detectSubscriptions(txs, TODAY)).toEqual([]);
  });

  it("needs three charges from an unknown merchant, two from a known service", () => {
    expect(detectSubscriptions(monthly("Local Gym", -30, 5, 2), TODAY)).toEqual([]);
    expect(detectSubscriptions(monthly("Local Gym", -30, 5, 3), TODAY)).toHaveLength(1);
    expect(detectSubscriptions(monthly("Spotify", -11.99, 5, 2), TODAY)).toHaveLength(1);
  });

  it("marks subscriptions already in Drip", () => {
    const found = detectSubscriptions(monthly("NETFLIX.COM", -13.99, 3, 4), TODAY, [{ name: "Netflix" }]);
    expect(found[0].alreadyTracked).toBe(true);
  });
});
