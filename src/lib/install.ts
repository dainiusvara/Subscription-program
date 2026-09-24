/**
 * "Install app" support. Chrome, Edge and Android fire `beforeinstallprompt`,
 * which we keep so our own button can open the install prompt. iPhone and iPad
 * have no such event, so there we explain the Share → Add to Home Screen steps.
 */
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode = "prompt" | "ios" | null;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

// Listen as soon as this module loads: the event can fire before React hydrates.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS reports itself as a Mac, but Macs have no touch screen.
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

function getMode(): InstallMode {
  if (installed || isStandalone()) return null;
  if (deferredPrompt) return "prompt";
  return isIOS() ? "ios" : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** How this browser can install the app, or null when it can't (or already did). */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getMode, () => null);
}

/** Opens the browser's install prompt. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  emit();
  return outcome === "accepted";
}
