/**
 * Finding subscriptions in a list of bank transactions: payments to the same
 * merchant, for about the same amount, at a regular interval.
 */
import { daysBetween, nextCycleDate, dayOfMonth, rollForward, roundMoney } from "../billing";
import { CANCEL_GUIDES, normalizeName, type CancelGuide } from "../cancel-guides";
import { CATEGORY_COLORS, PRESETS } from "../catalog";
import type { Category, Cycle, ISODate, Subscription } from "../types";
import type { Transaction } from "./statement";

export interface Candidate {
  key: string;
  name: string;
  /** The latest amount charged. */
  price: number;
  cycle: Cycle;
  nextCharge: ISODate;
  lastCharge: ISODate;
  occurrences: number;
  category: Category;
  color: string;
  /** The last charge is older than expected: probably already cancelled. */
  stopped: boolean;
  /** A subscription with this name is already in Drip. */
  alreadyTracked: boolean;
}

/** Words in bank descriptions that say nothing about who was paid. */
const NOISE = new Set([
  "card", "payment", "purchase", "pos", "visa", "mastercard", "maestro", "debit", "credit", "sepa", "direct", "dd",
  "lastschrift", "kartenzahlung", "zahlung", "folgelastschrift", "basislastschrift", "mokejimas", "kortele", "pirkimas",
  "transaction", "recurring", "subscription", "www", "com", "net", "org", "io", "co", "uk", "de", "lt", "inc", "ltd",
  "gmbh", "ab", "uab", "sa", "bv", "llc", "sarl", "srl", "eur", "usd", "gbp", "online", "bill", "billing", "ref",
  "reference", "nr", "no", "the", "to", "from", "at", "on", "via", "paypal", "pp", "contactless", "sumup", "zettle",
  "stripe", "pay", "pmt", "trx", "txn", "id", "mandate", "mandat", "end",
]);

/** Days per cycle, with the range of gaps that counts as that cycle. */
const CYCLES: { cycle: Cycle; min: number; max: number }[] = [
  { cycle: "week", min: 5, max: 9 },
  { cycle: "month", min: 25, max: 35 },
  { cycle: "quarter", min: 80, max: 100 },
  { cycle: "year", min: 350, max: 380 },
];

const CYCLE_DAYS: Record<Cycle, number> = { week: 7, month: 30.4, quarter: 91, year: 365 };

/** A known service mentioned in the text, including run-together forms like "YOUTUBEPREMIUM". */
export function findService(description: string): CancelGuide | null {
  const text = normalizeName(description);
  const padded = ` ${text} `;
  const collapsed = text.replace(/ /g, "");
  let best: { guide: CancelGuide; length: number } | null = null;
  for (const guide of CANCEL_GUIDES) {
    if (guide.url === null) continue;
    for (const alias of guide.aliases) {
      const needle = normalizeName(alias);
      const found =
        padded.includes(` ${needle} `) || (needle.length >= 6 && collapsed.includes(needle.replace(/ /g, "")));
      if (found && (!best || needle.length > best.length)) best = { guide, length: needle.length };
    }
  }
  return best?.guide ?? null;
}

/** "NETFLIX.COM 866-579 AMSTERDAM" → "netflix amsterdam". Digits and filler words go. */
export function merchantKey(description: string): string {
  const words = normalizeName(description)
    .split(" ")
    .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.has(w));
  return words.slice(0, 2).join(" ");
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Groups amounts within `tolerance` of each other (e.g. 1.15: a price rise stays one subscription). */
function clusterByAmount(items: Transaction[], tolerance: number): Transaction[][] {
  const sorted = [...items].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const clusters: Transaction[][] = [];
  for (const item of sorted) {
    const last = clusters.at(-1);
    const ref = last?.[last.length - 1];
    if (last && ref && Math.abs(item.amount) <= Math.abs(ref.amount) * tolerance + 0.01) last.push(item);
    else clusters.push([item]);
  }
  return clusters;
}

/**
 * How sure we need to be. Known services (Netflix…) may change price and need
 * two charges. For any other merchant it takes three charges of nearly the
 * same amount, so a regular shop visit doesn't look like a subscription.
 */
