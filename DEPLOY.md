# Launching Drip

This guide takes Drip from your computer to a live website with accounts, reminders and
payments. Do the steps in order; each one says exactly where every key goes.

**Where keys go:** into your hosting's settings (Vercel → Settings → Environment Variables),
or into a file called `.env.local` in the project folder on your PC. Never into the code, and
never into a chat. `.env.example` lists them all.

**Time:** about 1–2 hours the first time. **Commands** are for Command Prompt on Windows, run
inside the project folder (`cd Subscription-program`).

| Step | Service | What it does for Drip | Cost at the time of writing |
| ---- | ------- | --------------------- | --------------------------- |
| 1 | A domain name | Your address, e.g. `dripapp.eu`; needed to send email | ~€10 / year |
| 2 | Supabase | Accounts, sign-in codes and the database | Free to start; Pro $25/month for a real launch (free projects pause after a week without visitors) |
| 3 | Resend | Sends reminder and sign-in emails | Free up to 3,000 emails/month |
| 4 | Vercel | Hosts the website and runs the daily reminders | Hobby is free but for non-commercial use; Pro $20/month once you charge money |
| 5 | Stripe | Takes payments for Pro | No monthly fee; a small cut of each payment |
| 6 | Google Play / Apple | Optional store apps | $25 once / $99 per year |

Check each service's pricing page before you rely on these numbers.

---

## 1. A domain name

Email providers only deliver mail from domains you own. Buy one from a registrar such as
Cloudflare, Namecheap or Vercel (Vercel → Domains → Buy). Keep the registrar's login handy:
steps 3 and 4 ask you to add DNS records there.

## 2. Supabase: accounts and database

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**: name `drip`, set a strong **database password** (save it in a password
   manager), and pick an EU region (e.g. Frankfurt) for European users. Create it.
3. Find your keys under **Project Settings → API Keys** and the URL under **Project Settings →
   Data API** (it looks like `https://abcdefgh.supabase.co`; `abcdefgh` is your *project ref*).
   Keep this tab open:
   - `NEXT_PUBLIC_SUPABASE_URL` = the URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the **publishable** key (`sb_publishable_…`)
   - `SUPABASE_SECRET_KEY` = the **secret** key (`sb_secret_…`). Only ever put this in Vercel or
     `.env.local`: it can read everyone's data.
4. Create Drip's tables. In Command Prompt:
   ```bat
   npx supabase login
   npx supabase link --project-ref abcdefgh
   npx supabase db push
   ```
   `login` opens your browser; `link` asks for the database password from step 2.
   *No command line?* In Supabase open **SQL Editor**, then paste and **Run** each file from the
   `supabase/migrations` folder, oldest first.
5. Make sign-in emails carry the 6-digit code: **Authentication → Emails → Templates**. For both
   **Magic link** and **Confirm signup**, set the subject to `Your Drip sign-in code` and replace
   the body with the contents of `supabase/templates/sign-in-code.html`. Save.
6. **Authentication → URL Configuration**: set **Site URL** to your site address (you'll know it
   after step 4; `https://your-domain` or `https://your-project.vercel.app`).
7. After step 3, connect email sending: **Authentication → Emails → SMTP Settings** → enable
   custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, password = your Resend
   API key, sender email e.g. `login@your-domain`, sender name `Drip`. (Supabase's built-in email
   is for testing only and sends just a few messages an hour.)

## 3. Resend: emails

1. Sign up at <https://resend.com>.
2. **Domains → Add domain** → enter your domain → add the DNS records it shows at your registrar
   → wait until it says **Verified** (minutes to a few hours).
3. **API Keys → Create API key** (sending access). This is `RESEND_API_KEY`.
4. Choose the sender for reminders: `REMINDER_FROM_EMAIL` = `Drip <reminders@your-domain>`.
5. Go back to step 2.7 and set up SMTP with the same key.

## 4. Vercel: put the site online

1. Sign up at <https://vercel.com> with GitHub. If Drip will charge money, choose the **Pro**
   plan: the free Hobby plan is for non-commercial projects.
2. **Add New → Project** → **Import** `Subscription-program`. Vercel detects Next.js; don't
   change the build settings.
3. Before deploying, open **Environment Variables** and add these (the Stripe ones come in step 5):

   | Name | Value |
   | ---- | ----- |
   | `NEXT_PUBLIC_SUPABASE_URL` | from 2.3 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from 2.3 |
   | `SUPABASE_SECRET_KEY` | from 2.3 |
   | `RESEND_API_KEY` | from 3.3 |
   | `REMINDER_FROM_EMAIL` | from 3.4 |
   | `CRON_SECRET` | a long random string; make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` | run `npx web-push generate-vapid-keys` and copy the two keys |
   | `VAPID_SUBJECT` | `mailto:you@your-domain` |
   | `NEXT_PUBLIC_SITE_URL` | your site address, e.g. `https://your-domain` |

