"use client";

import { useId, useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/billing";
import { CYCLE_UNITS } from "@/lib/catalog";
import { MAX_FAMILY_SIZE, type Family } from "@/lib/family";
import { familySplit, perPerson } from "@/lib/split";
import { dripActions, familyActions, type Account } from "@/lib/store";
import type { CurrencyCode } from "@/lib/types";
import { Button, LinkButton, Panel, Tag, cx } from "./ui";

const FIELD = "w-full min-w-0 rounded-[9px] border border-line bg-bg px-2.5 py-[9px] max-md:text-base";
const SUBTITLE = "Share subscriptions with the people you live with and split the cost.";

export function FamilyPanel({
  account,
  hasPro,
  currency,
  joinCode,
  onJoinHandled,
  onSignIn,
  onOpenPro,
}: {
  account: Account;
  hasPro: boolean;
  currency: CurrencyCode;
  /** From an invite link (?join=CODE). */
  joinCode: string | null;
  onJoinHandled: () => void;
  onSignIn: () => void;
  onOpenPro: () => void;
}) {
  if (account.kind === "local") {
    if (!joinCode) return null;
    return (
      <Panel title="Family" titleId="family-title" subtitle={SUBTITLE}>
        <p className="mb-3 text-sm">You were invited to a family on Drip. Sign in to join it.</p>
        <Button size="sm" onClick={onSignIn}>
          Sign in to join
        </Button>
      </Panel>
    );
  }
  return (
    <Panel title="Family" titleId="family-title" subtitle={SUBTITLE}>
      {account.family ? (
        <FamilyView family={account.family} me={account.userId} currency={currency} />
      ) : (
        <NoFamily hasPro={hasPro} joinCode={joinCode} onJoinHandled={onJoinHandled} onOpenPro={onOpenPro} />
      )}
    </Panel>
  );
}

function NoFamily({
  hasPro,
  joinCode,
  onJoinHandled,
  onOpenPro,
}: {
  hasPro: boolean;
  joinCode: string | null;
  onJoinHandled: () => void;
  onOpenPro: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [code, setCode] = useState(joinCode ?? "");
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent, action: () => Promise<boolean>) {
    event.preventDefault();
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onJoinHandled();
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={(e) => run(e, () => familyActions.join(code))} className="grid gap-1.5">
        <label htmlFor={`${id}-code`} className="text-xs font-semibold tracking-[0.03em] text-muted">
          {joinCode ? "You were invited. Join with this code:" : "Join a family with its invite code"}
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-code`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 3FA9C21B7D"
            autoComplete="off"
            maxLength={12}
            className={cx(FIELD, "font-mono tracking-wider")}
          />
          <Button type="submit" size="sm" disabled={busy || code.trim().length < 6}>
            Join
          </Button>
        </div>
      </form>

      <div className="grid gap-1.5 border-t border-line pt-3">
        <span className="text-xs font-semibold tracking-[0.03em] text-muted">Or start one and invite others</span>
        {hasPro ? (
          <form onSubmit={(e) => run(e, () => familyActions.create(name))} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Family name, e.g. The Smiths"
              maxLength={40}
              aria-label="Family name"
              className={FIELD}
            />
            <Button type="submit" size="sm" disabled={busy}>
              Create
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Creating a family is part of Drip Pro. Joining one is free.</span>
            <Button variant="ghost" size="sm" onClick={onOpenPro}>
              See Pro
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FamilyView({ family, me, currency }: { family: Family; me: string; currency: CurrencyCode }) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const isOwner = family.ownerId === me;
  const money = (n: number) => formatMoney(n, currency);
  const split = familySplit(
    family.shared,
    family.members.map((m) => m.userId),
  );
  const emailOf = (userId: string) =>
    userId === me ? "You" : (family.members.find((m) => m.userId === userId)?.email ?? "Someone who left");

  async function copyLink() {
    const link = `${window.location.origin}/?join=${family.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      dripActions.notify("Invite link copied");
    } catch {
      dripActions.notify(`Invite code: ${family.inviteCode}`);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <div className="font-display text-lg font-bold">{family.name}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Invite code</span>
          <code className="rounded-md bg-surface-2 px-2 py-0.5 font-mono tracking-wider">{family.inviteCode}</code>
          <LinkButton onClick={() => void copyLink()}>Copy invite link</LinkButton>
          {isOwner && <LinkButton onClick={() => void familyActions.renewCode()}>New code</LinkButton>}
        </div>
        <p className="m-0 text-xs text-muted">
          {family.members.length} of {MAX_FAMILY_SIZE} people. Anyone with the code can join, so only share it with family.
        </p>
      </div>

      <div className="grid gap-1">
        <div className="text-sm">
          Shared: <b className="font-mono tabular-nums">{money(split.totalMonthly)}</b> / month
          {family.members.length > 1 && (
            <>
              {" "}
              · each person <b className="font-mono tabular-nums">{money(split.members[0]?.share ?? 0)}</b>
            </>
          )}
        </div>
        <ul className="m-0 grid gap-0" aria-label="Who pays what">
          {split.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-t border-line py-2 text-sm first:border-t-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="break-all">{emailOf(m.userId)}</span>
                {m.userId === family.ownerId && <Tag tone="good">Owner</Tag>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted">pays {money(m.pays)}</span>
                <span className={cx("font-mono text-xs tabular-nums", m.balance >= 0 ? "text-good" : "text-warn")}>
                  {Math.abs(m.balance) < 0.005
                    ? "even"
                    : m.balance > 0
                      ? `gets back ${money(m.balance)}`
                      : `owes ${money(-m.balance)}`}
                </span>
                {isOwner && m.userId !== me && (
                  <LinkButton danger onClick={() => void familyActions.remove(m.userId)} aria-label={`Remove ${emailOf(m.userId)}`}>
                    Remove
                  </LinkButton>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-muted">Per month. Balances show who should pay back whom to split fairly.</p>
      </div>

      <div className="grid gap-1">
        <div className="text-sm font-semibold">Shared subscriptions</div>
        {family.shared.length === 0 ? (
          <p className="m-0 text-sm text-muted">Nothing shared yet. Edit a subscription and tick “Share with my family”.</p>
        ) : (
          <ul className="m-0 grid">
            {family.shared.map((sub) => (
              <li key={sub.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line py-2 text-sm first:border-t-0">
                <span>
                  <b>{sub.name}</b> <span className="text-xs text-muted">· paid by {emailOf(sub.ownerId)}</span>
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {sub.trial ? "trial" : `${money(sub.price)} / ${CYCLE_UNITS[sub.cycle]}`} ·{" "}
                  {money(perPerson(sub, family.members.length))} each / month
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmLeave ? (
        <div className="grid gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn">
          {isOwner
            ? "This ends the family for everyone. Shared subscriptions go back to being private."
            : "Your shared subscriptions go back to being private."}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={() => void familyActions.leave()}>
              {isOwner ? "End the family" : "Leave"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmLeave(true)} className="justify-self-start text-sm text-warn underline">
          {isOwner ? "End the family" : "Leave the family"}
        </button>
      )}
    </div>
  );
}
