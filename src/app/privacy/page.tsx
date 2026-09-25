import type { Metadata } from "next";
import { ContactEmail, LegalPage, Owner } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy policy · Drip",
  description: "What Drip stores, why, who helps us run it, and how to delete everything.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Drip is run by <Owner />, who decides what happens with your data (the &ldquo;controller&rdquo;). Questions or
        requests: <ContactEmail />.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>No ads, no selling or sharing your data for marketing, and no tracking cookies.</li>
        <li>Without an account, everything you enter stays in your browser. We never receive it.</li>
        <li>With an account, we store only what Drip needs to sync your subscriptions and remind you.</li>
        <li>You can delete your account in the app at any time, and your data goes with it.</li>
      </ul>

      <h2>What we store and why</h2>
      <ul>
        <li>
          <b>Using Drip without an account:</b> your subscriptions and settings are saved in your browser&apos;s
          storage on your device only.
        </li>
        <li>
          <b>Your account:</b> your email address, to send you sign-in codes and reminders. There are no passwords.
        </li>
        <li>
          <b>Your subscriptions and settings:</b> names, prices, billing cycles, next charge dates, categories, free
          trials, what you marked as unused or cancelled, your currency and your plan, so they sync across your
          devices.
        </li>
        <li>
          <b>Reminders:</b> which reminders we already sent, so you get each one once. If you turn on phone
          notifications, we store the notification address your browser gives us for that device.
        </li>
        <li>
          <b>Family sharing:</b> the family&apos;s name and invite code, who is in it, and the subscriptions you
          share. Members of a family can see each other&apos;s email address and shared subscriptions.
        </li>
        <li>
          <b>Bank connections (optional):</b> when you connect a bank, you log in on your bank&apos;s own site and
          give Drip read-only access through Enable Banking for up to 180 days. Drip reads your accounts and recent
          transactions only to find subscriptions, and doesn&apos;t keep the transactions. We store the bank&apos;s
          name, the connection&apos;s status and end date, the account references needed to read it, and which
          merchants we already handled. Disconnecting ends the access at your bank too.
        </li>
        <li>
          <b>Bank statement files:</b> if you import a statement (CSV), it&apos;s read on your device and never
          uploaded.
        </li>
        <li>
          <b>Payments:</b> Stripe handles Pro payments. We never see or store your card number. We store whether
          you&apos;re on Pro and your customer reference at Stripe.
        </li>
        <li>
          <b>Visitor statistics:</b> Vercel Web Analytics counts page views and where visits come from, without
          cookies and without building a profile of you.
        </li>
        <li>
          <b>Technical logs:</b> our hosting and database keep short-lived logs (such as IP address and browser) to
          run the service and keep it secure.
        </li>
      </ul>

      <h2>Legal basis</h2>
      <p>
        We process your data to provide the service you signed up for (performance of a contract), to keep it secure
        and count visits anonymously (our legitimate interests), and, for phone notifications and bank connections,
        because you chose to turn them on (consent). You can withdraw consent at any time by turning notifications
        off or disconnecting your bank.
      </p>

      <h2>Who helps us run Drip</h2>
      <p>These companies process data for us, only to provide their part of the service:</p>
      <ul>
        <li>Supabase: database and sign-in. Your account data is stored in London, United Kingdom.</li>
        <li>Resend: sends sign-in codes and reminder emails, from the European Union (Ireland).</li>
        <li>Vercel: hosts the website and counts visits.</li>
        <li>Stripe: takes payments for Pro.</li>
        <li>Enable Banking: bank connections, only if you connect a bank.</li>
      </ul>
      <p>
        Where data leaves the European Economic Area, the transfer relies on an adequacy decision (such as the one
        for the United Kingdom) or on the European Commission&apos;s standard contractual clauses.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data until you delete your account. Deleting it (Account, then Delete account) removes your
        profile, subscriptions, reminder history, notification addresses, family memberships and bank connections.
        Stripe keeps payment records for as long as tax law requires. Technical logs expire on their own.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, have it corrected or deleted, take it elsewhere, or object to or limit
        how we use it. Write to <ContactEmail /> and we&apos;ll answer within a month. You can also complain to the
        data protection authority where you live.
      </p>

      <h2>Cookies and your browser&apos;s storage</h2>
      <p>
        Drip doesn&apos;t use tracking or advertising cookies. It saves your data and, if you sign in, your session in
        your browser&apos;s storage, because the app needs that to work, including offline.
      </p>

      <h2>Children</h2>
      <p>Drip isn&apos;t meant for children under 16.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we&apos;ll update this page and its date. For important changes, we&apos;ll also
        email you if you have an account.
      </p>
    </LegalPage>
  );
}
