/**
 * Server-side access to the bank provider. Never import from a client component.
 */
import { createEnableBanking, enableBankingConfig, type BankApi } from "./enable-banking";

let api: BankApi | null = null;

/** Bank connections are set up on this server (see DEPLOY.md). */
export function bankConfigured(): boolean {
  return enableBankingConfig() !== null;
}

export function getBankApi(): BankApi {
  const config = enableBankingConfig();
  if (!config) throw new Error("Bank connections aren't set up on this server");
  api ??= createEnableBanking(config);
  return api;
}

/** The cookie that ties the bank's redirect back to the browser that started it. */
export const STATE_COOKIE = "drip_bank_state";
export const CALLBACK_PATH = "/api/bank/callback";
/** How long the user has to log in at their bank. */
export const AUTH_MINUTES = 30;

export function stateCookie(value: string, siteUrl: string, maxAgeSeconds = AUTH_MINUTES * 60): string {
  const secure = siteUrl.startsWith("https:") ? "; Secure" : "";
  return `${STATE_COOKIE}=${value}; Path=${CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** Two-letter country codes the user can pick from. */
export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}
