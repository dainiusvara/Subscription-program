"use client";

import { useEffect, useState } from "react";
import { daysBetween, formatMoney, relativeDay } from "@/lib/billing";
import { SERVICE_GUIDE_COUNT } from "@/lib/cancel-guides";
import { CATEGORY_COLORS, CYCLE_UNITS } from "@/lib/catalog";
import type { CurrencyCode, ISODate, Subscription } from "@/lib/types";
import { LinkButton, Panel, Tag } from "./ui";

/** How long "Tap again to delete" waits for the second tap. */
const CONFIRM_MS = 4000;

export function SubscriptionList({
  subs,
  today,
  currency,
  onEdit,
  onDelete,
  onToggleUsed,
  onCancelHelp,
  onBrowseGuides,
}: {
  subs: Subscription[];
  today: ISODate;
  currency: CurrencyCode;
  onEdit: (sub: Subscription) => void;
  onDelete: (sub: Subscription) => void;
  onToggleUsed: (sub: Subscription) => void;
  onCancelHelp: (sub: Subscription) => void;
  onBrowseGuides: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const timer = setTimeout(() => setConfirmId(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmId]);

  return (
    <Panel
      title="Your subscriptions"
      titleId="subs-title"
      subtitle="Mark anything you haven't used this month. Drip adds it to what you could save."
    >
      <ul>
        {subs.length === 0 ? (
          <li className="py-[18px] text-center text-muted">Nothing here yet. Add your first subscription.</li>
        ) : (
          subs.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              currency={currency}
              confirming={confirmId === sub.id}
              onEdit={() => onEdit(sub)}
              onToggleUsed={() => onToggleUsed(sub)}
              onCancelHelp={() => onCancelHelp(sub)}
              onDelete={() => {
                if (confirmId === sub.id) {
                  setConfirmId(null);
                  onDelete(sub);
                } else {
                  setConfirmId(sub.id);
                }
              }}
            />
          ))
        )}
      </ul>
      <button type="button" onClick={onBrowseGuides} className="mt-3 text-sm text-muted underline hover:text-ink">
        How to cancel: guides for {SERVICE_GUIDE_COUNT} popular services
      </button>
    </Panel>
  );
}

function SubscriptionRow({
  sub,
  today,
  currency,
  confirming,
  onEdit,
  onToggleUsed,
  onDelete,
  onCancelHelp,
}: {
  sub: Subscription;
  today: ISODate;
  currency: CurrencyCode;
  confirming: boolean;
  onEdit: () => void;
  onToggleUsed: () => void;
  onDelete: () => void;
  onCancelHelp: () => void;
}) {
  const initial = (Array.from(sub.name)[0] ?? "?").toUpperCase();
  return (
    // On phones the actions move to their own line under the name; on wider screens they sit under the price.
    <li className="grid grid-cols-[38px_1fr_auto] items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0">
      <div
        aria-hidden="true"
        className="grid h-[38px] w-[38px] place-items-center rounded-[10px] font-display text-base font-extrabold text-white"
        style={{ background: sub.color || CATEGORY_COLORS[sub.category] }}
      >
        {initial}
      </div>
      <div className="min-w-0">
        <div className="font-semibold break-words">{sub.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span>{sub.category}</span>
          <span>· next {relativeDay(daysBetween(today, sub.nextCharge))}</span>
          {sub.trial && <Tag>Trial · then {formatMoney(sub.priceAfterTrial ?? 0, currency)}</Tag>}
          {!sub.used && <Tag>Not used</Tag>}
          {sub.shared && <Tag tone="good">Shared</Tag>}
        </div>
      </div>
      <div className="grid justify-items-end gap-1 text-right max-md:contents">
        <div className="font-mono text-[15px] tabular-nums">
          {sub.trial ? (
            "Free now"
          ) : (
            <>
              {formatMoney(sub.price, currency)}
              {/* On phones the unit drops to a small second line to leave room for the name. */}
              <span className="max-md:block max-md:text-xs max-md:text-muted"> / {CYCLE_UNITS[sub.cycle]}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1 max-md:col-span-2 max-md:col-start-2 max-md:-ml-1.5 max-md:justify-start max-md:gap-0">
          <LinkButton onClick={onToggleUsed} aria-label={`${sub.used ? "Mark unused" : "Mark used"}: ${sub.name}`}>
            {sub.used ? "Mark unused" : "Mark used"}
          </LinkButton>
          <LinkButton onClick={onCancelHelp} aria-label={`How to cancel ${sub.name}`}>
            How to cancel
          </LinkButton>
          <LinkButton onClick={onEdit} aria-label={`Edit ${sub.name}`}>
            Edit
          </LinkButton>
          <LinkButton danger onClick={onDelete} aria-label={confirming ? `Tap again to delete ${sub.name}` : `Delete ${sub.name}`}>
            {confirming ? "Tap again to delete" : "Delete"}
          </LinkButton>
        </div>
      </div>
    </li>
  );
}
