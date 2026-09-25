import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail, LegalPage, Owner } from "@/components/LegalPage";
import { FREE_LIMIT, PRO_PRICE } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Terms of use · Drip",
  description: "The rules for using Drip: accounts, the Free and Pro plans, payments, cancelling and refunds.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        These terms are the agreement between you and <Owner />, who runs Drip. By using Drip you accept them. If
        something is unclear, write to <ContactEmail />.
      </p>

      <h2>What Drip does</h2>
      <p>
        Drip helps you keep track of your subscriptions: what they cost, when they charge next, and which ones you no
        longer use. It gives you information and reminders; it isn&apos;t financial advice.
      </p>
      <ul>
        <li>
          Reminders are sent by email and phone notification, but messages can be delayed or blocked. Keep an eye on
          charges that matter to you.
        </li>
        <li>
          Drip can&apos;t cancel subscriptions for you. Cancel buttons and guides point to each service&apos;s own
          pages, which the services can change at any time.
        </li>
        <li>Prices and dates in Drip are what you or your bank statement entered, so check them against your bills.</li>
      </ul>

      <h2>Your account</h2>
      <p>
        You sign in with a code sent to your email, so keep your email account secure. One account is for one
        person. You can delete your account at any time in the app (Account, then Delete account).
      </p>

      <h2>Free and Pro</h2>
      <ul>
        <li>The Free plan covers up to {FREE_LIMIT} subscriptions.</li>
        <li>
          Pro costs €{PRO_PRICE.monthly.toFixed(2)} a month or €{PRO_PRICE.yearly} a year and adds unlimited
          subscriptions, reminders, bank connections, cancel guides and creating a family to share costs.
        </li>
        <li>While paid plans aren&apos;t available yet, Pro can be tried for free. That preview ends when they start.</li>
      </ul>

      <h2>Payments, renewal and cancelling</h2>
      <ul>
        <li>Stripe processes payments. Pro renews automatically each month or year until you cancel.</li>
        <li>
          You can cancel at any time under Account, then Manage subscription. Pro stays on until the end of the period
          you paid for, and you won&apos;t be charged again.
        </li>
        <li>
          If you&apos;re a consumer in the European Union, you can withdraw within 14 days of your first payment: write
          to <ContactEmail /> for a full refund.
        </li>
        <li>If we change prices, we&apos;ll tell you at least 30 days before the change affects your renewal.</li>
      </ul>

      <h2>Bank connections</h2>
      <p>
        Connecting a bank is optional and read-only. You log in on your bank&apos;s own site, the access lasts up to 180
        days, and you can disconnect at any time. The <Link href="/privacy">privacy policy</Link> explains what Drip
        reads and keeps.
      </p>

      <h2>Fair use</h2>
      <p>
        Don&apos;t misuse Drip: no attacking or overloading it, no automated scraping, and no using it to harm or
        spam others. We may suspend accounts that do, after warning you where possible.
      </p>

      <h2>Changes and availability</h2>
      <p>
        We keep improving Drip, so features can change. We aim to keep it running around the clock but can&apos;t
        promise it will never be down. If we change these terms in a way that matters, we&apos;ll update this page and
        tell you in advance.
      </p>

      <h2>Liability</h2>
      <p>
        Drip is provided as it is. As far as the law allows, we aren&apos;t responsible for charges you didn&apos;t
        cancel or for indirect losses. Nothing in these terms limits rights you have as a consumer that can&apos;t be
        limited by law, and the consumer protection laws of the country you live in still apply to you.
      </p>
    </LegalPage>
  );
}
