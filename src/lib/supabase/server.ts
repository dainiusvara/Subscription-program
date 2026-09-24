/**
 * Server-only Supabase access with the secret key. Never import this from a
 * client component: the secret key bypasses row-level security.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../config";
import type { Database } from "./database.types";

let admin: SupabaseClient<Database> | null = null;

export function serverConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function getAdmin(): SupabaseClient<Database> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secret) throw new Error("Supabase isn't configured on the server");
  admin ??= createClient<Database>(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** The user behind the request's `Authorization: Bearer <token>` header, or null. */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !serverConfigured()) return null;
  const { data, error } = await getAdmin().auth.getUser(token);
  return error ? null : data.user;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
