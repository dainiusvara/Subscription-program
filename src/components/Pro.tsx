"use client";

import { useRef } from "react";
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
}: {
  open: boolean;
  onClose: () => void;
  onEnable: () => void;
}) {
  const enableRef = useRef<HTMLButtonElement>(null);
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
    </Modal>
  );
}
