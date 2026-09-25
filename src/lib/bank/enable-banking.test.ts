import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BankApiError, createEnableBanking, enableBankingConfig, makeToken } from "./enable-banking";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = new Date("2026-09-25T10:00:00Z");

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("configuration", () => {
  it("is off without an app id and key", () => {
    expect(enableBankingConfig({})).toBeNull();
    expect(enableBankingConfig({ ENABLE_BANKING_APP_ID: APP_ID })).toBeNull();
  });

  it("accepts a key pasted on one line with \\n written out", () => {
    const oneLine = privateKey.replace(/\n/g, "\\n");
    const config = enableBankingConfig({ ENABLE_BANKING_APP_ID: APP_ID, ENABLE_BANKING_PRIVATE_KEY: oneLine });
    expect(config?.privateKey).toBe(privateKey.trim());
    expect(config?.apiUrl).toBe("https://api.enablebanking.com");
  });
});

describe("request signing", () => {
  it("makes an RS256 token the API accepts: kid, issuer, audience, at most 24 hours", () => {
    const token = makeToken({ appId: APP_ID, privateKey, now: () => NOW });
    const [header, body, signature] = token.split(".");
    expect(decode(header)).toEqual({ typ: "JWT", alg: "RS256", kid: APP_ID });
    const claims = decode(body);
    expect(claims).toMatchObject({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: NOW.getTime() / 1000 });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(86_400);
    const valid = createVerify("RSA-SHA256").update(`${header}.${body}`).verify(publicKey, Buffer.from(signature, "base64url"));
    expect(valid).toBe(true);
  });
});

/** A fake API: answers from a table of "METHOD path" → response, and records calls. */
function fakeApi(routes: Record<string, (body: unknown) => { status?: number; json: unknown }>) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const path = url.pathname + url.search;
    calls.push({ method, path, body, auth: new Headers(init?.headers).get("authorization") });
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    const { status = 200, json } = route(body);
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  const api = createEnableBanking({ appId: APP_ID, privateKey, apiUrl: "https://eb.test", fetch: fetchImpl, now: () => NOW });
  return { api, calls };
}

describe("API calls", () => {
  it("lists personal banks with logos and consent limits", async () => {
    const { api, calls } = fakeApi({
      "GET /aspsps": () => ({
        json: {
          aspsps: [
            { name: "Swedbank", country: "LT", logo: "https://logo/swed.png", maximum_consent_validity: 15552000 },
            { name: "Citadele", country: "LT" },
            { country: "LT" },
          ],
        },
      }),
    });
    expect(await api.listBanks("LT")).toEqual([
      { name: "Swedbank", country: "LT", logo: "https://logo/swed.png", maxConsentSeconds: 15552000 },
      { name: "Citadele", country: "LT", logo: null, maxConsentSeconds: null },
    ]);
    expect(calls[0].path).toBe("/aspsps?country=LT&psu_type=personal&service=AIS");
    expect(calls[0].auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("starts a login with the bank, state and return address", async () => {
    const { api, calls } = fakeApi({ "POST /auth": () => ({ json: { url: "https://bank.test/login?x=1" } }) });
    const url = await api.startAuth({
      bank: "Swedbank",
      country: "LT",
      state: "abc",
      redirectUrl: "https://drip.test/api/bank/callback",
      validUntil: new Date("2027-03-24T10:00:00Z"),
    });
    expect(url).toBe("https://bank.test/login?x=1");
    expect(calls[0].body).toEqual({
      access: { valid_until: "2027-03-24T10:00:00.000Z" },
      aspsp: { name: "Swedbank", country: "LT" },
      state: "abc",
      redirect_url: "https://drip.test/api/bank/callback",
      psu_type: "personal",
    });
  });

  it("turns the code into a session with its accounts", async () => {
    const { api } = fakeApi({
      "POST /sessions": () => ({
        json: {
          session_id: "sess-1",
          accounts: [{ uid: "acc-1", currency: "EUR" }, { uid: "acc-2" }, { name: "no uid" }],
          aspsp: { name: "Swedbank", country: "LT" },
          access: { valid_until: "2027-03-24T10:00:00Z" },
        },
      }),
    });
    expect(await api.createSession("code-1")).toEqual({
      sessionId: "sess-1",
      accounts: [
        { uid: "acc-1", currency: "EUR" },
        { uid: "acc-2", currency: null },
      ],
      bankName: "Swedbank",
      bankCountry: "LT",
      validUntil: "2027-03-24T10:00:00Z",
    });
  });

  it("follows continuation keys through every page of transactions", async () => {
    const { api, calls } = fakeApi({
      "GET /accounts/acc-1/transactions?date_from=2026-06-01": () => ({
        json: { transactions: [{ booking_date: "2026-06-02" }], continuation_key: "k2" },
      }),
      "GET /accounts/acc-1/transactions?date_from=2026-06-01&continuation_key=k2": () => ({
        json: { transactions: [{ booking_date: "2026-07-02" }], continuation_key: null },
      }),
    });
    const all = await api.transactions("acc-1", "2026-06-01");
    expect(all.map((t) => t.booking_date)).toEqual(["2026-06-02", "2026-07-02"]);
    expect(calls).toHaveLength(2);
  });

  it("reports errors, and knows when the consent has ended", async () => {
    const { api } = fakeApi({
      "GET /accounts/gone/transactions": () => ({
        status: 401,
        json: { error_code: "EXPIRED_SESSION", error_description: "Session expired" },
      }),
      "GET /accounts/busy/transactions": () => ({ status: 429, json: { error: "ASPSP_RATE_LIMIT_EXCEEDED" } }),
    });
    const expired = await api.transactions("gone", "2026-06-01").catch((e) => e);
    expect(expired).toBeInstanceOf(BankApiError);
    expect(expired.consentEnded).toBe(true);
    expect(expired.message).toBe("Session expired");
    const busy = await api.transactions("busy", "2026-06-01").catch((e) => e);
    expect(busy.consentEnded).toBe(false);
    expect(busy.status).toBe(429);
  });
});
