"use client";

import { useRef, useState } from "react";
import { FREE_LIMIT, PRO_PRICE } from "@/lib/catalog";
import { Modal } from "./Modal";
import { Button, buttonClass, cx } from "./ui";

export function ProCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-labelledby="pro-title" className="grid gap-3 rounded-2xl bg-ink p-5 text-bg">
      <h2 id="pro-title" className="m-0 font-display text-2xl font-extrabold tracking-[-0.02em]">
        Drip Pro
      </h2>
      <div className="font-mono">
        €{PRO_PRICE.monthly} / month · or €{PRO_PRICE.yearly} / year
      </div>
      <ul className="m-0 grid list-disc gap-1 pl-[18px]">
        <li>Unlimited subscriptions (Free has {FREE_LIMIT})</li>
        <li>Email and phone reminders 3 days before each charge</li>
        <li>Connect your bank to find subscriptions automatically</li>
        <li>Step-by-step cancel guides for 200+ services</li>
        <li>Share with family and split costs</li>
      </ul>
      <button type="button" onClick={onOpen} className={cx(buttonClass(), "justify-self-start")}>
        See Pro
      </button>
    </section>
  );
}

export function ProDialog({
  open,
  onClose,
  onEnable,
  paymentsEnabled,
  signedIn,
  onSignIn,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  onEnable: () => void;
  /** Real payments are live: show the upgrade buttons instead of the free preview. */
  paymentsEnabled: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onUpgrade: (plan: "monthly" | "yearly") => Promise<void>;
}) {
  const enableRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<"monthly" | "yearly" | null>(null);
  const saving = Math.round((1 - PRO_PRICE.yearly / (PRO_PRICE.monthly * 12)) * 100);

  async function upgrade(plan: "monthly" | "yearly") {
    setBusy(plan);
    await onUpgrade(plan);
    setBusy(null);
  }
  return (
    <Modal open={open} onClose={onClose} labelledBy="pro-dialog-title" initialFocus={enableRef}>
      <h3 id="pro-dialog-title" className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
        Go unlimited with Pro
      </h3>
      <p className="m-0 text-muted">
        Free covers {FREE_LIMIT} subscriptions. Pro pays for itself the first time it catches a charge you forgot
        about.
      </p>
      <ul className="m-0 grid list-disc gap-1 pl-[18px]">
        <li>Unlimited subscriptions</li>
        <li>Reminders before every charge</li>
        <li>Automatic bank detection</li>
      </ul>
      {!paymentsEnabled ? (
        <>
          <p className="m-0 text-xs text-muted">
            This is an early version and payments aren&apos;t live yet. Turn on Pro preview to try everything.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={enableRef} onClick={onEnable}>
              Turn on Pro preview
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
          </div>
        </>
      ) : !signedIn ? (
        <>
          <p className="m-0 text-xs text-muted">Pro belongs to your account, so sign in first. It takes a minute.</p>
          <div className="flex flex-wrap gap-2">
            <Button ref={enableRef} onClick={onSignIn}>
              Sign in to upgrade
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button ref={enableRef} disabled={busy !== null} onClick={() => upgrade("yearly")} className="grid gap-0.5 text-left">
              <span>€{PRO_PRICE.yearly} / year</span>
              <span className="text-xs font-medium opacity-80">Save {saving}%</span>
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => upgrade("monthly")} className="grid gap-0.5 text-left">
              <span>€{PRO_PRICE.monthly} / month</span>
              <span className="text-xs font-medium text-muted">Cancel any time</span>
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">
            {busy ? "Opening Stripe's secure payment page…" : "You pay on Stripe's secure page. Drip never sees your card."}
          </p>
          <button type="button" onClick={onClose} className="justify-self-start text-sm text-muted underline">
            Not now
          </button>
        </>
      )}
    </Modal>
  );
}
