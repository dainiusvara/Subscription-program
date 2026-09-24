"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { MAX_DATE, MIN_DATE, addDays, isSupportedDate, parsePrice } from "@/lib/billing";
import { CATEGORIES, CYCLES, CYCLE_LABELS, FREE_LIMIT, PRESETS, type Preset } from "@/lib/catalog";
import type { Category, Cycle, ISODate, Subscription, SubscriptionInput } from "@/lib/types";
import { Button, Panel } from "./ui";

type Field = "name" | "price" | "date";

const FIELD = "w-full min-w-0 rounded-[9px] border border-line bg-bg px-2.5 py-[9px] max-md:text-base";
const LABEL = "text-xs font-semibold tracking-[0.03em] text-muted";

/**
 * Add / edit form. The parent remounts it (via `key`) to start a new add or an
 * edit, so its state always starts from `editing`.
 */
export function SubscriptionForm({
  editing,
  today,
  count,
  hasPro,
  nameRef,
  sectionRef,
  onSubmit,
  onCancel,
}: {
  editing: Subscription | null;
  today: ISODate;
  count: number;
  hasPro: boolean;
  nameRef: RefObject<HTMLInputElement | null>;
  sectionRef: RefObject<HTMLDivElement | null>;
  onSubmit: (input: SubscriptionInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(editing?.name ?? "");
  const [price, setPrice] = useState(() =>
    editing ? String(editing.trial ? (editing.priceAfterTrial ?? 0) : editing.price) : "",
  );
  const [cycle, setCycle] = useState<Cycle>(editing?.cycle ?? "month");
  const [date, setDate] = useState<string>(editing?.nextCharge ?? addDays(today, 7));
  const [category, setCategory] = useState<Category>(editing?.category ?? "Streaming");
  const [trial, setTrial] = useState(editing?.trial ?? false);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Starting an edit: bring the form into view and put the cursor in Name.
  useEffect(() => {
    if (!editing) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    nameRef.current?.focus({ preventScroll: true });
  }, [editing, nameRef, sectionRef]);

  function pickPreset(pick: Preset) {
    setName(pick.name);
    setPrice(String(pick.price));
    setCategory(pick.category);
    setCycle("month");
    setPreset(pick);
    if (!date) setDate(addDays(today, 7));
    priceRef.current?.focus();
  }

  const fieldRefs: Record<Field, RefObject<HTMLInputElement | null>> = { name: nameRef, price: priceRef, date: dateRef };

  function fail(field: Field, message: string) {
    setError({ field, message });
    fieldRefs[field].current?.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const amount = parsePrice(price);
    if (!trimmed) return fail("name", 'Add a name, like "Netflix".');
    if (amount === null) return fail("price", "Enter the price you pay, for example 9.99.");
    if (!isSupportedDate(date)) return fail("date", "Pick the date of the next charge.");
    setError(null);
    onSubmit({ name: trimmed, price: amount, cycle, nextCharge: date, category, trial, color: preset?.color });
  }

  const errorId = `${id}-error`;
  /** Marks the field that failed validation and links it to the message. */
  const errorProps = (field: Field) =>
    error?.field === field ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  return (
    <div ref={sectionRef} className="scroll-mt-4">
      <Panel
        title={editing ? `Edit ${editing.name}` : "Add a subscription"}
        titleId="form-title"
        subtitle="Tap a common one or type your own. Prices are typical, so check yours."
      >
        <div className="mb-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Common subscriptions">
          {PRESETS.map((pick) => (
            <button
              key={pick.name}
              type="button"
              onClick={() => pickPreset(pick)}
              className="rounded-full border border-line bg-bg px-2.5 py-1 text-[13px] hover:border-accent"
            >
              {pick.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid gap-2.5" aria-labelledby="form-title">
          <div className="grid gap-1">
            <label htmlFor={`${id}-name`} className={LABEL}>
              Name
            </label>
            <input
              id={`${id}-name`}
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              placeholder="e.g. Netflix"
              autoComplete="off"
              enterKeyHint="next"
              {...errorProps("name")}
              className={FIELD}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="grid gap-1">
              <label htmlFor={`${id}-price`} className={LABEL}>
                {trial ? "Price after trial" : "Price"}
              </label>
              <input
                id={`${id}-price`}
                ref={priceRef}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
                inputMode="decimal"
                placeholder="9.99"
                autoComplete="off"
                {...errorProps("price")}
                className={FIELD}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor={`${id}-cycle`} className={LABEL}>
                Billed
              </label>
              <select
                id={`${id}-cycle`}
                value={cycle}
                onChange={(event) => setCycle(event.target.value as Cycle)}
                className={FIELD}
              >
                {CYCLES.map((value) => (
                  <option key={value} value={value}>
                    {CYCLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="grid gap-1">
              <label htmlFor={`${id}-date`} className={LABEL}>
                {trial ? "Trial ends" : "Next charge"}
              </label>
              <input
                id={`${id}-date`}
                ref={dateRef}
                type="date"
                min={MIN_DATE}
                max={MAX_DATE}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                {...errorProps("date")}
                className={`${FIELD} min-h-[42px] [&::-webkit-date-and-time-value]:text-left`}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor={`${id}-category`} className={LABEL}>
                Category
              </label>
              <select
                id={`${id}-category`}
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
                className={FIELD}
              >
                {CATEGORIES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trial}
              onChange={(event) => setTrial(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            This is a free trial
          </label>

          {error && (
            <p id={errorId} role="alert" className="m-0 text-xs text-warn">
              {error.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">{editing ? "Save changes" : "Add subscription"}</Button>
            {editing && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {!hasPro && (
              <span className="text-[13px] text-muted">
                <b className="text-ink">{count}</b> of {FREE_LIMIT} on Free
              </span>
            )}
          </div>
        </form>
      </Panel>
    </div>
  );
}
