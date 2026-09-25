# Drip — subscription tracker (project brief for Claude Code)

@AGENTS.md

## What it is
Drip tracks every subscription a person pays for (Netflix, Spotify, gym, game passes, apps),
shows the real monthly/yearly total, warns before each charge, and flags ones they no longer use.
Why people pay: it saves more money than it costs. One forgotten charge caught = Pro paid for.

## Business model
- Free: up to 5 subscriptions, in-app view only
- Pro: €2.99/month or €24/year — unlimited, reminders, bank auto-detect, cancel guides, family sharing

## Roadmap status
1. **Done.** Next.js 16 + TypeScript + Tailwind v4 app, installable PWA, same look and money math as `prototype/index.html`
2. **Done.** Accounts + cloud database (Supabase). Sign in with an emailed 6-digit code; local data moves into the account on first sign-in; offline outbox sync
3. **Done.** Reminders by email (Resend) and web push, 3 days before each charge and before trials end (daily Vercel Cron job)
4. **Done.** Payments: Stripe Checkout + Customer Portal; the webhook sets `is_pro`
5. **Done.** Cancel guides for 22 services + gym/general advice, linked to official help pages (checked Sept 2026)
6. **Done.** Live bank connections through Enable Banking (open banking, read-only, 180-day consent): the app asks "Connect your bank?" after sign-in, adds every subscription it finds and new ones the day after their first charge (daily cron + "Check now"). Tested against a fake Enable Banking API; real customers need Enable Banking's production contract (DEPLOY.md §6). The CSV statement import stays as the fallback
7. **Done.** Family sharing: households with invite codes, shared subscriptions, equal split with per-person balances
8. **Prepared, not published.** PWABuilder route instead of Capacitor: manifest screenshots and shortcuts, and `/.well-known/assetlinks.json` from env. Publishing needs store accounts, plus a decision on in-app billing rules (see DEPLOY.md §7)
9. **Done.** "Cancel it" button on every subscription: opens the service's own cancel page (Netflix, Spotify, YouTube, Google Play, Microsoft 365) or help page, or copies a cancellation email (gyms). "Did you cancel it?" moves it to a Cancelled section and counts "Saving €X a year"
10. **Done.** Launch prep: link-preview image (`src/app/opengraph-image.tsx`, rendered at build time with TTFs fetched from Google Fonts) and Vercel Web Analytics (cookie-free page views; switched on in the Vercel project's Analytics tab)

**Live** at https://www.dripsubs.com (Vercel Hobby, project `drip-subs`; every push to `main` deploys). The domain was bought through Vercel: `dripsubs.com` redirects to `www`, and `drip-subs.vercel.app` still works. Accounts and reminders are set up:
- Supabase project `drip` (West Europe, London). All 6 migrations were applied through the SQL editor and recorded in `supabase_migrations.schema_migrations`, so `supabase db push` only sends newer ones. Auth: Site URL `https://www.dripsubs.com`, email OTP length 6, both sign-in templates from `supabase/templates/sign-in-code.html`
- Resend on `dripsubs.com` (Ireland): Supabase's SMTP was set by Resend's Supabase integration (sender `login@dripsubs.com`); `RESEND_API_KEY` reached Vercel through Resend's Vercel integration; reminders come from `reminders@dripsubs.com`
- Vercel has every variable except Stripe, Enable Banking and Android, so Pro stays the free preview and bank connections are off. No keys exist in the repo

Cancelling for the user inside Drip isn't possible: services have no cancellation API, and logging in as the user would mean storing their passwords. Drip opens the right page and the user presses the final button.

## Rules
- Keep the look: teal accent, Bricolage Grotesque (display), Figtree (body), JetBrains Mono (numbers), light + dark themes
- Money math: monthly equivalent = weekly*52/12, quarterly/3, yearly/12
- Never store card or bank numbers ourselves; let Stripe / the bank provider hold them. Bank CSVs are parsed in the browser and never uploaded
- Write tests for the date roll-forward and totals logic (and for every new rule)
- Secrets go in `.env.local` or the host's env settings, never in code or chat. Keep `.env.example` listing every variable
- The owner develops on Windows: keep npm scripts cross-platform and give Windows (Command Prompt) instructions
- Explain any new account with step-by-step setup instructions (DEPLOY.md)
- Rules that protect money or privacy are enforced in the database (RLS, triggers, security-definer functions), not only in the UI

## How the code is organised
- `src/lib/billing.ts`: money and date logic (pure). Dates are `YYYY-MM-DD` local calendar dates with whole-day arithmetic; `billingDay` keeps month-end dates from drifting
- `src/lib/state.ts`: state transitions (add/update/delete, Free limit via `hasPro`). `src/lib/storage.ts`: validated localStorage
- `src/lib/store.ts`: the browser store (`useDrip()`, `dripActions`, `dripAuth`, `familyActions`). Two modes:
  device-only (`drip:state`) and signed in (`drip:cloud` cache + outbox of unsent ops). Toasts come from `notify()`
- `src/lib/cloud.ts` (row mapping, diff, outbox; pure), `src/lib/sync.ts` (push/pull with supabase-js)
- `src/lib/reminders.ts` (due reminders + message text; pure), `src/lib/reminder-job.ts` (daily job with injectable senders), `src/lib/senders.ts` (Resend, web-push)
- `src/lib/payments.ts`: Stripe; `handleStripeEvent` applies subscription events newest-first (`stripe_event_at`) and sets `payments_live` on any event, test or live (so never point Stripe test mode at production). `checkoutSessionParams` adds `managed_payments` when `STRIPE_MANAGED_PAYMENTS=true` (Stripe as merchant of record handles VAT); the setup script gives the product tax code `txcd_10103000` and VAT-inclusive prices
- `src/lib/cancel-guides.ts`: guide data, name matching, direct `cancelUrl`s (only where the service's own help page links to it) and the cancellation email
- `src/lib/bank/`: CSV parsing (`statement.ts`), detection (`detect.ts`; `newServices` lets one recent charge of a subscription-only service count), Enable Banking client (`enable-banking.ts`, RS256-signed requests, server only), feed mapping and sync plan (`live.ts`, pure), `server.ts` (config, state cookie)
- `src/lib/bank-sync.ts`: syncs a connection (claims each merchant in `bank_detections` first, so nothing is added twice or re-added after the user deletes it) and the daily run with notifications
- Cancelled subscriptions keep `cancelledOn` (`cancelled_on` column): `billing.ts` leaves them out of totals, charges and reminders and counts them in `saved`; they don't count towards the Free limit (also in SQL) and can't stay shared
- `src/lib/family.ts` (RPC calls) and `src/lib/split.ts` (equal split, balances; pure)
- API routes in `src/app/api/`: `account` (delete), `pro-preview`, `stripe/{checkout,portal,webhook}`, `bank/{banks,connect,callback,sync,disconnect}`, `cron/{bank,reminders}` (Bearer `CRON_SECRET`), `push/test`, `assetlinks`. Routes authenticate with `Authorization: Bearer <supabase access token>`; `bank/callback` is a browser redirect and checks the `state` against an HttpOnly cookie set by `bank/connect`
- `supabase/migrations/`: 6 migrations (accounts, reminders, payments, family, cancellations, bank). Plan fields are server-only; the Free limit, pro preview and family rules live in SQL. `bank_connections` is readable by its owner through column grants only (never `session_id` or `auth_state`); nobody but the server writes the bank tables
- `src/components/Dashboard.tsx` owns UI state; `Modal.tsx` wraps `<dialog>` and only reports user-initiated closes
- `src/app/privacy`, `src/app/terms`: the legal pages (`LegalPage.tsx`). Who runs Drip comes from `LEGAL_OWNER_NAME` / `LEGAL_CONTACT_EMAIL` via `src/lib/legal.ts`, never the code (the repo is public); bump `LEGAL.updated` when either page changes
- Feature switches (`src/lib/config.ts`): no Supabase env means device-only mode; `NEXT_PUBLIC_PAYMENTS_ENABLED=true` swaps the Pro preview for Stripe. The first Stripe webhook event also sets `app_config.payments_live`, which ends the preview in the database. `NEXT_PUBLIC_BANK_ENABLED=true` (plus `ENABLE_BANKING_APP_ID` / `ENABLE_BANKING_PRIVATE_KEY` on the server) shows "Connect your bank"

## Testing
- `npm run check`: lint, typecheck, unit tests (Vitest). `npm run test:db`: RLS/limits/sync/reminders/payments/family against a local Supabase (`npx supabase start`, Docker). CI runs both
- End-to-end runs are done with Playwright against `npm start` + local Supabase + stripe-mock + a fake Resend + a fake Enable Banking API (checks the RS256 tokens, serves a test login page and a transaction feed). They're not in the repo yet; adding them to CI is a good next task
- Local Supabase keys come from `npx supabase status -o env`; `.env.local` points the app at it

## Next steps
1. Owner: Stripe test mode, then Enable Banking sandbox, then live (DEPLOY.md §5–6). Vercel, the domain, Supabase and Resend are done
2. Keep `/privacy` and `/terms` true as features change (they name Supabase in London, Resend in Ireland, Vercel, Stripe and Enable Banking). A lawyer's read is worth it before paid launch
3. Commit the Playwright end-to-end suites (and the fake Enable Banking server) and run them in CI
4. Bank: warn when a cancelled subscription charges again; update prices when the bank shows a new amount; remind before the 180-day consent ends
5. Store apps via PWABuilder; decide how Pro is sold inside store apps (Play Billing / Apple IAP rules)
6. Nice to have: custom split shares per family member, reminder timing setting (1/3/7 days), more cancel guides and direct cancel pages (re-check links yearly)