const RULES = {
  service: { tolerance: 1.15, minCharges: 2 },
  merchant: { tolerance: 1.02, minCharges: 3 },
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classify(dates: ISODate[]): Cycle | null {
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d)).filter((g) => g > 0);
  if (gaps.length === 0) return null;
  const typical = median(gaps);
  const match = CYCLES.find((c) => typical >= c.min && typical <= c.max);
  if (!match) return null;
  // Most gaps should fit the cycle (a skipped month counts as two).
  const fits = gaps.filter((g) => {
    const cycles = Math.round(g / CYCLE_DAYS[match.cycle]);
    return cycles >= 1 && Math.abs(g - cycles * CYCLE_DAYS[match.cycle]) <= (match.max - match.min) / 2 + 2;
  });
  if (fits.length / gaps.length < 0.75) return null;
  // Weekly needs a few charges before it's more than a coincidence.
  if (match.cycle === "week" && dates.length < 3) return null;
  return match.cycle;
}

/**
 * Finds recurring payments. `today` sets the next charge dates; the latest
 * date in the statement decides whether a subscription looks stopped.
 */
export function detectSubscriptions(
  transactions: readonly Transaction[],
  today: ISODate,
  existing: readonly Pick<Subscription, "name">[] = [],
): Candidate[] {
  const outgoing = transactions.filter((t) => t.amount < 0);
  if (outgoing.length === 0) return [];
  const statementEnd = transactions.reduce((max, t) => (t.date > max ? t.date : max), transactions[0].date);

  const groups = new Map<string, { name: string; service: CancelGuide | null; items: Transaction[] }>();
  for (const t of outgoing) {
    const service = findService(t.description);
    const key = service ? `service:${service.id}` : `merchant:${merchantKey(t.description)}`;
    if (key === "merchant:") continue;
    const group = groups.get(key) ?? {
      name: service ? service.name.replace(/ \(.*\)$/, "") : titleCase(merchantKey(t.description)),
      service,
      items: [],
    };
    group.items.push(t);
    groups.set(key, group);
  }

  const existingNames = existing.map((s) => normalizeName(s.name));
  const candidates: Candidate[] = [];

  for (const [key, group] of groups) {
    const rule = group.service ? RULES.service : RULES.merchant;
    const clusters = clusterByAmount(group.items, rule.tolerance).filter((c) => c.length >= rule.minCharges);
    for (const [index, cluster] of clusters.entries()) {
      // One charge per day at most (refunds and retries aside).
      const byDate = new Map<ISODate, Transaction>();
      for (const t of cluster) byDate.set(t.date, t);
      const charges = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      if (charges.length < rule.minCharges) continue;
      const dates = charges.map((t) => t.date);
      const cycle = classify(dates);
      if (!cycle) continue;

      const last = charges.at(-1)!;
      const preset = PRESETS.find((p) => group.service && normalizeName(p.name) === normalizeName(group.service.name));
      const category: Category = group.service?.category ?? "Other";
      const next = rollForward(
        {
          id: key,
          name: group.name,
          price: 0,
          cycle,
          nextCharge: nextCycleDate(last.date, cycle, dayOfMonth(last.date)),
          billingDay: dayOfMonth(last.date),
          category,
          color: "#000000",
          used: true,
          trial: false,
        },
        today,
      ).nextCharge;
      const name = clusters.length > 1 ? `${group.name} (${roundMoney(Math.abs(last.amount)).toFixed(2)})` : group.name;
      const normalized = normalizeName(group.name);
      candidates.push({
        key: `${key}#${index}`,
        name,
        price: roundMoney(Math.abs(last.amount)),
        cycle,
        nextCharge: next,
        lastCharge: last.date,
        occurrences: charges.length,
        category,
        color: preset?.color ?? CATEGORY_COLORS[category],
        stopped: daysBetween(last.date, statementEnd) > CYCLE_DAYS[cycle] * 1.5,
        alreadyTracked: existingNames.some((n) => n === normalized || n.includes(normalized) || normalized.includes(n)),
      });
    }
  }
  return candidates.sort((a, b) => Number(a.stopped) - Number(b.stopped) || b.price - a.price || a.name.localeCompare(b.name));
}
