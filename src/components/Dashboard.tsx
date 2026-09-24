"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { sortByNextCharge, summarize } from "@/lib/billing";
import { dripActions, useDrip } from "@/lib/store";
import type { CurrencyCode, Subscription, SubscriptionInput } from "@/lib/types";
import { Brand, Header } from "./Header";
import { PlusIcon } from "./icons";
import { NextThirtyDays } from "./NextThirtyDays";
import { ProCard, ProDialog } from "./Pro";
import { SubscriptionForm } from "./SubscriptionForm";
import { SubscriptionList } from "./SubscriptionList";
import { Summary } from "./Summary";
import { Button, Panel } from "./ui";

const TOAST_MS = 2200;

export function Dashboard() {
  const snapshot = useDrip();
  // Bumping `key` remounts the form: a fresh add, or an edit of `editing`.
  const [form, setForm] = useState<{ key: number; editing: Subscription | null }>({ key: 0, editing: null });
  const [proOpen, setProOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  /** An add the Free limit blocked, finished if the user turns on Pro preview. */
  const blockedAdd = useRef<SubscriptionInput | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!snapshot) return <DashboardLoading />;

  const { state, today } = snapshot;
  const subs = sortByNextCharge(state.subs);
  const summary = summarize(subs, today);

  const showToast = (text: string) => setToast({ id: Date.now(), text });
  const resetForm = () => setForm((current) => ({ key: current.key + 1, editing: null }));

  function handleSubmit(input: SubscriptionInput) {
    if (form.editing) {
      dripActions.update(form.editing.id, input);
      showToast(`Saved ${input.name}`);
      resetForm();
    } else if (dripActions.add(input)) {
      showToast(`Added ${input.name}`);
      resetForm();
    } else {
      blockedAdd.current = input;
      setProOpen(true);
    }
  }

  function handleDelete(sub: Subscription) {
    dripActions.remove(sub.id);
    if (form.editing?.id === sub.id) resetForm();
    showToast(`Deleted ${sub.name}`);
  }

  function enablePro() {
    dripActions.setProPreview(true);
    setProOpen(false);
    const pending = blockedAdd.current;
    blockedAdd.current = null;
    if (pending && dripActions.add(pending)) {
      resetForm();
      showToast(`Pro preview is on. Added ${pending.name}`);
    } else {
      showToast("Pro preview is on");
    }
  }

  function closePro() {
    setProOpen(false);
    blockedAdd.current = null;
  }

  function focusForm() {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    nameRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <Page
        header={
          <Header
            currency={state.currency}
            proPreview={state.proPreview}
            onCurrencyChange={(currency: CurrencyCode) => dripActions.setCurrency(currency)}
            onOpenPro={() => setProOpen(true)}
            onTurnOffPro={() => {
              dripActions.setProPreview(false);
              showToast("Pro preview is off");
            }}
          />
        }
      >
        <Summary summary={summary} currency={state.currency} />

        {state.example && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm">
            <span>You&apos;re looking at example subscriptions. Clear them and add your own.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                dripActions.clearExamples();
                nameRef.current?.focus();
              }}
            >
              Clear examples
            </Button>
          </div>
        )}

        <NextThirtyDays charges={summary.charges} today={today} currency={state.currency} />

        <div className="grid items-start gap-[22px] md:grid-cols-[1.4fr_1fr]">
          <SubscriptionList
            subs={subs}
            today={today}
            currency={state.currency}
            onEdit={(sub) => setForm((current) => ({ key: current.key + 1, editing: sub }))}
            onDelete={handleDelete}
            onToggleUsed={(sub) => dripActions.toggleUsed(sub.id)}
          />
          <div className="grid gap-[22px]">
            <SubscriptionForm
              key={form.key}
              editing={form.editing}
              today={today}
              count={subs.length}
              proPreview={state.proPreview}
              nameRef={nameRef}
              sectionRef={formRef}
              onSubmit={handleSubmit}
              onCancel={resetForm}
            />
            {!state.proPreview && <ProCard onOpen={() => setProOpen(true)} />}
          </div>
        </div>
      </Page>

      <ProDialog open={proOpen} onClose={closePro} onEnable={enablePro} />
      <AddShortcut target={formRef} onActivate={focusForm} />
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 -translate-x-1/2 max-md:bottom-[calc(84px+env(safe-area-inset-bottom,0px))]"
      >
        {toast && (
          <div key={toast.id} className="w-max max-w-[calc(100vw-32px)] rounded-[10px] bg-ink px-4 py-2.5 text-center text-sm text-bg">
            {toast.text}
          </div>
        )}
      </div>
    </>
  );
}

function Page({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[980px] gap-[22px] pt-[calc(28px+env(safe-area-inset-top,0px))] pb-[calc(64px+env(safe-area-inset-bottom,0px))]">
      {header}
      <main className="grid gap-[22px]">{children}</main>
    </div>
  );
}

/** Server-rendered placeholder shown until the saved data is read in the browser. */
function DashboardLoading() {
  return (
    <Page header={<header className="flex items-center justify-between"><Brand /></header>}>
      <Summary summary={null} currency="EUR" />
      <Panel title="Next 30 days" subtitle="Each bar is a day. Orange means a free trial turns into a paid plan.">
        <div className="h-[92px]" />
      </Panel>
      <div className="grid items-start gap-[22px] md:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Your subscriptions"
          subtitle="Mark anything you haven't used this month. Drip adds it to what you could save."
        >
          <div className="h-40" />
        </Panel>
        <Panel title="Add a subscription" subtitle="Tap a common one or type your own. Prices are typical, so check yours.">
          <div className="h-72" />
        </Panel>
      </div>
    </Page>
  );
}

/** Phone-only "Add" button, shown while the form is scrolled out of view. */
function AddShortcut({ target, onActivate }: { target: RefObject<HTMLElement | null>; onActivate: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onActivate}
      className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-10 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-3 font-semibold text-accent-ink shadow-lg shadow-black/20 md:hidden"
    >
      <PlusIcon />
      Add
    </button>
  );
}
