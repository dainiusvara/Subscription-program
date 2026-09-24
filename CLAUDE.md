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
6. **Done (CSV version).** Subscriptions are detected from a bank statement CSV export, read in the browser only. Live bank connections (GoCardless / Plaid) still need the owner's business to be approved by a provider
7. **Done.** Family sharing: households with invite codes, shared subscriptions, equal split with per-person balances
8. **Prepared, not published.** PWABuilder route instead of Capacitor: manifest screenshots and shortcuts, and `/.well-known/assetlinks.json` from env. Publishing needs store accounts, plus a decision on in-app billing rules (see DEPLOY.md §6)

**Not live yet:** everything runs and is tested locally, but the owner still has to create the Supabase, Resend, Vercel and Stripe accounts and follow DEPLOY.md. No keys exist in the repo.

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
- `src/lib/payments.ts`: Stripe; `handleStripeEvent` applies subscription events newest-first (`stripe_event_at`)
- `src/lib/cancel-guides.ts`: guide data and name matching. `src/lib/bank/`: CSV parsing (`statement.ts`) and detection (`detect.ts`)
- `src/lib/family.ts` (RPC calls) and `src/lib/split.ts` (equal split, balances; pure)
- API routes in `src/app/api/`: `account` (delete), `pro-preview`, `stripe/{checkout,portal,webhook}`, `cron/reminders` (Bearer `CRON_SECRET`), `push/test`, `assetlinks`. Routes authenticate with `Authorization: Bearer <supabase access token>`
- `supabase/migrations/`: 4 migrations (accounts, reminders, payments, family). Plan fields are server-only; the Free limit, pro preview and family rules live in SQL
- `src/components/Dashboard.tsx` owns UI state; `Modal.tsx` wraps `<dialog>` and only reports user-initiated closes
- Feature switches (`src/lib/config.ts`): no Supabase env means device-only mode; `NEXT_PUBLIC_PAYMENTS_ENABLED=true` swaps the Pro preview for Stripe. The first Stripe webhook event also sets `app_config.payments_live`, which ends the preview in the database

## Testing
- `npm run check`: lint, typecheck, unit tests (Vitest). `npm run test:db`: RLS/limits/sync/reminders/payments/family against a local Supabase (`npx supabase start`, Docker). CI runs both
- End-to-end runs are done with Playwright against `npm start` + local Supabase + stripe-mock + a fake Resend. They're not in the repo yet; adding them to CI is a good next task
- Local Supabase keys come from `npx supabase status -o env`; `.env.local` points the app at it

## Next steps
1. Owner: follow DEPLOY.md (Supabase, Resend + domain, Vercel, Stripe test mode, then live)
2. Privacy policy and terms pages (GDPR, app stores); cookie-free analytics if wanted
3. Commit the Playwright end-to-end suites and run them in CI
4. Live bank connections via GoCardless Bank Account Data or Plaid, once the business is approved (keep CSV import as the fallback)
5. Store apps via PWABuilder; decide how Pro is sold inside store apps (Play Billing / Apple IAP rules)
6. Nice to have: custom split shares per family member, reminder timing setting (1/3/7 days), more cancel guides (re-check links yearly)
