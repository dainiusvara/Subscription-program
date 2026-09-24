import { formatMoney, type Summary as SummaryData } from "@/lib/billing";
import type { CurrencyCode } from "@/lib/types";
import { cx } from "./ui";

/** The big monthly total and the four stat tiles. Pass null to render the loading state. */
export function Summary({ summary, currency }: { summary: SummaryData | null; currency: CurrencyCode }) {
  const money = (amount: number) => (summary ? formatMoney(amount, currency) : "—");
  return (
    <div className="grid items-end gap-[22px] md:grid-cols-[1.3fr_1fr]">
      <div>
        <h1 className="m-0 font-display text-[clamp(40px,8vw,76px)] leading-[0.95] font-extrabold tracking-[-0.035em]">
          <span className="font-mono tabular-nums">{money(summary?.monthly ?? 0)}</span>{" "}
          <span className="text-[0.42em] font-medium tracking-normal text-muted">/ month</span>
        </h1>
        <p className="mt-2 max-w-[44ch] text-balance text-muted">
          Every subscription you pay for, in one place. Drip warns you before each charge and points out the ones
          you&apos;ve stopped using.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line">
        <Stat label="Per year" value={money(summary?.yearly ?? 0)} />
        <Stat label="Subscriptions" value={summary ? String(summary.count) : "—"} />
        <Stat label="Next 30 days" value={money(summary?.next30 ?? 0)} />
        <Stat label="You could save / yr" value={money(summary?.savings ?? 0)} good />
      </dl>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="text-[11px] font-semibold tracking-[0.07em] text-muted uppercase">{label}</dt>
      <dd className={cx("font-mono text-[22px] font-medium tabular-nums", good && "text-good")}>{value}</dd>
    </div>
  );
}
