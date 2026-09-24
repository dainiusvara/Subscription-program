"use client";

import { useCallback, useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, sendTestPush, type PushStatus } from "@/lib/push";
import { dripActions, type Account } from "@/lib/store";
import { REMIND_DAYS } from "@/lib/reminders";
import { Button, Panel } from "./ui";

const SUBTITLE = `Drip warns you ${REMIND_DAYS} days before each charge and before free trials end.`;

export function RemindersPanel({
  account,
  hasPro,
  onSignIn,
  onOpenPro,
}: {
  account: Account;
  hasPro: boolean;
  onSignIn: () => void;
  onOpenPro: () => void;
}) {
  if (account.kind === "local") {
    return (
      <Panel title="Reminders" titleId="reminders-title" subtitle={SUBTITLE}>
        <p className="mb-3 text-sm">Sign in to get reminders by email and on your phone.</p>
        <Button variant="ghost" size="sm" onClick={onSignIn}>
          Sign in
        </Button>
      </Panel>
    );
  }
  if (!hasPro) {
    return (
      <Panel title="Reminders" titleId="reminders-title" subtitle={SUBTITLE}>
        <p className="mb-3 text-sm">Reminders are part of Drip Pro.</p>
        <Button variant="ghost" size="sm" onClick={onOpenPro}>
          See Pro
        </Button>
      </Panel>
    );
  }
  return (
    <Panel title="Reminders" titleId="reminders-title" subtitle={SUBTITLE}>
      <div className="grid gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={account.remindEmail}
            onChange={(event) => void dripActions.setRemindEmail(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            Email me at <b className="break-all">{account.email}</b>
          </span>
        </label>
        <DeviceNotifications />
      </div>
    </Panel>
  );
}

const STATUS_TEXT: Record<Exclude<PushStatus, "unconfigured">, string> = {
  unsupported: "This browser can't show notifications from Drip.",
  "needs-install": "On iPhone and iPad, add Drip to your Home Screen first (Share → Add to Home Screen), then turn this on there.",
  denied: "Notifications are blocked for Drip. Allow them in your browser or phone settings.",
  off: "Get a notification on this device too.",
  on: "This device gets a notification before each charge.",
};

function DeviceNotifications() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(() => {
    void getPushStatus().then(setStatus);
  }, []);
  useEffect(check, [check]);

  if (!status || status === "unconfigured") return null;

  async function run(action: () => Promise<{ ok: boolean; message?: string } | void>, success?: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result && !result.ok) dripActions.notify(result.message ?? "Something went wrong.");
    else if (success) dripActions.notify(success);
    check();
  }

  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <div className="text-sm font-semibold">Notifications on this device</div>
      <p className="m-0 text-[13px] text-muted">{STATUS_TEXT[status]}</p>
      {(status === "off" || status === "on") && (
        <div className="flex flex-wrap gap-2">
          {status === "off" ? (
            <Button size="sm" disabled={busy} onClick={() => run(enablePush, "Notifications are on for this device")}>
              Turn on
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(sendTestPush, "Test sent")}>
                Send a test
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(disablePush, "Notifications are off for this device")}>
                Turn off
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
