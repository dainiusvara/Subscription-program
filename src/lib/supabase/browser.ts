import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, cloudConfigured } from "../config";
import type { Database } from "./database.types";

export type DripSupabase = SupabaseClient<Database>;

let client: DripSupabase | null = null;

/** The browser's Supabase client, or null when accounts aren't configured. */
export function getSupabase(): DripSupabase | null {
  if (!cloudConfigured) return null;
  client ??= createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "drip:auth" },
  });
  return client;
}

/** Calls one of our API routes as the signed-in user. */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = getSupabase();
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}
