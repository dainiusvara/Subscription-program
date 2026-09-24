"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { dripActions, dripAuth, type Account } from "@/lib/store";
import type { DripState } from "@/lib/types";
import { Modal } from "./Modal";
import { Button, cx } from "./ui";

const FIELD = "w-full min-w-0 rounded-[9px] border border-line bg-bg px-2.5 py-[9px] max-md:text-base";
const TITLE = "m-0 font-display text-2xl font-bold tracking-[-0.02em]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Two steps: email, then the 6-digit code from the email. No passwords. */
export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  function close() {
    setStep("email");
    setCode("");
    setError(null);
    setResent(false);
    onClose();
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError("Enter your email address, like name@example.com.");
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await dripAuth.sendCode(address);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEmail(address);
    setStep("code");
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from the email.");
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await dripAuth.verifyCode(email, digits);
    setBusy(false);
    if (result.ok) close();
    else setError(result.message);
  }

  return (
    <Modal open={open} onClose={close} labelledBy={`${id}-title`} initialFocus={emailRef}>
      <h3 id={`${id}-title`} className={TITLE}>
        {step === "email" ? "Sign in to Drip" : "Check your email"}
      </h3>
      {step === "email" ? (
        <form onSubmit={sendCode} noValidate className="grid gap-3">
          <p className="m-0 text-muted">
            Keep your subscriptions safe and see them on all your devices. We&apos;ll email you a 6-digit code, so
            there&apos;s no password to remember.
          </p>
          <div className="grid gap-1">
            <label htmlFor={`${id}-email`} className="text-xs font-semibold tracking-[0.03em] text-muted">
              Email
            </label>
            <input
              id={`${id}-email`}
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className={FIELD}
            />
          </div>
          {error && (
            <p role="alert" className="m-0 text-xs text-warn">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </Button>
            <Button variant="ghost" onClick={close}>
              Not now
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="grid gap-3">
          <p className="m-0 text-muted">
            We sent a 6-digit code to <b className="text-ink">{email}</b>. It can take a minute to arrive.
          </p>
          <div className="grid gap-1">
            <label htmlFor={`${id}-code`} className="text-xs font-semibold tracking-[0.03em] text-muted">
              Code
            </label>
            <input
              id={`${id}-code`}
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className={cx(FIELD, "font-mono text-lg tracking-[0.3em] max-md:text-lg")}
            />
          </div>
          {error && (
            <p role="alert" className="m-0 text-xs text-warn">
              {error}
            </p>
          )}
          {resent && !error && <p className="m-0 text-xs text-muted">We sent a new code.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await sendCode();
                setResent(true);
              }}
            >
              Send a new code
            </Button>
          </div>
          <button
            type="button"
            className="justify-self-start text-sm text-muted underline"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </Modal>
  );
}

export function syncStatus(account: Extract<Account, { kind: "cloud" }>): string {
  const changes = `${account.pending} ${account.pending === 1 ? "change" : "changes"}`;
  if (account.offline) {
    return account.pending > 0
      ? `Offline. ${changes} will be saved when you're back online.`
      : "Offline. Showing the copy saved on this device.";
  }
  if (account.syncing) return "Saving…";
  if (account.pending > 0) return `${changes} waiting to be saved`;
  return "Everything is saved to your account";
}

const DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });

function planText(state: DripState, account: Extract<Account, { kind: "cloud" }>): string {
  const until = account.proUntil ? DATE.format(new Date(account.proUntil)) : null;
  if (state.pro) {
    if (account.proStatus === "canceling" && until) return `Pro until ${until} (cancelled)`;
    if (account.proStatus === "past_due") return "Pro, but the last payment failed. Update your card under Manage subscription.";
    return until ? `Pro, renews ${until}` : "Pro";
  }
  return state.proPreview ? "Pro preview" : "Free";
}

export function AccountDialog({
  open,
  onClose,
  account,
  state,
}: {
  open: boolean;
  onClose: () => void;
  account: Extract<Account, { kind: "cloud" }>;
  state: DripState;
}) {
  const id = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const plan = planText(state, account);
  const canManage = account.proStatus !== null;

  function close() {
    setConfirmDelete(false);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} labelledBy={`${id}-title`} initialFocus={closeRef}>
      <h3 id={`${id}-title`} className={TITLE}>
        Your account
      </h3>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="m-0 font-semibold break-all">{account.email}</dd>
        <dt className="text-muted">Plan</dt>
        <dd className="m-0">{plan}</dd>
        <dt className="text-muted">Sync</dt>
        <dd className="m-0">{syncStatus(account)}</dd>
      </dl>
      {account.pending > 0 && (
        <p className="m-0 text-xs text-muted">
          If you sign out now, unsaved changes stay on this device and are sent when you sign back in.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-warn">
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="grid gap-2 rounded-xl bg-warn-soft p-3">
          <p className="m-0 text-sm text-warn">
            This deletes your account and every subscription in it, for good.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await dripAuth.deleteAccount();
                setBusy(false);
                if (result.ok) close();
                else setError(result.message);
              }}
            >
              {busy ? "Deleting…" : "Delete for good"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep my account
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button ref={closeRef} onClick={close}>
            Done
          </Button>
          {canManage && (
            <Button variant="ghost" onClick={() => void dripActions.openBillingPortal()}>
              Manage subscription
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              await dripAuth.signOut();
              close();
            }}
          >
            Sign out
          </Button>
          <Button variant="ghost" className="text-warn" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      )}
    </Modal>
  );
}
