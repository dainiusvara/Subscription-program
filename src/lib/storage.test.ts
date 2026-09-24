import { describe, expect, it } from "vitest";
import { STORAGE_KEY, loadState, sanitizeState, sanitizeSubscription, saveState } from "./storage";

const TODAY = "2026-09-24";

let counter = 0;
const makeId = () => `id-${++counter}`;

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

const valid = {
  id: "a",
  name: "Netflix",
  price: 13.99,
  cycle: "month",
  nextCharge: "2026-10-01",
  billingDay: 1,
  category: "Streaming",
  color: "#B81D24",
  used: true,
  trial: false,
};

describe("sanitizeSubscription", () => {
  it("accepts a valid subscription as is", () => {
    expect(sanitizeSubscription(valid)).toEqual(valid);
  });

  it("drops entries that can't be repaired", () => {
    expect(sanitizeSubscription(null)).toBeNull();
    expect(sanitizeSubscription({ ...valid, id: "" })).toBeNull();
    expect(sanitizeSubscription({ ...valid, name: "   " })).toBeNull();
    expect(sanitizeSubscription({ ...valid, price: -1 })).toBeNull();
    expect(sanitizeSubscription({ ...valid, price: "13.99" })).toBeNull();
    expect(sanitizeSubscription({ ...valid, price: Number.NaN })).toBeNull();
    expect(sanitizeSubscription({ ...valid, cycle: "daily" })).toBeNull();
    expect(sanitizeSubscription({ ...valid, nextCharge: "2026-02-30" })).toBeNull();
    expect(sanitizeSubscription({ ...valid, nextCharge: "1900-01-01" })).toBeNull();
  });

  it("repairs fields it can default", () => {
    const repaired = sanitizeSubscription({
      ...valid,
      name: "  Netflix  ",
      billingDay: 40,
      category: "Snacks",
      color: "red; background: url(x)",
      used: undefined,
      trial: "yes",
    });
    expect(repaired).toEqual({
      ...valid,
      billingDay: 1,
      category: "Other",
      color: "#4B5E58",
      used: true,
      trial: false,
    });
  });

  it("keeps the after-trial price only for trials", () => {
    expect(sanitizeSubscription({ ...valid, trial: true, price: 0, priceAfterTrial: 9.99 })).toMatchObject({
      trial: true,
      priceAfterTrial: 9.99,
    });
    expect(sanitizeSubscription({ ...valid, trial: true, price: 0 })).toMatchObject({ priceAfterTrial: 0 });
    expect(sanitizeSubscription({ ...valid, priceAfterTrial: 9.99 })).not.toHaveProperty("priceAfterTrial");
  });
});

describe("sanitizeState", () => {
  it("rejects data that isn't a Drip state", () => {
    expect(sanitizeState(null)).toBeNull();
    expect(sanitizeState([])).toBeNull();
    expect(sanitizeState({ subs: "nope" })).toBeNull();
  });

  it("keeps good subscriptions, drops bad ones and duplicates", () => {
    const state = sanitizeState({
      subs: [valid, { ...valid }, { ...valid, id: "b", price: -5 }, { ...valid, id: "c" }],
      currency: "USD",
      proPreview: true,
      example: false,
    });
    expect(state?.subs.map((s) => s.id)).toEqual(["a", "c"]);
    expect(state).toMatchObject({ version: 1, currency: "USD", proPreview: true, example: false });
  });

  it("falls back to euros and Free for unknown settings", () => {
    expect(sanitizeState({ subs: [], currency: "BTC", proPreview: "yes" })).toMatchObject({
      currency: "EUR",
      proPreview: false,
      example: false,
    });
  });
});

describe("loadState and saveState", () => {
  it("shows the examples on a first visit", () => {
    const state = loadState(memoryStorage(), TODAY, makeId);
    expect(state.example).toBe(true);
    expect(state.subs).toHaveLength(5);
  });

  it("shows the examples when storage is unavailable or corrupted", () => {
    expect(loadState(undefined, TODAY, makeId).example).toBe(true);
    expect(loadState(memoryStorage({ [STORAGE_KEY]: "{not json" }), TODAY, makeId).example).toBe(true);
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
    };
    expect(loadState(throwing, TODAY, makeId).example).toBe(true);
  });

  it("round-trips a saved state", () => {
    const storage = memoryStorage();
    const state = { version: 1 as const, subs: [valid as never], currency: "GBP" as const, proPreview: false, example: false };
    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage, TODAY, makeId)).toEqual(state);
  });

  it("reports when saving fails", () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const state = loadState(undefined, TODAY, makeId);
    expect(saveState(full, state)).toBe(false);
    expect(saveState(undefined, state)).toBe(false);
  });
});
