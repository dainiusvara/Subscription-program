# Drip

Drip tracks every subscription you pay for, shows the real monthly and yearly total, warns
before each charge and flags the ones you no longer use. It is an installable web app (PWA)
built with Next.js, TypeScript and Tailwind CSS.

See [CLAUDE.md](CLAUDE.md) for the product brief, business model, roadmap and current status.

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

   Until this work is merged into the main branch, also run
   `git checkout claude/keen-turing-htw4sm` before `npm install`.

> **Using PowerShell instead?** If you see *"running scripts is disabled on this system"*, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, answer `Y`, and try again.
> Command Prompt doesn't have this problem.

### Start the app

```bat
npm run dev
```

Open <http://localhost:3000>. The page updates as you edit the code. Press `Ctrl+C` to stop.

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
home network the phone shows the app but can't install it. To install it on a phone, deploy
it to an HTTPS host. That comes with a later roadmap step.

## Scripts

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Development server with live reload                 |
| `npm run build`      | Production build                                    |
| `npm start`          | Serve the production build                          |
| `npm test`           | Unit tests (money, dates, state, storage)           |
| `npm run test:watch` | Tests that re-run when you save                     |
| `npm run lint`       | ESLint                                              |
| `npm run typecheck`  | TypeScript type check                               |
| `npm run check`      | Lint, typecheck and tests in one go                 |

## Environment variables

Step 1 needs none: all data stays on the device. Later steps (Supabase, Resend, Stripe) need
keys. They go in a `.env.local` file in the project folder, which git ignores. Never put
them in the code. [`.env.example`](.env.example) lists what will be needed.

## Project layout

```
src/
  app/                 Next.js App Router: layout, page, manifest, icons, error pages
  components/          React components (Dashboard ties them together)
  lib/
    billing.ts         Money and date logic: totals, 30-day projection, roll-forward, formatting
    state.ts           Add / edit / delete / free-limit rules as pure functions
    storage.ts         Loading and validating saved data from localStorage
    store.ts           The browser store React reads with useDrip()
    catalog.ts         Presets, categories, currencies, Free limit, Pro price
    *.test.ts          Vitest unit tests
public/
  sw.js                Service worker (offline support)
  icons/               App icons
prototype/index.html   The original single-file prototype, kept for reference
```
