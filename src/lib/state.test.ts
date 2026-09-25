import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, FREE_LIMIT } from "./catalog";
import {
  addSubscription,
  cancelSubscription,
  clearExamples,
  createSampleState,
  deleteSubscription,
  isAtFreeLimit,
  restoreSubscription,
  rollState,
  setProPreview,
  toggleUsed,
  updateSubscription,
} from "./state";
import type { DripState, SubscriptionInput } from "./types";

const TODAY = "2026-09-24";

let counter = 0;
const makeId = () => `id-${++counter}`;

const input = (overrides: Partial<SubscriptionInput> = {}): SubscriptionInput => ({
  name: "Hulu",
  price: 7.99,
  cycle: "month",
  nextCharge: "2026-10-01",
  category: "Streaming",
  trial: false,
  ...overrides,
});

function ownList(count: number, proPreview = false): DripState {
  let state: DripState = { ...createSampleState(TODAY, makeId), subs: [], example: false, proPreview };
  for (let i = 0; i < count; i++) {
    const result = addSubscription({ ...state, proPreview: true }, input({ name: `Sub ${i}` }), makeId());
    if (!result.ok) throw new Error("setup failed");
    state = { ...result.state, proPreview };
  }
  return state;
}

describe("sample state", () => {
  it("starts with five example subscriptions dated from today", () => {
    const state = createSampleState(TODAY, makeId);
    expect(state.example).toBe(true);
    expect(state.proPreview).toBe(false);
    expect(state.currency).toBe("EUR");
    expect(state.subs.map((s) => [s.name, s.nextCharge])).toEqual([
      ["Netflix", "2026-09-27"],
      ["Spotify", "2026-10-03"],
      ["Xbox Game Pass", "2026-10-10"],
      ["Disney+", "2026-09-29"],
      ["iCloud+", "2026-10-18"],
    ]);
    expect(new Set(state.subs.map((s) => s.id)).size).toBe(5);
  });
});

describe("addSubscription", () => {
  it("replaces the examples with the user's first subscription", () => {
    const result = addSubscription(createSampleState(TODAY, makeId), input(), "new");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.example).toBe(false);
    expect(result.state.subs.map((s) => s.name)).toEqual(["Hulu"]);
  });

  it("fills in defaults for a new subscription", () => {
    const result = addSubscription(ownList(0), input({ name: "  Hulu  " }), "new");
    if (!result.ok) throw new Error("expected ok");
    expect(result.sub).toEqual({
      id: "new",
      name: "Hulu",
      price: 7.99,
      cycle: "month",
      nextCharge: "2026-10-01",
      billingDay: 1,
      category: "Streaming",
      color: CATEGORY_COLORS.Streaming,
      used: true,
      trial: false,
    });
  });

  it("stores a free trial as free now, with its price after the trial", () => {
    const result = addSubscription(ownList(0), input({ trial: true, price: 9.99 }), "t");
    if (!result.ok) throw new Error("expected ok");
    expect(result.sub).toMatchObject({ trial: true, price: 0, priceAfterTrial: 9.99 });
  });

  it("keeps a preset's brand colour", () => {
    const result = addSubscription(ownList(0), input({ color: "#B81D24" }), "p");
    if (!result.ok) throw new Error("expected ok");
    expect(result.sub.color).toBe("#B81D24");
  });

  it(`stops at ${FREE_LIMIT} on the Free plan`, () => {
    const full = ownList(FREE_LIMIT);
    expect(isAtFreeLimit(full)).toBe(true);
    expect(addSubscription(full, input(), "x")).toEqual({ ok: false, reason: "limit" });
    expect(isAtFreeLimit(ownList(FREE_LIMIT - 1))).toBe(false);
  });

  it("has no limit with Pro preview on", () => {
    const full = ownList(FREE_LIMIT, true);
    expect(isAtFreeLimit(full)).toBe(false);
    expect(addSubscription(full, input(), "x").ok).toBe(true);
  });

  it("lets a full Free list of examples be replaced", () => {
    const sample = createSampleState(TODAY, makeId);
    expect(sample.subs).toHaveLength(FREE_LIMIT);
    expect(addSubscription(sample, input(), "x").ok).toBe(true);
  });
});

