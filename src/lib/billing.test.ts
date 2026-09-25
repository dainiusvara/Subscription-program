import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dailyTotals,
  daysBetween,
  daysInMonth,
  formatMoney,
  formatMoneyShort,
  isISODate,
  isSupportedDate,
  monthlyEquivalent,
  monthlyTotal,
  nextCycleDate,
  parsePrice,
  relativeDay,
  rollAllForward,
  rollForward,
  roundMoney,
  sortByNextCharge,
  summarize,
  todayISO,
  upcomingCharges,
  yearlySavings,
} from "./billing";
import { createSampleState } from "./state";
import type { Subscription } from "./types";

const TODAY = "2026-09-24";

function sub(overrides: Partial<Subscription> = {}): Subscription {
  const nextCharge = overrides.nextCharge ?? TODAY;
  return {
    id: overrides.name ?? "sub",
    name: "Sub",
    price: 10,
    cycle: "month",
    nextCharge,
    billingDay: Number(nextCharge.slice(8)),
    category: "Other",
    color: "#4B5E58",
    used: true,
    trial: false,
    ...overrides,
  };
}

let counter = 0;
const makeId = () => `id-${++counter}`;

describe("calendar dates", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("validates ISO dates", () => {
    expect(isISODate("2026-09-24")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("2026-9-24")).toBe(false);
    expect(isISODate("")).toBe(false);
    expect(isISODate(20260924)).toBe(false);
  });

  it("only accepts charge dates from 2000 to 2100", () => {
    expect(isSupportedDate("2026-09-24")).toBe(true);
    expect(isSupportedDate("2000-01-01")).toBe(true);
    expect(isSupportedDate("2100-12-31")).toBe(true);
    expect(isSupportedDate("1999-12-31")).toBe(false);
    expect(isSupportedDate("2206-09-24")).toBe(false);
    expect(isSupportedDate("2026-02-30")).toBe(false);
  });

  it("reads today from the device's local calendar", () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayISO(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-24", 7)).toBe("2026-10-01");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days, unaffected by daylight saving changes", () => {
    // EU clocks change on 2026-03-29 and 2026-10-25.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysBetween("2026-09-24", "2026-09-20")).toBe(-4);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("clamps month-end dates instead of spilling into the next month", () => {
    // The prototype's Date.setMonth sent Jan 31 to Mar 3.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("returns to the billing day after a short month", () => {
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonths("2026-04-30", 1, 31)).toBe("2026-05-31");
    expect(addMonths("2026-02-28", 1, 30)).toBe("2026-03-30");
  });

  it("moves one billing cycle", () => {
    expect(nextCycleDate("2026-09-24", "week")).toBe("2026-10-01");
    expect(nextCycleDate("2026-09-24", "month")).toBe("2026-10-24");
    expect(nextCycleDate("2026-09-24", "quarter")).toBe("2026-12-24");
    expect(nextCycleDate("2026-09-24", "year")).toBe("2027-09-24");
    // Yearly plans started on Feb 29 bill on Feb 28 in normal years.
    expect(nextCycleDate("2028-02-29", "year", 29)).toBe("2029-02-28");
    expect(nextCycleDate("2031-02-28", "year", 29)).toBe("2032-02-29");
  });

  it("labels days relative to today", () => {
    expect(relativeDay(0)).toBe("today");
    expect(relativeDay(1)).toBe("tomorrow");
    expect(relativeDay(12)).toBe("in 12 days");
  });

  it("rejects malformed dates loudly", () => {
    expect(() => addDays("24/09/2026", 1)).toThrow(RangeError);
  });
});

