# Drip

Drip tracks every subscription you pay for, shows the real monthly and yearly total, warns
before each charge and flags the ones you no longer use. It is an installable web app (PWA)
built with Next.js, TypeScript and Tailwind CSS, with Supabase (accounts and database),
Resend and Web Push (reminders), Stripe (payments) and Enable Banking (bank connections).

- **Live:** <https://drip-subs.vercel.app> (device-only for now: accounts, reminders and payments come online as the DEPLOY.md steps are done).
- **To put it online:** follow [DEPLOY.md](DEPLOY.md), which covers every account step by step.
- **Product brief, roadmap and status:** [CLAUDE.md](CLAUDE.md).

## What it does

- Monthly and yearly totals, a 30-day chart of upcoming charges, free-trial tracking, and "mark
  unused" savings
- Works on the device without an account; sign in with an emailed code to sync across devices
- Reminders by email and phone notification 3 days before each charge (Pro)
- Pro at €2.99/month or €24/year through Stripe; the Free plan covers 5 subscriptions
- A **Cancel it** button on every subscription: opens the service's own cancel page, then
  "Did you cancel it?" moves it to Cancelled and shows what you're saving per year
- Step-by-step cancel guides for 22 popular services (Pro)
- **Connect your bank** (Pro): Drip finds every subscription and adds new ones the day after
  they're charged. Read-only open banking; the bank login happens on the bank's own site
- Or find subscriptions in a bank statement export (CSV), read on the device only (Pro)
- Family sharing: share subscriptions and split the cost (Pro to create a family, free to join)
- Installs on phones and computers and works offline

## Run it on Windows

### One-time setup

1. Install **Node.js 24 LTS** from <https://nodejs.org> (the big "LTS" button). Keep the default options.
2. Install **Git for Windows** from <https://git-scm.com/download/win>. Keep the default options.
3. Open **Command Prompt** (press Start, type `cmd`, press Enter) and run:

   ```bat
   git clone https://github.com/dainiusvara/Subscription-program.git
   cd Subscription-program
   npm install
   ```

> **Using PowerShell instead?** If you see *"running scripts is disabled on this system"*, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, answer `Y`, and try again.
> Command Prompt doesn't have this problem.

### Start the app

```bat
npm run dev
```

Open <http://localhost:3000>. The page updates as you edit the code. Press `Ctrl+C` to stop.

Without any settings it runs in device-only mode (no accounts). To try accounts, reminders
and payments locally, see "Running it all on your PC" at the end of [DEPLOY.md](DEPLOY.md).

### Try the installable app (production build)

The offline support and the install button only work in a production build:

```bat
npm run build
npm start
```

Open <http://localhost:3000> in Chrome or Edge. Click the install icon at the right end of the
address bar, or Drip's own **Install** button in the header.

### Open it on your phone

1. Run `npm run build` and then `npm start` on your PC.
2. Run `ipconfig` and note the **IPv4 Address** of your Wi-Fi adapter, for example `192.168.1.23`.
3. With your phone on the same Wi-Fi, open `http://192.168.1.23:3000`.
   If Windows Firewall asks, allow Node.js on **private networks**.

Browsers only allow installing and offline use over HTTPS (or on `localhost`), so over your
home network the phone shows the app but can't install it. Once it's deployed (DEPLOY.md), it
installs on any phone.

## Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Development server with live reload                 |
| `npm run build`      | Production build                                    |
| `npm start`          | Serve the production build                          |
| `npm test`           | Unit tests (money, dates, sync, reminders, bank files, splitting) |
| `npm run test:watch` | Tests that re-run when you save                     |
| `npm run test:db`    | Database tests against a local Supabase (needs Docker) |
| `npm run lint`       | ESLint                                              |
| `npm run typecheck`  | TypeScript type check                               |
| `npm run check`      | Lint, typecheck and tests in one go                 |
| `npm run db:start`   | Start a local Supabase (needs Docker)               |
| `npm run db:reset`   | Rebuild the local database from the migrations     |
| `npm run db:types`   | Regenerate TypeScript types from the database       |
| `npm run stripe:setup` | Create Drip Pro's prices and webhook in Stripe (DEPLOY.md, step 5) |

## Environment variables

Keys go in your hosting's settings, or in a `.env.local` file in the project folder, which git
ignores. Never put them in the code. [`.env.example`](.env.example) lists every variable and
[DEPLOY.md](DEPLOY.md) says where each comes from.

## Project layout

```
src/
  app/                   Next.js App Router: page, manifest, icons, error pages
    api/                 Server routes: account, pro-preview, stripe/*, bank/*, cron/*, push/test
  components/            React components (Dashboard ties them together)
  lib/
    billing.ts           Money and date logic: totals, 30-day projection, roll-forward, formatting
    state.ts             Add / edit / delete / Free-limit rules as pure functions
    storage.ts           Loading and validating saved data from localStorage
    store.ts             The browser store: device-only or signed in, offline outbox, actions
    cloud.ts, sync.ts    Mapping to database rows, and sending/receiving changes
    reminders.ts         Which reminders are due and their text; reminder-job.ts sends them
    bank-sync.ts         Reads connected banks and adds the subscriptions found
    payments.ts          Stripe checkout, portal and webhook handling
    cancel-guides.ts     The cancel guides and name matching
    bank/                Bank statement CSVs, detecting subscriptions, the Enable Banking client
    family.ts, split.ts  Family sharing and cost splitting
    *.test.ts            Unit tests;  *.db.test.ts  database tests
supabase/
  migrations/            Database tables, security rules and functions (applied in order)
  templates/             The sign-in code email
scripts/stripe-setup.mjs One-time Stripe setup
public/
  sw.js                  Service worker (offline, notifications)
  icons/, screenshots/   App icons and store screenshots
prototype/index.html     The original single-file prototype, kept for reference
```
