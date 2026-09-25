/**
 * Feature switches read from environment variables at build time.
 * Without them the app runs in local-only mode, exactly like step 1.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Accounts and cloud sync are available. */
export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Real payments are live, so the free Pro preview is switched off. */
export const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

/** Live bank connections are set up (Enable Banking keys on the server; see DEPLOY.md). */
export const bankEnabled = process.env.NEXT_PUBLIC_BANK_ENABLED === "true";
