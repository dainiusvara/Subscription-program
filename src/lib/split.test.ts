import { describe, expect, it } from "vitest";
import { familySplit, perPerson, type SharedSubscription } from "./split";

function shared(ownerId: string, price: number, overrides: Partial<SharedSubscription> = {}): SharedSubscription {
  return {
    id: `${ownerId}-${price}`,
    ownerId,
    name: "Sub",
    price,
    cycle: "month",
    nextCharge: "2026-10-01",
    billingDay: 1,
    category: "Streaming",
    color: "#7A3B8F",
    used: true,
    trial: false,
    shared: true,
    ...overrides,
  };
}

describe("familySplit", () => {
  it("splits the total equally and shows who owes whom", () => {
    const split = familySplit([shared("anna", 18), shared("ben", 12)], ["anna", "ben", "cara"]);
    expect(split.totalMonthly).toBe(30);
    expect(split.members).toEqual([
      { userId: "anna", pays: 18, share: 10, balance: 8 },
      { userId: "ben", pays: 12, share: 10, balance: 2 },
      { userId: "cara", pays: 0, share: 10, balance: -10 },
    ]);
    expect(split.members.reduce((sum, m) => sum + m.balance, 0)).toBeCloseTo(0);
  });

  it("uses monthly equivalents and skips free trials", () => {
    const split = familySplit(
      [shared("anna", 120, { cycle: "year" }), shared("anna", 9.99, { trial: true, price: 0, priceAfterTrial: 9.99 })],
      ["anna", "ben"],
    );
    expect(split.totalMonthly).toBe(10);
    expect(split.members[1]).toEqual({ userId: "ben", pays: 0, share: 5, balance: -5 });
  });

  it("handles an empty family", () => {
    expect(familySplit([], [])).toEqual({ totalMonthly: 0, members: [] });
    expect(perPerson(shared("a", 12), 3)).toBe(4);
    expect(perPerson(shared("a", 12), 0)).toBe(12);
  });
});
