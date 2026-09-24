import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_KEY } from "./theme-script";

export type ThemePreference = "system" | "light" | "dark";

const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** Keeps the browser bar colour in step with a theme the user picked by hand. */
function syncThemeColorMeta(preference: ThemePreference) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute("media") ?? "";
    const scheme = preference === "system" ? (media.includes("dark") ? "dark" : "light") : preference;
    meta.setAttribute("content", THEME_COLORS[scheme]);
  });
}

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  syncThemeColorMeta(preference);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
  apply(preference);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    apply(read());
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** Applies the saved preference to the browser bar colour once the app has loaded. */
export function syncSavedThemeColor() {
  syncThemeColorMeta(read());
}
