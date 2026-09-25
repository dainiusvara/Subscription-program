"use client";

import { useEffect, useState } from "react";
import { chargeAmount, daysBetween, formatMoney, formatShortDate, isActive, monthlyEquivalent, relativeDay } from "@/lib/billing";
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
  onRestore,
  onBrowseGuides,
  fromBank,
}: {
  subs: Subscription[];
  today: ISODate;
  currency: CurrencyCode;
  onEdit: (sub: Subscription) => void;
  onDelete: (sub: Subscription) => void;
  onToggleUsed: (sub: Subscription) => void;
  onCancelHelp: (sub: Subscription) => void;
  onRestore: (sub: Subscription) => void;
  onBrowseGuides: () => void;
  /** Subscriptions the bank connection added. */
  fromBank?: ReadonlySet<string>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const active = subs.filter(isActive);
  const cancelled = subs.filter((sub) => !isActive(sub));
  const saved = cancelled.reduce((sum, sub) => sum + monthlyEquivalent(chargeAmount(sub), sub.cycle) * 12, 0);

  function handleDelete(sub: Subscription) {
    if (confirmId === sub.id) {
      setConfirmId(null);
      onDelete(sub);
    } else {
      setConfirmId(sub.id);
    }
  }

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
        {active.length === 0 ? (
          <li className="py-[18px] text-center text-muted">
            {cancelled.length === 0 ? "Nothing here yet. Add your first subscription." : "Nothing left to pay for."}
          </li>
        ) : (
          active.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              today={today}
              currency={currency}
              confirming={confirmId === sub.id}
              fromBank={fromBank?.has(sub.id) ?? false}
              onEdit={() => onEdit(sub)}
              onToggleUsed={() => onToggleUsed(sub)}
              onCancelHelp={() => onCancelHelp(sub)}
              onDelete={() => handleDelete(sub)}
            />
          ))
        )}
      </ul>
      {cancelled.length > 0 && (
        <section aria-labelledby="cancelled-title" className="mt-4 rounded-xl bg-good-soft/60 px-3 pt-2.5 pb-1">
          <h3 id="cancelled-title" className="m-0 text-sm font-semibold">
            Cancelled · <span className="text-good">saving {formatMoney(saved, currency)} a year</span>
          </h3>
          <ul>
            {cancelled.map((sub) => (
              <CancelledRow
                key={sub.id}
                sub={sub}
                currency={currency}
                confirming={confirmId === sub.id}
                onRestore={() => onRestore(sub)}
                onDelete={() => handleDelete(sub)}
              />
            ))}
          </ul>
        </section>
      )}
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
  fromBank,
  onEdit,
  onToggleUsed,
  onDelete,
  onCancelHelp,
}: {
  sub: Subscription;
  today: ISODate;
  currency: CurrencyCode;
  confirming: boolean;
  fromBank: boolean;
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
          {fromBank && <Tag tone="good">From your bank</Tag>}
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
          <LinkButton
            onClick={onCancelHelp}
            aria-label={`Cancel ${sub.name}`}
            className="font-semibold text-warn ring-1 ring-warn/40 ring-inset hover:bg-warn-soft hover:text-warn"
          >
            Cancel it
          </LinkButton>
          <LinkButton onClick={onToggleUsed} aria-label={`${sub.used ? "Mark unused" : "Mark used"}: ${sub.name}`}>
            {sub.used ? "Mark unused" : "Mark used"}
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

function CancelledRow({
  sub,
  currency,
  confirming,
  onRestore,
  onDelete,
}: {
  sub: Subscription;
  currency: CurrencyCode;
  confirming: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const initial = (Array.from(sub.name)[0] ?? "?").toUpperCase();
  return (
    <li className="grid grid-cols-[30px_1fr_auto] items-center gap-x-3 border-t border-line/70 py-2 first:border-t-0">
      <div
        aria-hidden="true"
        className="grid h-[30px] w-[30px] place-items-center rounded-lg font-display text-sm font-extrabold text-white opacity-60"
        style={{ background: sub.color || CATEGORY_COLORS[sub.category] }}
      >
        {initial}
      </div>
      <div className="min-w-0">
        <div className="font-medium break-words">{sub.name}</div>
        <div className="text-xs text-muted">
          Cancelled {sub.cancelledOn ? formatShortDate(sub.cancelledOn) : ""} · was{" "}
          <span className="font-mono tabular-nums">{formatMoney(chargeAmount(sub), currency)}</span> / {CYCLE_UNITS[sub.cycle]}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-0.5">
        <LinkButton onClick={onRestore} aria-label={`Didn't cancel ${sub.name} after all: restore it`}>
          Restore
        </LinkButton>
        <LinkButton danger onClick={onDelete} aria-label={confirming ? `Tap again to delete ${sub.name}` : `Delete ${sub.name}`}>
          {confirming ? "Tap again to delete" : "Delete"}
        </LinkButton>
      </div>
    </li>
  );
}
