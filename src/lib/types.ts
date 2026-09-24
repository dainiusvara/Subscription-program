/** A calendar date in the user's local time zone, formatted `YYYY-MM-DD`. */
export type ISODate = string;

export type Cycle = "week" | "month" | "quarter" | "year";

export type Category =
  | "Streaming"
  | "Music"
  | "Gaming"
  | "Software"
  | "Fitness"
  | "Cloud storage"
  | "News"
  | "Other";

export type CurrencyCode = "EUR" | "USD" | "GBP";

export interface Subscription {
  id: string;
  name: string;
  /** Price per billing cycle. 0 while on a free trial. */
  price: number;
  /** What the plan costs once a free trial ends. Only set while `trial` is true. */
  priceAfterTrial?: number;
  cycle: Cycle;
  /** Next charge date. For a free trial, the day it turns into a paid plan. */
  nextCharge: ISODate;
  /**
   * Day of the month the plan bills on (1–31). A plan billed on the 31st
   * charges on Feb 28 and then goes back to Mar 31, instead of drifting.
   */
  billingDay: number;
  category: Category;
  /** Logo background colour (hex). */
  color: string;
  /** False when the user marked it as not used this month. */
  used: boolean;
  trial: boolean;
}

export interface DripState {
  version: 1;
  subs: Subscription[];
  currency: CurrencyCode;
  /** Free preview of Pro while payments aren't live. */
  proPreview: boolean;
  /** True while the list still holds the sample subscriptions. */
  example: boolean;
}

/** What the add/edit form submits. `price` is what the user pays per cycle (after the trial, for trials). */
export interface SubscriptionInput {
  name: string;
  price: number;
  cycle: Cycle;
  nextCharge: ISODate;
  category: Category;
  trial: boolean;
  /** Preset brand colour, if the user picked a preset. */
  color?: string;
}
