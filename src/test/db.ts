/** Helpers for tests that run against the local Supabase stack. */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const url = () => process.env.SUPABASE_LOCAL_API_URL!;
export const publishableKey = () => process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY!;
export const secretKey = () => process.env.SUPABASE_LOCAL_SECRET_KEY!;

export function adminClient() {
  return createClient<Database>(url(), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Creates a confirmed user and returns a client signed in as them. */
export async function newUser(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = "test-password-123";
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient<Database>(url(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}
