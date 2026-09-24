"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { sortByNextCharge, summarize } from "@/lib/billing";
import { paymentsEnabled } from "@/lib/config";
import { hasPro } from "@/lib/state";
import { dripActions, useDrip } from "@/lib/store";
import { guideFor } from "@/lib/cancel-guides";
import { AccountDialog, SignInDialog } from "./AccountDialogs";
import { BankImportPanel } from "./BankImport";
import { CancelGuidesDialog, type GuideView } from "./CancelGuides";
import type { CurrencyCode, Subscription, SubscriptionInput } from "@/lib/types";
import { Brand, Header } from "./Header";
import { PlusIcon } from "./icons";
import { NextThirtyDays } from "./NextThirtyDays";
import { ProCard, ProDialog } from "./Pro";
import { RemindersPanel } from "./RemindersPanel";
import { SubscriptionForm } from "./SubscriptionForm";
import { SubscriptionList } from "./SubscriptionList";
import { Summary } from "./Summary";
import { Button, Panel } from "./ui";

export function Dashboard() {
  const snapshot = useDrip();
  // Bumping `key` remounts the form: a fresh add, or an edit of `editing`.
  const [form, setForm] = useState<{ key: number; editing: Subscription | null }>({ key: 0, editing: null });
  const [proOpen, setProOpen] = useState(false);
  const [dialog, setDialog] = useState<"sign-in" | "account" | null>(null);
  const [guideView, setGuideView] = useState<GuideView | null>(null);
  /** An add the Free limit blocked, finished if the user turns on Pro preview. */
  const blockedAdd = useRef<SubscriptionInput | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Back from Stripe Checkout (?checkout=success or ?checkout=cancelled).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    params.delete("checkout");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (checkout === "success") void dripActions.confirmCheckout();
    else dripActions.notify("Checkout cancelled. You're still on Free.");
  }, []);

  if (!snapshot) return <DashboardLoading />;

  const { state, today, account, notice } = snapshot;
  const subs = sortByNextCharge(state.subs);
  const summary = summarize(subs, today);

  const showToast = dripActions.notify;
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

  async function enablePro() {
    // Read the blocked add first: closing the dialog clears it.
    const pending = blockedAdd.current;
    blockedAdd.current = null;
    setProOpen(false);
    if (!(await dripActions.setProPreview(true))) return;
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
            pro={state.pro}
            proPreview={state.proPreview}
            account={account}
            cloudAvailable={snapshot.cloudAvailable}
            onCurrencyChange={(currency: CurrencyCode) => dripActions.setCurrency(currency)}
            onOpenPro={() => setProOpen(true)}
            onTurnOffPro={async () => {
              if (await dripActions.setProPreview(false)) showToast("Pro preview is off");
            }}
            onSignIn={() => setDialog("sign-in")}
            onOpenAccount={() => setDialog("account")}
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
            onCancelHelp={(sub) => setGuideView({ sub, guide: guideFor(sub) })}
            onBrowseGuides={() => setGuideView({ sub: null, guide: null })}
          />
          <div className="grid gap-[22px]">
            <SubscriptionForm
              key={form.key}
              editing={form.editing}
              today={today}
              count={subs.length}
              hasPro={hasPro(state)}
              nameRef={nameRef}
              sectionRef={formRef}
              onSubmit={handleSubmit}
              onCancel={resetForm}
            />
            <BankImportPanel
              subs={subs}
              today={today}
              currency={state.currency}
              hasPro={hasPro(state)}
              onOpenPro={() => setProOpen(true)}
              onAdd={(inputs) => {
                let added = 0;
                for (const input of inputs) if (dripActions.add(input)) added++;
                showToast(
                  added === inputs.length
                    ? `Added ${added} ${added === 1 ? "subscription" : "subscriptions"} from your bank statement`
                    : `Added ${added} of ${inputs.length}. The Free plan covers 5 subscriptions.`,
                );
                return added;
              }}
            />
            {snapshot.cloudAvailable && (
              <RemindersPanel
                account={account}
                hasPro={hasPro(state)}
                onSignIn={() => setDialog("sign-in")}
                onOpenPro={() => setProOpen(true)}
              />
            )}
            {!hasPro(state) && <ProCard onOpen={() => setProOpen(true)} />}
          </div>
        </div>
      </Page>

      <CancelGuidesDialog
        view={guideView}
        hasPro={hasPro(state)}
        onClose={() => setGuideView(null)}
        onOpenPro={() => {
          setGuideView(null);
          setProOpen(true);
        }}
        onRemove={(sub) => {
          dripActions.remove(sub.id);
          if (form.editing?.id === sub.id) resetForm();
          showToast(`Removed ${sub.name}. That's money saved.`);
        }}
      />
      <ProDialog
        open={proOpen}
        onClose={closePro}
        onEnable={enablePro}
        paymentsEnabled={paymentsEnabled}
        signedIn={account.kind === "cloud"}
        onSignIn={() => {
          closePro();
          setDialog("sign-in");
        }}
        onUpgrade={(plan) => dripActions.startCheckout(plan)}
      />
      {snapshot.cloudAvailable && (
        <SignInDialog open={dialog === "sign-in"} onClose={() => setDialog(null)} />
      )}
      {account.kind === "cloud" && (
        <AccountDialog
          open={dialog === "account"}
          onClose={() => setDialog(null)}
          account={account}
          state={state}
        />
      )}
      <AddShortcut target={formRef} onActivate={focusForm} />
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 -translate-x-1/2 max-md:bottom-[calc(84px+env(safe-area-inset-bottom,0px))]"
      >
        {notice && (
          <div key={notice.id} className="w-max max-w-[calc(100vw-32px)] rounded-[10px] bg-ink px-4 py-2.5 text-center text-sm text-bg">
            {notice.text}
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
