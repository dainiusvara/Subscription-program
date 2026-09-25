/**
 * Enable Banking (https://enablebanking.com): read-only access to bank
 * accounts across Europe through PSD2 open banking. Server only: requests are
 * signed with the application's private key, which must never reach a browser.
 *
 * The flow: `startAuth` gives a URL where the user logs in at their own bank.
 * The bank sends them back to our callback with a `code`, which `createSession`
 * turns into a session covering their accounts. `transactions` then reads each
 * account until the consent ends (usually after 180 days).
 */
import { createSign } from "node:crypto";

export interface EnableBankingConfig {
  appId: string;
  /** The application's private key (PEM), as downloaded from the Control Panel. */
  privateKey: string;
  apiUrl: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

/** Reads the configuration from environment variables; null when bank connections aren't set up. */
export function enableBankingConfig(env: Record<string, string | undefined> = process.env): EnableBankingConfig | null {
  const appId = env.ENABLE_BANKING_APP_ID?.trim();
  const key = env.ENABLE_BANKING_PRIVATE_KEY?.trim();
  if (!appId || !key) return null;
  return {
    appId,
    // Hosting settings often store the key on one line with "\n" written out.
    privateKey: key.replace(/\\n/g, "\n").trim(),
    apiUrl: (env.ENABLE_BANKING_API_URL ?? "https://api.enablebanking.com").replace(/\/+$/, ""),
  };
}

export interface Bank {
  name: string;
  country: string;
  logo: string | null;
  /** How long the bank lets a consent last, in seconds. */
  maxConsentSeconds: number | null;
}

export interface BankAccount {
  uid: string;
  currency: string | null;
}

export interface BankSession {
  sessionId: string;
  accounts: BankAccount[];
  bankName: string;
  bankCountry: string;
  validUntil: string | null;
}

/** A transaction as Enable Banking returns it (only the fields Drip reads). */
export interface ApiTransaction {
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  status?: string | null;
  credit_debit_indicator?: string | null;
  transaction_amount?: { currency?: string | null; amount?: string | number | null } | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
}

export class BankApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "BankApiError";
  }

  /** The consent ended, was withdrawn at the bank, or the session is gone: the user must reconnect. */
  get consentEnded(): boolean {
    return (
      this.status === 401 ||
      this.status === 403 ||
      this.status === 404 ||
      /EXPIRED|REVOKED|CLOSED|INVALID_SESSION|NOT_AUTHORIZED|UNAUTHORIZED/i.test(this.code ?? "")
    );
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** A short-lived token signed with the application's key (RS256), as the API requires. */
export function makeToken(config: Pick<EnableBankingConfig, "appId" | "privateKey" | "now">, ttlSeconds = 3600): string {
  const iat = Math.floor((config.now?.() ?? new Date()).getTime() / 1000);
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: config.appId }));
  const body = base64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + ttlSeconds }));
  const signature = createSign("RSA-SHA256").update(`${header}.${body}`).sign(config.privateKey);
  return `${header}.${body}.${base64url(signature)}`;
}

/** Stops paging through transactions after this many pages (a bank that never ends its list). */
const MAX_PAGES = 30;

export function createEnableBanking(config: EnableBankingConfig) {
  const doFetch = config.fetch ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await doFetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${makeToken(config)}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = (data ?? {}) as { error?: string; error_code?: string; message?: string; error_description?: string; detail?: unknown };
      const code = error.error_code ?? error.error ?? null;
      const message = error.error_description ?? error.message ?? `Bank provider answered ${response.status}`;
      throw new BankApiError(response.status, code, message);
    }
    return data as T;
  }

  return {
    /** Banks that offer account information for personal customers in a country. */
    async listBanks(country: string): Promise<Bank[]> {
      const data = await call<{ aspsps?: Array<Record<string, unknown>> }>(
        "GET",
        `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`,
      );
      return (data.aspsps ?? [])
        .filter((a) => typeof a.name === "string" && typeof a.country === "string")
        .map((a) => ({
          name: a.name as string,
          country: a.country as string,
          logo: typeof a.logo === "string" ? a.logo : null,
          maxConsentSeconds: typeof a.maximum_consent_validity === "number" ? a.maximum_consent_validity : null,
        }));
    },

    /** Where to send the user to log in at their bank. */
    async startAuth(options: { bank: string; country: string; state: string; redirectUrl: string; validUntil: Date }): Promise<string> {
      const data = await call<{ url?: string }>("POST", "/auth", {
        access: { valid_until: options.validUntil.toISOString() },
        aspsp: { name: options.bank, country: options.country },
        state: options.state,
        redirect_url: options.redirectUrl,
        psu_type: "personal",
      });
      if (!data.url) throw new BankApiError(502, null, "The bank provider didn't return a login address");
      return data.url;
    },

    /** Finishes the login with the code the bank sent back. */
    async createSession(code: string): Promise<BankSession> {
      const data = await call<{
        session_id?: string;
        accounts?: Array<{ uid?: string; currency?: string | null }>;
        aspsp?: { name?: string; country?: string };
        access?: { valid_until?: string };
      }>("POST", "/sessions", { code });
      if (!data.session_id) throw new BankApiError(502, null, "The bank provider didn't return a session");
      return {
        sessionId: data.session_id,
        accounts: (data.accounts ?? [])
          .filter((a): a is { uid: string; currency?: string | null } => typeof a.uid === "string")
          .map((a) => ({ uid: a.uid, currency: a.currency ?? null })),
        bankName: data.aspsp?.name ?? "",
        bankCountry: data.aspsp?.country ?? "",
        validUntil: data.access?.valid_until ?? null,
      };
    },

    /** Ends the consent at the bank. */
    async deleteSession(sessionId: string): Promise<void> {
      await call("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
    },

    /** Every transaction on the account from `dateFrom` (YYYY-MM-DD) on, all pages. */
    async transactions(accountId: string, dateFrom: string): Promise<ApiTransaction[]> {
      const all: ApiTransaction[] = [];
      let continuation: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({ date_from: dateFrom });
        if (continuation) query.set("continuation_key", continuation);
        const data: { transactions?: ApiTransaction[]; continuation_key?: string | null } = await call(
          "GET",
          `/accounts/${encodeURIComponent(accountId)}/transactions?${query}`,
        );
        all.push(...(data.transactions ?? []));
        continuation = data.continuation_key ?? null;
        if (!continuation) break;
      }
      return all;
    },
  };
}

export type BankApi = ReturnType<typeof createEnableBanking>;
