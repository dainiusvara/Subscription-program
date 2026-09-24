"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENCIES } from "@/lib/catalog";
import { promptInstall, useInstallMode } from "@/lib/install";
import { setThemePreference, syncSavedThemeColor, useThemePreference, type ThemePreference } from "@/lib/theme";
import type { CurrencyCode } from "@/lib/types";
import { AutoThemeIcon, BrandMark, InstallIcon, MoonIcon, ShareIcon, SunIcon } from "./icons";
import { Modal } from "./Modal";
import { Button, cx } from "./ui";

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="h-[30px] w-[30px]" />
      <b className="font-display text-[26px] font-extrabold tracking-[-0.02em]">Drip</b>
    </div>
  );
}

export function Header({
  currency,
  proPreview,
  onCurrencyChange,
  onOpenPro,
  onTurnOffPro,
}: {
  currency: CurrencyCode;
  proPreview: boolean;
  onCurrencyChange: (currency: CurrencyCode) => void;
  onOpenPro: () => void;
  onTurnOffPro: () => void;
}) {
  const pill = "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em]";
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Brand />
      <div className="flex flex-wrap items-center gap-2">
        <InstallButton />
        {proPreview ? (
          <button
            type="button"
            className={cx(pill, "bg-accent text-accent-ink")}
            onClick={onTurnOffPro}
            title="Pro preview is on. Tap to turn it off."
            aria-label="Plan: Pro preview. Turn Pro preview off"
          >
            Pro
          </button>
        ) : (
          <button
            type="button"
            className={cx(pill, "bg-surface-2 text-muted")}
            onClick={onOpenPro}
            title="You're on the Free plan. See what Pro adds."
            aria-label="Plan: Free. See Pro"
          >
            Free
          </button>
        )}
        <select
          aria-label="Currency"
          value={currency}
          onChange={(event) => onCurrencyChange(event.target.value as CurrencyCode)}
          className="rounded-lg border border-line bg-surface px-2 py-1.5"
        >
          {CURRENCIES.map(({ code, symbol }) => (
            <option key={code} value={code}>
              {symbol} {code}
            </option>
          ))}
        </select>
        <ThemeToggle />
      </div>
    </header>
  );
}

const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };
const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Theme: same as this device",
  light: "Theme: light",
  dark: "Theme: dark",
};

function ThemeToggle() {
  const preference = useThemePreference();
  useEffect(syncSavedThemeColor, []);
  const Icon = preference === "light" ? SunIcon : preference === "dark" ? MoonIcon : AutoThemeIcon;
  return (
    <button
      type="button"
      onClick={() => setThemePreference(NEXT_THEME[preference])}
      title={THEME_LABELS[preference]}
      aria-label={`${THEME_LABELS[preference]}. Change theme`}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink"
    >
      <Icon />
    </button>
  );
}

function InstallButton() {
  const mode = useInstallMode();
  const [helpOpen, setHelpOpen] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  if (!mode) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="inline-flex items-center gap-1"
        onClick={() => (mode === "prompt" ? void promptInstall() : setHelpOpen(true))}
      >
        <InstallIcon width={16} height={16} />
        Install
      </Button>
      {mode === "ios" && (
        <Modal open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="install-title" initialFocus={doneRef}>
          <h3 id="install-title" className="m-0 font-display text-2xl font-bold tracking-[-0.02em]">
            Add Drip to your Home Screen
          </h3>
          <ol className="m-0 grid list-decimal gap-1.5 pl-[18px]">
            <li>
              In Safari, tap Share <ShareIcon className="inline align-[-3px]" width={16} height={16} />. On newer
              iPhones it&apos;s in the <b>•••</b> menu next to the address bar.
            </li>
            <li>
              Tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
            <li>Open Drip from your Home Screen. It runs full screen, like an app.</li>
          </ol>
          <div className="flex">
            <Button ref={doneRef} onClick={() => setHelpOpen(false)}>
              Got it
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
