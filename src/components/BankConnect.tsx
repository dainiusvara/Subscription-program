"use client";

import { useEffect, useId, useRef, useState } from "react";
import { bankActions, type Account, type BankChoice } from "@/lib/store";
import type { BankConnectionInfo } from "@/lib/sync";
import { Modal } from "./Modal";
import { Button, Panel, cx } from "./ui";

/** Countries where banks can be connected (EU/EEA and the UK). */
const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "GB", name: "United Kingdom" },
];

const ZONE_COUNTRY: Record<string, string> = {
  "Europe/Vilnius": "LT", "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Europe/Helsinki": "FI", "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Madrid": "ES",
  "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Vienna": "AT", "Europe/Warsaw": "PL",
  "Europe/Lisbon": "PT", "Europe/Dublin": "IE", "Europe/London": "GB", "Europe/Prague": "CZ", "Europe/Bratislava": "SK",
  "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Sofia": "BG", "Europe/Zagreb": "HR", "Europe/Ljubljana": "SI",
  "Europe/Athens": "GR", "Europe/Luxembourg": "LU", "Europe/Malta": "MT", "Asia/Nicosia": "CY", "Atlantic/Reykjavik": "IS",
};

/** The user's country: the time zone says where they are; the language region is a fallback ("en-GB" is common everywhere). */
function guessCountry(): string {
  if (typeof navigator === "undefined") return "LT";
  const fromZone = ZONE_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone];
  if (fromZone) return fromZone;
  for (const language of navigator.languages ?? [navigator.language]) {
    const region = language.split("-")[1]?.toUpperCase();
    if (region && COUNTRIES.some((c) => c.code === region)) return region;
  }
  return "LT";
}