describe("rollForward", () => {
  it("leaves dates today or later alone", () => {
    const today = sub({ nextCharge: TODAY });
    const later = sub({ nextCharge: "2026-10-01" });
    expect(rollForward(today, TODAY)).toBe(today);
    expect(rollForward(later, TODAY)).toBe(later);
  });

  it("moves a past monthly date to the next charge on or after today", () => {
    expect(rollForward(sub({ nextCharge: "2026-09-10" }), TODAY).nextCharge).toBe("2026-10-10");
    expect(rollForward(sub({ nextCharge: "2026-09-24" }), "2026-09-24").nextCharge).toBe("2026-09-24");
    expect(rollForward(sub({ nextCharge: "2026-06-24" }), TODAY).nextCharge).toBe("2026-09-24");
  });

  it("rolls every cycle length", () => {
    expect(rollForward(sub({ cycle: "week", nextCharge: "2026-09-01" }), TODAY).nextCharge).toBe("2026-09-29");
    expect(rollForward(sub({ cycle: "quarter", nextCharge: "2026-08-01" }), TODAY).nextCharge).toBe("2026-11-01");
    expect(rollForward(sub({ cycle: "year", nextCharge: "2024-10-18" }), TODAY).nextCharge).toBe("2026-10-18");
  });

  it("rolls many years of weekly charges", () => {
    const rolled = rollForward(sub({ cycle: "week", nextCharge: "2020-01-02" }), TODAY);
    expect(rolled.nextCharge >= TODAY).toBe(true);
    expect(daysBetween(TODAY, rolled.nextCharge)).toBeLessThan(7);
    expect(daysBetween("2020-01-02", rolled.nextCharge) % 7).toBe(0);
  });

  it("keeps a month-end billing day through February", () => {
    const rolled = rollForward(sub({ nextCharge: "2026-01-31", billingDay: 31 }), "2026-03-01");
    expect(rolled.nextCharge).toBe("2026-03-31");
  });

  it("turns an ended free trial into a paid plan", () => {
    const trial = sub({ trial: true, price: 0, priceAfterTrial: 7.5, nextCharge: "2026-09-10" });
    const rolled = rollForward(trial, TODAY);
    expect(rolled).toMatchObject({ trial: false, price: 7.5, nextCharge: "2026-10-10" });
    expect(rolled).not.toHaveProperty("priceAfterTrial");
  });

  it("keeps a trial that hasn't ended", () => {
    const trial = sub({ trial: true, price: 0, priceAfterTrial: 7.5, nextCharge: "2026-09-29" });
    expect(rollForward(trial, TODAY)).toBe(trial);
  });

  it("returns the same array when nothing moved", () => {
    const subs = [sub({ nextCharge: "2026-10-01" })];
    expect(rollAllForward(subs, TODAY)).toBe(subs);
    const stale = [sub({ nextCharge: "2026-09-01" })];
    expect(rollAllForward(stale, TODAY)).not.toBe(stale);
  });
});

describe("money math", () => {
  it("converts every cycle to a monthly price (weekly × 52 / 12, quarterly / 3, yearly / 12)", () => {
    expect(monthlyEquivalent(12, "month")).toBe(12);
    expect(monthlyEquivalent(3, "week")).toBe(13);
    expect(monthlyEquivalent(30, "quarter")).toBe(10);
    expect(monthlyEquivalent(24, "year")).toBe(2);
  });

  it("leaves free trials out of the monthly total", () => {
    const subs = [sub({ price: 10 }), sub({ trial: true, price: 0, priceAfterTrial: 99 })];
    expect(monthlyTotal(subs)).toBe(10);
  });

  it("counts unused subscriptions as savings, trials at their after-trial price", () => {
    const subs = [
      sub({ price: 10, used: false }),
      sub({ price: 120, cycle: "year", used: false }),
      sub({ trial: true, price: 0, priceAfterTrial: 5, used: false }),
      sub({ price: 50, used: true }),
    ];
    expect(yearlySavings(subs)).toBeCloseTo((10 + 10 + 5) * 12);
  });
});

