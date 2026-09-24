"use client";

import { useId, useRef, useState } from "react";
import { formatMoney, formatShortDate } from "@/lib/billing";
import { detectSubscriptions, type Candidate } from "@/lib/bank/detect";
import { sampleStatement } from "@/lib/bank/sample";
import { parseStatement, type ColumnMapping, type Transaction } from "@/lib/bank/statement";
import { CYCLE_UNITS } from "@/lib/catalog";
import type { CurrencyCode, ISODate, Subscription, SubscriptionInput } from "@/lib/types";
import { Modal } from "./Modal";
import { Button, Panel, Tag, buttonClass, cx } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SELECT = "w-full min-w-0 rounded-[9px] border border-line bg-bg px-2 py-2 max-md:text-base";

type Stage =
  | { kind: "idle" }
  | { kind: "map"; text: string; headers: string[]; mapping: { date: number; description: number; amount: number } }
  | { kind: "results"; candidates: Candidate[]; transactions: Transaction[]; selected: Set<string> };

export function BankImportPanel({
  subs,
  today,
  currency,
  hasPro,
  onOpenPro,
  onAdd,
}: {
  subs: Subscription[];
  today: ISODate;
  currency: CurrencyCode;
  hasPro: boolean;
  onOpenPro: () => void;
  /** Adds the chosen subscriptions; returns how many were added. */
  onAdd: (inputs: SubscriptionInput[]) => number;
}) {
  const id = useId();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  function analyse(transactions: Transaction[]) {
    const candidates = detectSubscriptions(transactions, today, subs);
    const selected = new Set(candidates.filter((c) => !c.stopped && !c.alreadyTracked).map((c) => c.key));
    setStage({ kind: "results", candidates, transactions, selected });
  }

  function read(text: string, mapping?: ColumnMapping) {
    const parsed = parseStatement(text, mapping);
    if (!parsed.mapping || parsed.transactions.length === 0) {
      if (parsed.headers.length < 2) {
        setError("That doesn't look like a CSV export of transactions. Try another file.");
        return;
      }
      setStage({ kind: "map", text, headers: parsed.headers, mapping: { date: 0, description: 1, amount: 2 } });
      return;
    }
    analyse(parsed.transactions);
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is over 10 MB. Export a shorter period, like the last 6 to 12 months.");
      return;
    }
    read(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setStage({ kind: "idle" });
  }

  const results = stage.kind === "results" ? stage : null;
  const chosen = results ? results.candidates.filter((c) => results.selected.has(c.key)) : [];
  const range =
    results && results.transactions.length > 0
      ? {
          from: results.transactions.reduce((m, t) => (t.date < m ? t.date : m), results.transactions[0].date),
          to: results.transactions.reduce((m, t) => (t.date > m ? t.date : m), results.transactions[0].date),
        }
      : null;

  return (
    <Panel
      title="Find subscriptions automatically"
      titleId="bank-title"
      subtitle="Download your transactions as a CSV file from your online bank (usually under Statements or Export) and choose it here."
    >
      <div className="grid gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cx(buttonClass("ghost", "sm"), "cursor-pointer")}>
            Choose CSV file
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          <button type="button" onClick={() => read(sampleStatement(today))} className="text-sm text-muted underline hover:text-ink">
            Try a sample file
          </button>
        </div>
        <p className="m-0 text-xs text-muted">
          The file is read on this device only. It&apos;s never uploaded, and Drip never sees your bank login.
        </p>
        {error && (
          <p role="alert" className="m-0 text-xs text-warn">
            {error}
          </p>
        )}
      </div>

      {/* Columns we couldn't recognise: let the user point them out. */}
      <Modal open={stage.kind === "map"} onClose={close} labelledBy={`${id}-map`} initialFocus={doneRef}>
        {stage.kind === "map" && (
          <>
            <h3 id={`${id}-map`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
              Which columns are which?
            </h3>
            <p className="m-0 text-sm text-muted">Drip didn&apos;t recognise this bank&apos;s format. Pick the columns once:</p>
            {(["date", "description", "amount"] as const).map((field) => (
              <label key={field} className="grid gap-1 text-xs font-semibold tracking-[0.03em] text-muted">
                {field === "date" ? "Date" : field === "description" ? "Who was paid / description" : "Amount"}
                <select
                  className={SELECT}
                  value={stage.mapping[field]}
                  onChange={(event) =>
                    setStage({ ...stage, mapping: { ...stage.mapping, [field]: Number(event.target.value) } })
                  }
                >
                  {stage.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                ref={doneRef}
                onClick={() => {
                  const { date, description, amount } = stage.mapping;
                  const parsed = parseStatement(stage.text, { date, description: [description], amount, debit: null, credit: null, direction: null });
                  if (parsed.transactions.length === 0) {
                    setError("No transactions could be read with those columns.");
                    close();
                  } else {
                    analyse(parsed.transactions);
                  }
                }}
              >
                Find subscriptions
              </Button>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={results !== null} onClose={close} labelledBy={`${id}-results`} initialFocus={doneRef}>
        {results && (
          <>
            <h3 id={`${id}-results`} className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
              {results.candidates.length === 0
                ? "No subscriptions found"
                : `Found ${results.candidates.length} ${results.candidates.length === 1 ? "subscription" : "subscriptions"}`}
            </h3>
            <p className="m-0 text-sm text-muted">
              {results.transactions.length} transactions
              {range && ` from ${formatShortDate(range.from)} to ${formatShortDate(range.to)}`}.
            </p>
            {results.candidates.length === 0 ? (
              <p className="m-0 text-sm">
                Drip looks for payments to the same place, for about the same amount, at regular intervals. Try exporting at least 3
                months, including card payments.
              </p>
            ) : (
              <ul className="m-0 grid max-h-[50vh] gap-1 overflow-y-auto">
                {results.candidates.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-accent"
                        checked={results.selected.has(c.key)}
                        onChange={(event) => {
                          const selected = new Set(results.selected);
                          if (event.target.checked) selected.add(c.key);
                          else selected.delete(c.key);
                          setStage({ ...results, selected });
                        }}
                      />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <b className="break-words">{c.name}</b>
                          <span className="font-mono text-sm tabular-nums">
                            {formatMoney(c.price, currency)} / {CYCLE_UNITS[c.cycle]}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>
                            Paid {c.occurrences} times, last on {formatShortDate(c.lastCharge)}
                          </span>
                          {c.stopped && <Tag>Probably stopped</Tag>}
                          {c.alreadyTracked && <Tag tone="good">Already in Drip</Tag>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {results.candidates.length > 0 && !hasPro && (
              <div className="grid gap-2 rounded-xl bg-accent-soft p-3 text-sm">
                <p className="m-0">Adding subscriptions found in your bank statement is part of Drip Pro.</p>
                <Button size="sm" className="justify-self-start" onClick={() => { close(); onOpenPro(); }}>
                  See Pro
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {results.candidates.length > 0 && hasPro ? (
                <Button
                  ref={doneRef}
                  disabled={chosen.length === 0}
                  onClick={() => {
                    onAdd(
                      chosen.map((c) => ({
                        name: c.name,
                        price: c.price,
                        cycle: c.cycle,
                        nextCharge: c.nextCharge,
                        category: c.category,
                        trial: false,
                        color: c.color,
                      })),
                    );
                    close();
                  }}
                >
                  Add {chosen.length} to Drip
                </Button>
              ) : (
                <Button ref={doneRef} onClick={close}>
                  Close
                </Button>
              )}
              {results.candidates.length > 0 && hasPro && (
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>
    </Panel>
  );
}
