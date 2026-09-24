import { describe, expect, it } from "vitest";
import {
  applyOutbox,
  describeRejection,
  diffSubs,
  enqueue,
  fromRow,
  isNetworkError,
  pendingCurrency,
  toRow,
  withUuid,
  type OutboxOp,
} from "./cloud";
import type { Subscription } from "./types";

const ID_A = "0b9f4c1e-6d7a-4c1b-9d33-1f2e3a4b5c6d";
const ID_B = "7c2d1e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const USER = "11111111-2222-4333-8444-555555555555";

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: ID_A,
    name: "Netflix",
    price: 13.99,
    cycle: "month",
    nextCharge: "2026-10-01",
    billingDay: 1,
    category: "Streaming",
    color: "#B81D24",
    used: true,
    trial: false,
    ...overrides,
  };
}

describe("row mapping", () => {
  it("round-trips a paid subscription", () => {
    const row = toRow(sub(), USER);
    expect(row).toMatchObject({ id: ID_A, user_id: USER, next_charge: "2026-10-01", price_after_trial: null });
    expect(fromRow(row)).toEqual(sub());
  });

  it("round-trips a trial with its after-trial price", () => {
    const trial = sub({ trial: true, price: 0, priceAfterTrial: 9.99 });
    const row = toRow(trial, USER);
    expect(row.price_after_trial).toBe(9.99);
    expect(fromRow(row)).toEqual(trial);
  });

  it("reads numeric columns sent as strings", () => {
    const row = { ...toRow(sub(), USER), price: "13.99" as unknown as number };
    expect(fromRow(row)?.price).toBe(13.99);
  });

  it("drops rows that fail validation", () => {
    expect(fromRow({ ...toRow(sub(), USER), cycle: "daily" })).toBeNull();
  });

  it("gives non-UUID ids a UUID so the database accepts them", () => {
    expect(withUuid(sub()).id).toBe(ID_A);
    expect(withUuid(sub({ id: "abc123" }), () => ID_B).id).toBe(ID_B);
  });
});

describe("outbox", () => {
  it("keeps only the latest change per subscription and setting", () => {
    let outbox: OutboxOp[] = [];
    outbox = enqueue(outbox, [{ kind: "upsert", sub: sub({ price: 1 }) }, { kind: "currency", currency: "USD" }]);
    outbox = enqueue(outbox, [{ kind: "upsert", sub: sub({ price: 2 }) }]);
    outbox = enqueue(outbox, [{ kind: "currency", currency: "GBP" }]);
    expect(outbox).toEqual([
      { kind: "upsert", sub: sub({ price: 2 }) },
      { kind: "currency", currency: "GBP" },
    ]);
    outbox = enqueue(outbox, [{ kind: "delete", id: ID_A }]);
    expect(outbox).toEqual([{ kind: "currency", currency: "GBP" }, { kind: "delete", id: ID_A }]);
  });

  it("finds what changed between two lists", () => {
    const a = sub();
    const b = sub({ id: ID_B, name: "Spotify" });
    expect(diffSubs([a, b], [a, b])).toEqual([]);
    expect(diffSubs([a], [a, b])).toEqual([{ kind: "upsert", sub: b }]);
    expect(diffSubs([a, b], [b])).toEqual([{ kind: "delete", id: ID_A }]);
    const edited = { ...a, used: false };
    expect(diffSubs([a, b], [edited, b])).toEqual([{ kind: "upsert", sub: edited }]);
    const trial = { ...a, trial: true, price: 0, priceAfterTrial: 5 };
    expect(diffSubs([trial], [{ ...trial, priceAfterTrial: 6 }])).toHaveLength(1);
  });

  it("lays unsent changes over the server's list", () => {
    const server = [sub(), sub({ id: ID_B, name: "Spotify" })];
    const outbox: OutboxOp[] = [
      { kind: "upsert", sub: sub({ price: 15.99 }) },
      { kind: "delete", id: ID_B },
      { kind: "upsert", sub: sub({ id: "new", name: "Hulu" }) },
    ];
    expect(applyOutbox(server, outbox).map((s) => [s.name, s.price])).toEqual([
      ["Netflix", 15.99],
      ["Hulu", 13.99],
    ]);
  });

  it("reports a currency change that hasn't been sent", () => {
    expect(pendingCurrency([])).toBeNull();
    expect(pendingCurrency([{ kind: "currency", currency: "USD" }, { kind: "delete", id: "x" }])).toBe("USD");
  });
});

describe("errors", () => {
  it("tells network failures from server refusals", () => {
    expect(isNetworkError({ code: "", message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "fetch failed" })).toBe(true);
    expect(isNetworkError({ code: "P0001", message: "The Free plan covers 5 subscriptions" })).toBe(false);
    expect(isNetworkError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });

  it("explains the Free limit", () => {
    expect(describeRejection({ hint: "free_limit" })).toBe("The Free plan covers 5 subscriptions.");
    expect(describeRejection({ message: "violates check constraint" })).toBe("The server didn't accept this change.");
  });
});
