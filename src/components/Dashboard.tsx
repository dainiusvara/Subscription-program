"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { chargeAmount, formatMoney, isActive, monthlyEquivalent, sortByNextCharge, summarize } from "@/lib/billing";
import { bankEnabled, paymentsEnabled } from "@/lib/config";
import { hasPro } from "@/lib/state";
import { bankActions, dripActions, useDrip } from "@/lib/store";
import { guideFor } from "@/lib/cancel-guides";
import { AccountDialog, SignInDialog } from "./AccountDialogs";
import { BankChooserDialog, BankPanel, BankPromptDialog } from "./BankConnect";
import { BankImportPanel } from "./BankImport";
import { CancelGuidesDialog, type GuideView } from "./CancelGuides";
import type { CurrencyCode, Subscription, SubscriptionInput } from "@/lib/types";
import { Brand, Header } from "./Header";
import { PlusIcon } from "./icons";
import { NextThirtyDays } from "./NextThirtyDays";
import { ProCard, ProDialog } from "./Pro";
import { FamilyPanel } from "./FamilyPanel";
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
  /** From an invite link: /?join=CODE (read once; the server render has no URL). */
  const [joinCode, setJoinCode] = useState<string | null>(readJoinCode);
  const [bankChooser, setBankChooser] = useState<{ open: boolean; preset: { bank: string; country: string } | null }>({
    open: false,
    preset: null,
  });
  /** Users on this device who answered "Connect your bank?" already. */
  const [bankPromptDone, setBankPromptDone] = useState<string[]>(readBankPromptDone);
  /** An add the Free limit blocked, finished if the user turns on Pro preview. */
  const blockedAdd = useRef<SubscriptionInput | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Links into the app: back from Stripe Checkout (?checkout=…) or a family invite (?join=CODE).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const join = params.get("join");
    const add = params.get("add");
    const bank = params.get("bank");
    const bankAdded = Number(params.get("added") ?? 0);
    const bankSyncFailed = params.get("sync") === "failed";
    const bankReason = params.get("reason");
    if (!checkout && !join && !add && !bank) return;
    for (const key of ["checkout", "join", "add", "bank", "added", "sync", "reason"]) params.delete(key);
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (bank === "connected") void bankActions.afterConnect({ connected: true, added: bankAdded, failed: bankSyncFailed });
    else if (bank === "cancelled") dripActions.notify("Bank not connected. You can try again any time.");
    else if (bank) {
      dripActions.notify(
        bankReason === "expired" ? "That took too long. Connect your bank again." : "Couldn't connect your bank. Try again.",
      );
    }
    if (checkout === "success") void dripActions.confirmCheckout();
    else if (checkout) dripActions.notify("Checkout cancelled. You're still on Free.");
    if (join) {
      setTimeout(() => document.getElementById("family-title")?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
    if (add) {
      setTimeout(() => {
        document.getElementById("form-title")?.scrollIntoView({ block: "start" });
        document.querySelector<HTMLInputElement>('form[aria-labelledby="form-title"] input')?.focus({ preventScroll: true });
      }, 300);
    }
  }, []);

  if (!snapshot) return <DashboardLoading />;

  const { state, today, account, notice } = snapshot;
  const subs = sortByNextCharge(state.subs);
  const summary = summarize(subs, today);

  const showToast = dripActions.notify;
  const fromBank = new Set(account.kind === "cloud" ? (account.bank?.fromBank ?? []) : []);
  // "Connect your bank?" once per user, after their account has loaded and before any bank is connected.
  const bankPromptOpen =
    bankEnabled &&
    account.kind === "cloud" &&
    account.bank !== null &&
    account.bank.connections.length === 0 &&
    !bankPromptDone.includes(account.userId) &&
    dialog === null &&
    !proOpen &&
    guideView === null &&
    !bankChooser.open;

  function finishBankPrompt() {
    if (account.kind !== "cloud") return;
    const done = [...bankPromptDone, account.userId];
    setBankPromptDone(done);
    try {
      window.localStorage.setItem(BANK_PROMPT_KEY, JSON.stringify(done));
    } catch {
      // Private mode: the question may come back next visit.
    }
  }

  function openBankChooser(preset?: { bank: string; country: string }) {
    if (!hasPro(state)) {
      setProOpen(true);
      return;
    }
    setBankChooser({ open: true, preset: preset ?? null });
  }
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
          <div className="grid gap-[22px]">
            <SubscriptionList
              subs={subs}
              today={today}
              currency={state.currency}
              onEdit={(sub) => setForm((current) => ({ key: current.key + 1, editing: sub }))}
              onDelete={handleDelete}
              onToggleUsed={(sub) => dripActions.toggleUsed(sub.id)}
              onCancelHelp={(sub) => setGuideView({ sub, guide: guideFor(sub) })}
              onRestore={(sub) => {
                if (dripActions.restore(sub.id)) showToast(`${sub.name} is back in your list`);
                else setProOpen(true);
              }}
              onBrowseGuides={() => setGuideView({ sub: null, guide: null })}
              fromBank={fromBank}
            />
            {bankEnabled && snapshot.cloudAvailable && (
              <BankPanel
                account={account}
                hasPro={hasPro(state)}
                onSignIn={() => setDialog("sign-in")}
                onOpenPro={() => setProOpen(true)}
                onConnect={openBankChooser}
              />
            )}
            {snapshot.cloudAvailable && (
              <FamilyPanel
                account={account}
                hasPro={hasPro(state)}
                currency={state.currency}
                joinCode={joinCode}
                onJoinHandled={() => setJoinCode(null)}
                onSignIn={() => setDialog("sign-in")}
                onOpenPro={() => setProOpen(true)}
              />
            )}
            <BankImportPanel
              title={bankEnabled && snapshot.cloudAvailable ? "Or import a bank statement" : undefined}
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
          </div>
          <div className="grid gap-[22px]">
            <SubscriptionForm
              key={form.key}
              editing={form.editing}
              today={today}
              count={subs.filter(isActive).length}
              hasPro={hasPro(state)}
              inFamily={account.kind === "cloud" && account.family !== null}
              nameRef={nameRef}
              sectionRef={formRef}
              onSubmit={handleSubmit}
              onCancel={resetForm}
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
        onCancelled={(sub) => {
          dripActions.cancel(sub.id);
          if (form.editing?.id === sub.id) resetForm();
          const yearly = monthlyEquivalent(chargeAmount(sub), sub.cycle) * 12;
          showToast(`Nice. Cancelling ${sub.name} saves you ${formatMoney(yearly, state.currency)} a year.`);
        }}
      />
      {bankEnabled && (
        <>
          <BankPromptDialog
            open={bankPromptOpen}
            hasPro={hasPro(state)}
            onConnect={() => {
              finishBankPrompt();
              openBankChooser();
            }}
            onOpenPro={() => {
              finishBankPrompt();
              setProOpen(true);
            }}
            onClose={finishBankPrompt}
          />
          <BankChooserDialog
            open={bankChooser.open}
            preset={bankChooser.preset}
            onClose={() => setBankChooser({ open: false, preset: null })}
          />
        </>
      )}
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

const BANK_PROMPT_KEY = "drip:bank-prompt-done";

function readBankPromptDone(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(BANK_PROMPT_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function readJoinCode(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("join");
  return code ? code.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12) : null;
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