describe("upcomingCharges", () => {
  it("covers today through day 29, repeats included", () => {
    const weekly = sub({ cycle: "week", price: 5, nextCharge: TODAY });
    const charges = upcomingCharges([weekly], TODAY);
    expect(charges.map((c) => c.day)).toEqual([0, 7, 14, 21, 28]);
    expect(upcomingCharges([sub({ nextCharge: addDays(TODAY, 30) })], TODAY)).toEqual([]);
    expect(upcomingCharges([sub({ nextCharge: addDays(TODAY, 29) })], TODAY)).toHaveLength(1);
  });

  it("flags the day a trial ends and charges the after-trial price", () => {
    const trial = sub({ cycle: "week", trial: true, price: 0, priceAfterTrial: 4, nextCharge: "2026-09-26" });
    const charges = upcomingCharges([trial], TODAY);
    expect(charges[0]).toMatchObject({ day: 2, amount: 4, trialEnds: true });
    expect(charges.slice(1).every((c) => c.amount === 4 && !c.trialEnds)).toBe(true);
  });

  it("sorts by day, then name", () => {
    const charges = upcomingCharges(
      [sub({ name: "B", nextCharge: "2026-09-30" }), sub({ name: "A", nextCharge: "2026-09-30" }), sub({ name: "C", nextCharge: "2026-09-25" })],
      TODAY,
    );
    expect(charges.map((c) => c.sub.name)).toEqual(["C", "A", "B"]);
  });

  it("adds up charges per day for the chart", () => {
    const subs = [
      sub({ price: 5, nextCharge: "2026-09-26" }),
      sub({ price: 7, nextCharge: "2026-09-26" }),
      sub({ trial: true, price: 0, priceAfterTrial: 3, nextCharge: "2026-09-30" }),
    ];
    const days = dailyTotals(upcomingCharges(subs, TODAY), TODAY);
    expect(days).toHaveLength(30);
    expect(days[0].date).toBe(TODAY);
    expect(days[29].date).toBe("2026-10-23");
    expect(days[2]).toEqual({ date: "2026-09-26", amount: 12, trialEnds: false });
    expect(days[6]).toEqual({ date: "2026-09-30", amount: 3, trialEnds: true });
    expect(days.filter((d) => d.amount > 0)).toHaveLength(2);
  });
});

describe("summarize matches the prototype", () => {
  // Expected values come from running prototype/index.html's code with today = 2026-09-24.
  it("on the example list", () => {
    const { subs } = createSampleState(TODAY, makeId);
    const summary = summarize(subs, TODAY);
    expect(formatMoney(summary.monthly, "EUR")).toBe("€43.47");
    expect(formatMoney(summary.yearly, "EUR")).toBe("€521.63");
    expect(formatMoney(summary.next30, "EUR")).toBe("€80.95");
    expect(formatMoney(summary.savings, "EUR")).toBe("€299.76");
    expect(summary.count).toBe(5);
    expect(summary.charges.map((c) => [c.sub.name, c.day, c.amount, c.trialEnds])).toEqual([
      ["Netflix", 3, 13.99, false],
      ["Disney+", 5, 9.99, true],
      ["Spotify", 9, 11.99, false],
      ["Xbox Game Pass", 16, 14.99, false],
      ["iCloud+", 24, 29.99, false],
    ]);
  });

  it("with weekly, quarterly and an ended trial", () => {
    const subs = rollAllForward(
      [
        sub({ name: "Weekly", price: 5, cycle: "week", nextCharge: "2026-09-24" }),
        sub({ name: "Quarterly", price: 30, cycle: "quarter", nextCharge: "2026-08-01", used: false }),
        sub({ name: "OldTrial", price: 0, priceAfterTrial: 7.5, trial: true, nextCharge: "2026-09-10" }),
      ],
      TODAY,
    );
    const summary = summarize(subs, TODAY);
    expect(formatMoney(summary.monthly, "EUR")).toBe("€39.17");
    expect(formatMoney(summary.yearly, "EUR")).toBe("€470.00");
    expect(formatMoney(summary.next30, "EUR")).toBe("€32.50");
    expect(formatMoney(summary.savings, "EUR")).toBe("€120.00");
    expect(summary.charges.map((c) => c.day)).toEqual([0, 7, 14, 16, 21, 28]);
  });

  it("on an empty list", () => {
    expect(summarize([], TODAY)).toEqual({
      monthly: 0,
      yearly: 0,
      count: 0,
      next30: 0,
      savings: 0,
      saved: 0,
      cancelledCount: 0,
      charges: [],
    });
  });
});

