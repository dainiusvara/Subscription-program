# Drip — subscription tracker (project brief for Claude Code)

@AGENTS.md

## What it is
Drip tracks every subscription a person pays for (Netflix, Spotify, gym, game passes, apps),
shows the real monthly/yearly total, warns before each charge, and flags ones they no longer use.
Why people pay: it saves more money than it costs. One forgotten charge caught = Pro paid for.

## Current state
**Step 1 is done.** The prototype is rebuilt as a Next.js 16 + TypeScript + Tailwind v4 app, installable as a PWA.
Data is still stored on the device (localStorage). There are no accounts, payments or reminders yet.

Features, all matching `prototype/index.html`:
- Monthly / yearly totals, next-30-days charge chart, upcoming list (first 5 charges)
- Add / edit / delete (delete needs a second tap), quick-pick presets, free-trial tracking
- "Mark unused" -> "You could save / yr" figure
- Free plan limited to 5 subscriptions, Pro upsell modal with a "Pro preview" toggle (no real payments)
- Example subscriptions on first visit, currency switch (€ / $ / £), light + dark themes

Added in step 1:
- PWA: manifest, icons (incl. maskable + Apple), service worker (`public/sw.js`) so it opens offline.
  Chrome reports no installability errors.
  Own "Install" button (Chrome/Edge/Android prompt; iOS shows Share → Add to Home Screen steps)
- Theme toggle (device / light / dark), applied before first paint; browser bar colour follows it
- Phone polish: 16px inputs (no iOS zoom), bigger tap targets, row actions on their own line,
  floating "Add" button that jumps to the form, safe-area padding, no sideways scroll at 320px
- Prices accept "9,99" (EU keyboards). Adding past the Free limit and then turning on Pro preview finishes the add
- Data from another tab syncs live; dates roll forward when the app is left open past midnight
- Security headers (`next.config.ts`), validated storage, `error.tsx` / `not-found.tsx`
- CI on GitHub Actions: lint, typecheck, tests, build (`.github/workflows/ci.yml`)

Prototype bugs fixed (the money math is otherwise unchanged and checked against the prototype's own output):
- Monthly dates on the 29th–31st skipped months (Jan 31 + 1 month = Mar 3). Now Jan 31 → Feb 28 → Mar 31
  using `billingDay`
- The Pro modal, example bar and Pro card ignored `hidden` (CSS `display` overrode it): the modal showed on
  every load and couldn't be closed

## Business model
- Free: up to 5 subscriptions, in-app view only
- Pro: €2.99/month or €24/year — unlimited, reminders, bank auto-detect, cancel guides, family sharing

## Roadmap (build in this order)
1. ~~Turn the prototype into a real app: Next.js (or Vite + React) + TypeScript, installable PWA~~ **Done**
2. Accounts + cloud database (Supabase: auth + Postgres), migrate localStorage data on first login  ← **next**
3. Reminders: email (Resend) and web push 3 days before each charge and before trials end
4. Payments: Stripe Checkout + Customer Portal, webhook sets `is_pro` on the user
5. Cancel guides: a table of services with step-by-step cancel instructions + links
6. Bank auto-detect: Plaid / GoCardless (EU) to find recurring charges — do this last, it needs compliance work
7. Family sharing: shared lists, split cost per person
8. Mobile apps later via Capacitor or React Native

## Rules
- Keep the look: teal accent, Bricolage Grotesque (display), Figtree (body), JetBrains Mono (numbers), light + dark themes
- Money math: monthly equivalent = weekly*52/12, quarterly/3, yearly/12
- Never store card or bank numbers ourselves; let Stripe / the bank provider hold them
- Write tests for the date roll-forward and totals logic
- Secrets go in `.env.local` (git-ignored), never in code. Keep `.env.example` listing every variable
- The owner develops on Windows: keep npm scripts cross-platform and give Windows commands (see README.md)
- Explain any new account (Supabase, Stripe, Resend…) with step-by-step setup instructions

## How the code is organised
- `src/lib/billing.ts` — all money and date logic, pure functions: `monthlyEquivalent`, `summarize`,
  `upcomingCharges`, `dailyTotals`, `rollForward`, `nextCycleDate`, `formatMoney`, `parsePrice`.
  Dates are `YYYY-MM-DD` strings in the user's local calendar; arithmetic is in whole days (no time zone / DST bugs)
- `src/lib/state.ts` — state transitions (add / update / delete / toggle / Free limit / examples), pure
- `src/lib/storage.ts` — load + validate + save localStorage (key `drip:state`); bad entries are repaired or dropped
- `src/lib/store.ts` — browser store (`useDrip()` via `useSyncExternalStore`, `dripActions`). Renders a loading
  skeleton on the server, real data after hydration (no hydration mismatches)
- `src/lib/types.ts` — `Subscription`, `DripState`. Field names are the planned DB columns
- `src/components/` — `Dashboard` owns UI state and wires the pieces together
- Tests: `src/lib/*.test.ts` (Vitest). Run `npm run check` before committing
- Theme tokens: CSS variables in `src/app/globals.css`, exposed to Tailwind as `bg-surface`, `text-muted`, `bg-accent`…
- Fonts are self-hosted by `next/font` (no Google requests from users' browsers)

## Next up: step 2 (Supabase accounts + database)
Owner needs to: create a Supabase project (Claude gives step-by-step instructions) and put its URL and keys in `.env.local`.

Plan:
1. `subscriptions` table mirroring `Subscription` (uuid id, user_id → auth.users, name, price numeric(10,2),
   price_after_trial, cycle, next_charge date, billing_day, category, color, used, trial) with row-level
   security `user_id = auth.uid()`. `profiles` table with `currency`, `is_pro` (set only by the Stripe webhook later)
2. Auth: email magic link (+ optionally Google). The app stays usable signed out (local mode, current behaviour)
3. On first sign-in, upload the local `drip:state` subscriptions (skip if `example` is true), then clear local data
4. Swap `store.ts` persistence for Supabase while keeping `state.ts` transitions and `billing.ts` unchanged.
   Keep offline reads working (cache the last list locally)
5. Rolling dates forward stays client-side for display; reminders (step 3) compute from `next_charge` + `cycle` + `billing_day`
