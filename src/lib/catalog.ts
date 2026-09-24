import type { Category, CurrencyCode, Cycle } from "./types";

/** Subscriptions allowed on the Free plan. */
export const FREE_LIMIT = 5;

export const PRO_PRICE = { monthly: 2.99, yearly: 24 } as const;

export const CATEGORIES: readonly Category[] = [
  "Streaming",
  "Music",
  "Gaming",
  "Software",
  "Fitness",
  "Cloud storage",
  "News",
  "Other",
];

export const CATEGORY_COLORS: Record<Category, string> = {
  Streaming: "#7A3B8F",
  Music: "#1A9E4B",
  Gaming: "#2E6B2E",
  Software: "#2B6F5E",
  Fitness: "#8A4B12",
  "Cloud storage": "#3A7BD5",
  News: "#5A5A5A",
  Other: "#4B5E58",
};

/** Order the "Billed" select shows them in. */
export const CYCLES: readonly Cycle[] = ["month", "year", "week", "quarter"];

export const CYCLE_LABELS: Record<Cycle, string> = {
  month: "Monthly",
  year: "Yearly",
  week: "Weekly",
  quarter: "Every 3 months",
};

/** Used after a price: "€9.99 / month". */
export const CYCLE_UNITS: Record<Cycle, string> = {
  week: "week",
  month: "month",
  quarter: "3 months",
  year: "year",
};

export const CURRENCIES: readonly { code: CurrencyCode; symbol: string }[] = [
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
  { code: "GBP", symbol: "£" },
];

export interface Preset {
  name: string;
  price: number;
  category: Category;
  color: string;
}

/** Quick-pick chips. Prices are typical monthly prices; users should check theirs. */
export const PRESETS: readonly Preset[] = [
  { name: "Netflix", price: 13.99, category: "Streaming", color: "#B81D24" },
  { name: "Spotify", price: 11.99, category: "Music", color: "#1A9E4B" },
  { name: "YouTube Premium", price: 13.99, category: "Streaming", color: "#CC1F1F" },
  { name: "Disney+", price: 9.99, category: "Streaming", color: "#1D3C8F" },
  { name: "Xbox Game Pass", price: 14.99, category: "Gaming", color: "#1F7A1F" },
  { name: "PlayStation Plus", price: 8.99, category: "Gaming", color: "#1B4DB1" },
  { name: "ChatGPT Plus", price: 23, category: "Software", color: "#2B6F5E" },
  { name: "iCloud+", price: 2.99, category: "Cloud storage", color: "#3A7BD5" },
  { name: "Amazon Prime", price: 8.99, category: "Streaming", color: "#1F6FA3" },
  { name: "Gym", price: 30, category: "Fitness", color: "#8A4B12" },
];
