import {
  WINDOW_DAYS,
  addDays,
  dailyTotals,
  formatMoney,
  formatMoneyShort,
  formatShortDate,
  relativeDay,
  type Charge,
} from "@/lib/billing";
import type { CurrencyCode, ISODate } from "@/lib/types";
import { Panel, cx } from "./ui";

const UPCOMING_SHOWN = 5;

export function NextThirtyDays({
  charges,
  today,
  currency,
}: {
  charges: Charge[];
  today: ISODate;
  currency: CurrencyCode;
}) {
  const days = dailyTotals(charges, today);
  const highest = Math.max(1, ...days.map((day) => day.amount));
  const total = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const summary =
    charges.length === 0
      ? "No charges in the next 30 days."
      : `${charges.length} ${charges.length === 1 ? "charge" : "charges"} in the next 30 days, ${formatMoney(total, currency)} in total.`;

  return (
    <Panel
      title="Next 30 days"
      titleId="next30-title"
      subtitle="Each bar is a day. Orange means a free trial turns into a paid plan."
    >
      <div
        role="img"
        aria-label={summary}
        className="relative grid h-[92px] grid-cols-[repeat(30,1fr)] items-end gap-[2px] pt-[18px] md:gap-[3px]"
      >
        {days.map((day) => {
          const hit = day.amount > 0;
          const height = hit ? Math.max(14, Math.round((day.amount / highest) * 70)) : 6;
          return (
            <div
              key={day.date}
              title={formatShortDate(day.date) + (hit ? ` · ${formatMoney(day.amount, currency)}` : "")}
              style={{ height }}
              className={cx(
                "relative min-h-[6px] rounded-[3px] motion-safe:transition-[height] motion-safe:duration-[400ms]",
                day.trialEnds ? "bg-warn" : hit ? "bg-accent" : "bg-surface-2",
              )}
            >
              {hit && (
                <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-muted max-md:hidden">
                  {formatMoneyShort(day.amount, currency)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>Today</span>
        <span>{formatShortDate(addDays(today, WINDOW_DAYS / 2))}</span>
        <span>{formatShortDate(addDays(today, WINDOW_DAYS - 1))}</span>
      </div>

      <ul className="mt-3.5 grid gap-1.5" aria-label="Upcoming charges">
        {charges.length === 0 ? (
          <li className="border-t border-line py-[18px] text-center text-muted">No charges in the next 30 days.</li>
        ) : (
          charges.slice(0, UPCOMING_SHOWN).map((charge) => (
            <li
              key={`${charge.sub.id}-${charge.date}`}
              className="flex justify-between gap-2.5 border-t border-line py-2"
            >
              <span>
                <b>{charge.sub.name}</b>
                {charge.trialEnds && <span className="text-[13px] text-muted"> · trial ends, starts charging</span>}
              </span>
              <span className="flex items-center gap-2.5">
                <span className="font-mono tabular-nums">{formatMoney(charge.amount, currency)}</span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                    charge.day <= 3 ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted",
                  )}
                >
                  {capitalize(relativeDay(charge.day))}
                </span>
              </span>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