const TRUST =
  "You log in at your bank's own website. Drip gets read-only access: it can't move money, and never sees your password or card number. Transactions are read to find subscriptions and not kept.";

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function until(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------------ */
/* The panel on the dashboard                                               */
/* ------------------------------------------------------------------------ */

export function BankPanel({
  account,
  hasPro,
  onSignIn,
  onOpenPro,
  onConnect,
}: {
  account: Account;
  hasPro: boolean;
  onSignIn: () => void;
  onOpenPro: () => void;
  onConnect: (preset?: { bank: string; country: string }) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const subtitle = "Drip reads your bank and adds every subscription it finds, including new ones as soon as they're charged.";

  if (account.kind === "local") {
    return (
      <Panel title="Connect your bank" titleId="bank-connect-title" subtitle={subtitle}>
        <p className="mb-3 text-sm">Sign in first, then connect your bank.</p>
        <Button variant="ghost" size="sm" onClick={onSignIn}>
          Sign in
        </Button>
      </Panel>
    );
  }

  const connections = account.bank?.connections ?? [];
  return (
    <Panel title="Connect your bank" titleId="bank-connect-title" subtitle={subtitle}>
      {connections.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              connection={c}
              confirming={confirmId === c.id}
              onReconnect={() => onConnect({ bank: c.bankName, country: c.bankCountry })}
              onDisconnect={async () => {
                if (confirmId !== c.id) {
                  setConfirmId(c.id);
                  return;
                }
                setConfirmId(null);
                await bankActions.disconnect(c.id, c.bankName);
              }}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {hasPro ? (
          <>
            <Button size="sm" variant={connections.length > 0 ? "ghost" : "primary"} onClick={() => onConnect()}>
              {connections.length > 0 ? "Connect another bank" : "Connect my bank"}
            </Button>
            {connections.some((c) => c.status === "active") && (
              <Button size="sm" variant="ghost" onClick={() => void bankActions.checkNow()}>
                Check now
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="m-0 w-full text-sm">Connecting your bank is part of Drip Pro.</p>
            <Button variant="ghost" size="sm" onClick={onOpenPro}>
              See Pro
            </Button>
          </>
        )}
      </div>
      <p className="mt-3 mb-0 text-xs text-muted">{TRUST}</p>
    </Panel>
  );
}

function ConnectionRow({
  connection: c,
  confirming,
  onReconnect,
  onDisconnect,
}: {
  connection: BankConnectionInfo;
  confirming: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const expired = c.status === "expired";
  return (
    <li className={cx("grid gap-1 rounded-xl border px-3 py-2.5", expired ? "border-warn/50 bg-warn-soft/50" : "border-line")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{c.bankName}</span>
        <span className={cx("text-xs font-semibold", expired ? "text-warn" : "text-good")}>
          {expired ? "Needs reconnecting" : "Connected"}
        </span>
      </div>
      <div className="text-xs text-muted">
        {expired
          ? "Banks ask you to confirm access every few months."
          : `Checked ${ago(c.lastSyncedAt)}${c.validUntil ? ` · access until ${until(c.validUntil)}` : ""}`}
      </div>
      {c.lastError && !expired && <div className="text-xs text-warn">{c.lastError}</div>}
      <div className="flex flex-wrap gap-2 pt-1">
        {expired && (
          <Button size="sm" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-md px-1.5 py-0.5 text-xs text-warn hover:bg-surface-2"
          aria-label={confirming ? `Tap again to disconnect ${c.bankName}` : `Disconnect ${c.bankName}`}
        >
          {confirming ? "Tap again to disconnect" : "Disconnect"}
        </button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* Picking a bank                                                           */
/* ------------------------------------------------------------------------ */

export function BankChooserDialog({
  open,
  preset,
  onClose,
}: {
  open: boolean;
  /** Reconnecting: go straight to this bank. */
  preset: { bank: string; country: string } | null;
  onClose: () => void;
}) {
  const id = useId();
  const [country, setCountry] = useState(guessCountry);
  const [banks, setBanks] = useState<BankChoice[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    void bankActions.listBanks(country).then((result) => {
      if (stale) return;
      if (result.ok) {
        setBanks(result.banks);
        setError(null);
      } else {
        setBanks([]);
        setError(result.message);
      }
    });
    return () => {
      stale = true;
    };
  }, [open, country]);

  async function go(bank: string, bankCountry: string) {
    setGoing(bank);
    setError(null);
    const problem = await bankActions.connect(bank, bankCountry);
    if (problem) {
      setGoing(null);
      setError(problem);
    }
  }

  function close() {
    setQuery("");
    setGoing(null);
    setError(null);
    onClose();
  }

  const q = query.trim().toLowerCase();
  const shown = (banks ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));

  return (
    <Modal open={open} onClose={close} labelledBy={`${id}-title`} initialFocus={searchRef}>
      <h3 id={`${id}-title`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
        {preset ? `Reconnect ${preset.bank}` : "Pick your bank"}
      </h3>
      <p className="m-0 text-sm text-muted">{TRUST}</p>
      {preset ? (
        <Button onClick={() => void go(preset.bank, preset.country)} disabled={going !== null}>
          {going ? `Opening ${preset.bank}…` : `Continue to ${preset.bank}`}
        </Button>
      ) : (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <label className="sr-only" htmlFor={`${id}-country`}>
              Country
            </label>
            <select
              id={`${id}-country`}
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setBanks(null);
              }}
              className="rounded-[9px] border border-line bg-bg px-2 py-[9px] max-md:text-base"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search banks"
              aria-label="Search banks"
              className="min-w-0 rounded-[9px] border border-line bg-bg px-2.5 py-[9px] max-md:text-base"
            />
          </div>
          <ul className="m-0 grid max-h-[46vh] gap-1 overflow-y-auto" aria-busy={banks === null}>
            {banks === null && <li className="px-2 py-3 text-sm text-muted">Loading banks…</li>}
            {banks !== null && shown.length === 0 && !error && (
              <li className="px-2 py-3 text-sm text-muted">No bank matches “{query}”.</li>
            )}
            {shown.map((b) => (
              <li key={`${b.country}:${b.name}`}>
                <button
                  type="button"
                  disabled={going !== null}
                  onClick={() => void go(b.name, b.country)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-white">
                    {b.logo ? (
                      // The bank provider hosts the logos.
                      <span
                        aria-hidden="true"
                        className="h-6 w-6 bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url(${JSON.stringify(b.logo)})` }}
                      />
                    ) : (
                      <span className="text-xs font-bold text-muted">{b.name.charAt(0)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{b.name}</span>
                  {going === b.name && <span className="text-xs text-muted">Opening…</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-warn">
          {error}
        </p>
      )}
      <div className="flex">
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* The question after signing in                                           */
/* ------------------------------------------------------------------------ */

export function BankPromptDialog({
  open,
  hasPro,
  onConnect,
  onOpenPro,
  onClose,
}: {
  open: boolean;
  hasPro: boolean;
  onConnect: () => void;
  onOpenPro: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const laterRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={open} onClose={onClose} labelledBy={`${id}-title`} initialFocus={laterRef}>
      <h3 id={`${id}-title`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
        Connect your bank?
      </h3>
      <p className="m-0">
        Drip finds every subscription you pay for and adds it for you. When you sign up for something new, it shows
        up here after the first charge, so you never have to type it in.
      </p>
      <ul className="m-0 grid list-disc gap-1 pl-[18px] text-sm text-muted">
        <li>You log in at your bank&apos;s own website, not in Drip.</li>
        <li>Read-only: Drip can&apos;t move money and never sees your password or card number.</li>
        <li>Disconnect any time.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        {hasPro ? (
          <Button onClick={onConnect}>Connect my bank</Button>
        ) : (
          <Button onClick={onOpenPro}>Connect my bank · Pro</Button>
        )}
        <Button ref={laterRef} variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </Modal>
  );
}