describe("updateSubscription", () => {
  const base = () => {
    const result = addSubscription(ownList(0), input({ nextCharge: "2026-10-31" }), "a");
    if (!result.ok) throw new Error("setup failed");
    return toggleUsed(result.state, "a");
  };

  it("keeps the id and the used flag", () => {
    const state = updateSubscription(base(), "a", input({ name: "Hulu Premium", price: 17.99, nextCharge: "2026-10-31" }));
    expect(state.subs[0]).toMatchObject({ id: "a", name: "Hulu Premium", price: 17.99, used: false });
  });

  it("keeps the billing day when the date wasn't changed", () => {
    const rolled = rollState(base(), "2026-11-01"); // Oct 31 -> Nov 30
    expect(rolled.subs[0]).toMatchObject({ nextCharge: "2026-11-30", billingDay: 31 });
    const edited = updateSubscription(rolled, "a", input({ nextCharge: "2026-11-30", price: 8.99 }));
    expect(edited.subs[0].billingDay).toBe(31);
    const moved = updateSubscription(rolled, "a", input({ nextCharge: "2026-12-05" }));
    expect(moved.subs[0].billingDay).toBe(5);
  });

  it("clears the after-trial price when a trial is switched off", () => {
    const trial = updateSubscription(base(), "a", input({ trial: true, price: 5 }));
    expect(trial.subs[0]).toMatchObject({ trial: true, price: 0, priceAfterTrial: 5 });
    const paid = updateSubscription(trial, "a", input({ trial: false, price: 5 }));
    expect(paid.subs[0]).toMatchObject({ trial: false, price: 5 });
    expect(paid.subs[0]).not.toHaveProperty("priceAfterTrial");
  });

  it("recolours a category-coloured logo when the category changes, but keeps brand colours", () => {
    const recat = updateSubscription(base(), "a", input({ category: "Music", nextCharge: "2026-10-31" }));
    expect(recat.subs[0].color).toBe(CATEGORY_COLORS.Music);

    const branded = addSubscription(ownList(0), input({ color: "#B81D24" }), "b");
    if (!branded.ok) throw new Error("setup failed");
    const kept = updateSubscription(branded.state, "b", input({ category: "Music" }));
    expect(kept.subs[0].color).toBe("#B81D24");
  });

  it("ignores unknown ids", () => {
    const state = base();
    expect(updateSubscription(state, "missing", input()).subs).toEqual(state.subs);
  });
});

describe("other actions", () => {
  it("deletes, toggles used and clears examples", () => {
    const sample = createSampleState(TODAY, makeId);
    const [first] = sample.subs;
    expect(deleteSubscription(sample, first.id).subs).toHaveLength(4);
    expect(toggleUsed(sample, first.id).subs[0].used).toBe(false);
    expect(toggleUsed(toggleUsed(sample, first.id), first.id).subs[0].used).toBe(true);
    expect(clearExamples(sample)).toMatchObject({ subs: [], example: false });
    expect(setProPreview(sample, true).proPreview).toBe(true);
  });

  it("rolls the state forward only when a date passed", () => {
    const sample = createSampleState(TODAY, makeId);
    expect(rollState(sample, TODAY)).toBe(sample);
    const later = rollState(sample, "2026-10-01");
    expect(later).not.toBe(sample);
    const disney = later.subs.find((s) => s.name === "Disney+");
    expect(disney).toMatchObject({ trial: false, price: 9.99, nextCharge: "2026-10-29" });
  });
});

describe("cancelling", () => {
  it("marks it cancelled today, stops sharing it, and frees a Free slot", () => {
    const full = ownList(FREE_LIMIT);
    const target = { ...full.subs[0], shared: true };
    const state = cancelSubscription({ ...full, subs: [target, ...full.subs.slice(1)] }, target.id, TODAY);
    expect(state.subs[0]).toMatchObject({ id: target.id, cancelledOn: TODAY });
    expect(state.subs[0].shared).toBeUndefined();
    expect(isAtFreeLimit(state)).toBe(false);
    expect(addSubscription(state, input({ name: "Another" }), makeId()).ok).toBe(true);
  });

  it("keeps the first cancellation date", () => {
    const state = ownList(1);
    const once = cancelSubscription(state, state.subs[0].id, "2026-09-01");
    expect(cancelSubscription(once, state.subs[0].id, TODAY).subs[0].cancelledOn).toBe("2026-09-01");
  });

  it("keeps the cancellation through an edit", () => {
    const state = ownList(1);
    const cancelled = cancelSubscription(state, state.subs[0].id, TODAY);
    const edited = updateSubscription(cancelled, state.subs[0].id, input({ name: "Renamed" }));
    expect(edited.subs[0]).toMatchObject({ name: "Renamed", cancelledOn: TODAY });
  });

  it("restores with the next charge moved past today", () => {
    const state = ownList(1);
    const id = state.subs[0].id;
    const cancelled = cancelSubscription(
      { ...state, subs: [{ ...state.subs[0], nextCharge: "2026-08-01", billingDay: 1 }] },
      id,
      "2026-07-25",
    );
    const result = restoreSubscription(cancelled, id, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.subs[0].cancelledOn).toBeUndefined();
    expect(result.state.subs[0].nextCharge).toBe("2026-10-01");
  });

  it("won't restore past the Free limit", () => {
    const full = ownList(FREE_LIMIT + 1, true);
    const cancelled = { ...cancelSubscription(full, full.subs[0].id, TODAY), proPreview: false };
    expect(restoreSubscription(cancelled, full.subs[0].id, TODAY)).toEqual({ ok: false, reason: "limit" });
  });
});