describe("cancelled subscriptions", () => {
  const subs = [
    sub({ name: "Kept", price: 10, nextCharge: "2026-09-30" }),
    sub({ name: "Gone", price: 13.99, nextCharge: "2026-09-27", cancelledOn: "2026-09-24", used: false }),
    sub({ name: "GoneYearly", price: 60, cycle: "year", nextCharge: "2026-10-01", cancelledOn: "2026-09-20" }),
    sub({ name: "GoneTrial", price: 0, priceAfterTrial: 9.99, trial: true, nextCharge: "2026-09-26", cancelledOn: "2026-09-24" }),
  ];

  it("leaves them out of totals, charges and 'could save'", () => {
    const summary = summarize(subs, TODAY);
    expect(summary.monthly).toBe(10);
    expect(summary.count).toBe(1);
    expect(summary.savings).toBe(0);
    expect(summary.charges.map((c) => c.sub.name)).toEqual(["Kept"]);
  });

  it("counts what they would have cost per year as saved, trials at their after-trial price", () => {
    const summary = summarize(subs, TODAY);
    expect(formatMoney(summary.saved, "EUR")).toBe("€347.76"); // 13.99×12 + 60 + 9.99×12
    expect(summary.cancelledCount).toBe(3);
  });

  it("keeps their last charge date instead of rolling it forward", () => {
    const old = sub({ name: "Old", nextCharge: "2026-08-01", cancelledOn: "2026-07-25" });
    expect(rollForward(old, TODAY)).toBe(old);
  });
});

describe("sortByNextCharge", () => {
  it("puts the soonest first without mutating the input", () => {
    const subs = [sub({ name: "Late", nextCharge: "2026-10-20" }), sub({ name: "Soon", nextCharge: "2026-09-25" })];
    expect(sortByNextCharge(subs).map((s) => s.name)).toEqual(["Soon", "Late"]);
    expect(subs[0].name).toBe("Late");
  });
});

describe("formatting and parsing money", () => {
  it("rounds half-cents up, where float math would round down", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(29.99 / 12)).toBe(2.5);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(Number.NaN)).toBe(0);
  });

  it("formats with the currency symbol and two decimals", () => {
    expect(formatMoney(13.99, "EUR")).toBe("€13.99");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(1234.5, "GBP")).toBe("£1234.50");
    expect(formatMoney(13.99 + 11.99 + 14.99, "EUR")).toBe("€40.97");
  });

  it("drops .00 in short labels", () => {
    expect(formatMoneyShort(14, "EUR")).toBe("€14");
    expect(formatMoneyShort(13.99, "EUR")).toBe("€13.99");
    expect(formatMoneyShort(10.5, "EUR")).toBe("€10.50");
    expect(formatMoneyShort(100, "EUR")).toBe("€100");
  });

  it("reads prices typed with a dot, a comma or a symbol", () => {
    expect(parsePrice("9.99")).toBe(9.99);
    expect(parsePrice("9,99")).toBe(9.99);
    expect(parsePrice(" 12 ")).toBe(12);
    expect(parsePrice("€9.99")).toBe(9.99);
    expect(parsePrice("9.99 €")).toBe(9.99);
    expect(parsePrice(".99")).toBe(0.99);
    expect(parsePrice("0")).toBe(0);
    expect(parsePrice("9.")).toBe(9);
  });

  it("rejects prices that aren't a plain amount", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-1")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("9.999")).toBeNull();
    expect(parsePrice("1,234.56")).toBeNull();
    expect(parsePrice("1e3")).toBeNull();
    expect(parsePrice("10000000")).toBeNull();
  });
});