4. **Deploy**. When it finishes you get an address like `subscription-program.vercel.app`.
5. Add your domain: **Settings → Domains** → add it and follow the DNS instructions. Then make sure
   `NEXT_PUBLIC_SITE_URL` and Supabase's Site URL (2.6) use it.
6. After changing any variable: **Deployments → ⋯ → Redeploy**. Variables starting with
   `NEXT_PUBLIC_` only take effect after a redeploy.
7. Reminders run by themselves every day at 07:00 UTC (see `vercel.json`); check **Settings →
   Cron Jobs**.

**Check it works:** open the site, sign in with your email (the code should arrive within a
minute), add a subscription, and open it on your phone too: it should appear there after you sign
in. On Android, Chrome offers **Install app**; on iPhone use Share → **Add to Home Screen**.

## 5. Stripe: payments

Start in **test mode**: nothing is charged and you can try every step.

1. Sign up at <https://dashboard.stripe.com>. Keep the **Test mode** switch on (top right).
2. **Developers → API keys** → copy the **Secret key** (`sk_test_…`).
3. On your PC, create `.env.local` in the project folder (copy `.env.example`) with:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_SITE_URL=https://your-domain
   ```
   then run:
   ```bat
   npm run stripe:setup
   ```
   It creates Drip Pro (€2.99/month and €24/year), the customer billing portal, and the webhook,
   and prints `STRIPE_WEBHOOK_SECRET=whsec_…`.
4. In Vercel add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
   `NEXT_PUBLIC_PAYMENTS_ENABLED` = `true`, then **Redeploy**. The free "Pro preview" button is
   replaced by real upgrade buttons.
5. Test it: upgrade on the site and pay with card `4242 4242 4242 4242`, any future date, any CVC.
   You should come back to "Welcome to Drip Pro!". **Manage subscription** in your account opens
   Stripe's page for cancelling or switching plans.
6. **Going live:** in Stripe, **Activate your account** (business details and a bank account for
   payouts). Switch to live mode, copy the live secret key (`sk_live_…`), run
   `npm run stripe:setup` again with it, then put the live `STRIPE_SECRET_KEY` and the new
   `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.

VAT: selling to consumers in the EU usually means charging VAT. Stripe Tax can calculate it; ask
an accountant what applies to you.

## 6. Store apps (optional)

Drip already installs from the browser on phones and computers, with notifications (on iPhone
since iOS 16.4, once added to the Home Screen). Store apps add visibility, but they come with rules:

- **Payments.** Google Play and Apple generally require their own billing for digital
  subscriptions bought inside an app, with regional exceptions (for example in the EU). Before
  publishing, check the current rules and decide whether the store app sells Pro through the
  store or not at all. The web app can keep selling through Stripe.
- **Apple** may reject apps that are only a website in a frame. It helps when the app has native
  features such as notifications.

**Android (Google Play):**

1. Create a Google Play Console developer account ($25 once, with identity verification).
2. Go to <https://www.pwabuilder.com>, enter your site address, then **Package for stores →
   Android**. Download the package; keep its **signing key** file safe (you need it for every update).
3. From the package's instructions, copy the package name and the SHA-256 fingerprint into Vercel
   as `ANDROID_PACKAGE_NAME` and `ANDROID_CERT_FINGERPRINTS` (comma-separated if several), then
   redeploy. Drip then serves `/.well-known/assetlinks.json`, which lets the app open without a
   browser bar.
4. Upload the `.aab` file in Play Console and fill in the store listing. The screenshots in
   `public/screenshots` can be used there.

**iPhone (App Store):** needs the Apple Developer Program ($99/year) and a Mac with Xcode (or a
cloud Mac service). PWABuilder's **iOS** package is an Xcode project to build and submit.

## Before real users arrive

- Publish a **privacy policy** and **terms** (the app stores and GDPR require them). They should
  mention Supabase, Resend, Stripe and Vercel as the services that process data.
- Upgrade Supabase to Pro so the project never pauses, and turn on its daily backups.
- In Stripe, turn on email receipts and set your business name and support email.

## Running it all on your PC (developers)

The app runs without any of the above: `npm run dev` gives the device-only version. To run the
full stack locally you need **Docker Desktop** (<https://www.docker.com/products/docker-desktop>):

```bat
npx supabase start
```

It prints a local URL and keys; put them in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, then `npm run dev`. Sign-in
emails land in the local inbox at <http://127.0.0.1:54324>. `npm run test:db` runs the database
tests against this local copy.
