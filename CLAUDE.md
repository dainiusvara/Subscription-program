# Drip — subscription tracker (project brief for Claude Code)

## What it is
Drip tracks every subscription a person pays for (Netflix, Spotify, gym, game passes, apps),
shows the real monthly/yearly total, warns before each charge, and flags ones they no longer use.
Why people pay: it saves more money than it costs. One forgotten charge caught = Pro paid for.

## Current state
`index.html` is a working single-file prototype (HTML/CSS/vanilla JS, data in localStorage):
- Monthly / yearly totals, next-30-days charge strip, upcoming list
- Add / edit / delete subscriptions, quick-pick presets, free-trial tracking
- "Mark unused" -> "You could save / yr" figure
- Free plan limited to 5 subscriptions, Pro upsell modal with a "Pro preview" toggle (no real payments)

## Business model
- Free: up to 5 subscriptions, in-app view only
- Pro: €2.99/month or €24/year — unlimited, reminders, bank auto-detect, cancel guides, family sharing

## Roadmap (build in this order)
1. Turn the prototype into a real app: Next.js (or Vite + React) + TypeScript, installable PWA
2. Accounts + cloud database (Supabase: auth + Postgres), migrate localStorage data on first login
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
