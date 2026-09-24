/**
 * The signed-in user's family: members, invite code and shared subscriptions.
 * Changes go through database functions that enforce the rules (Pro to create,
 * 6 people max, one family each, only the owner removes people).
 */
import { SUBSCRIPTION_COLUMNS, fromRow, type SubscriptionRow } from "./cloud";
import type { SharedSubscription } from "./split";
import type { DripSupabase } from "./supabase/browser";

export interface FamilyMember {
  userId: string;
  email: string;
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  members: FamilyMember[];
  /** All shared subscriptions in the family, yours included. */
  shared: SharedSubscription[];
}

export const MAX_FAMILY_SIZE = 6;

export type FamilyResult<T = void> = { ok: true; value: T } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  already_member: "You're already in a family. Leave it first to join another.",
  pro_required: "Creating a family is part of Drip Pro.",
  bad_code: "No family has that code. Check it and try again.",
  family_full: `That family is full (${MAX_FAMILY_SIZE} people).`,
};

function fail(error: { hint?: string; message?: string; code?: string } | null): { ok: false; message: string } {
  if (error?.hint && MESSAGES[error.hint]) return { ok: false, message: MESSAGES[error.hint] };
  if (!error?.code) return { ok: false, message: "You're offline. Connect to the internet and try again." };
  return { ok: false, message: error.message ?? "Something went wrong. Try again." };
}

/** Null when the user isn't in a family. Throws when offline. */
export async function loadFamily(supabase: DripSupabase): Promise<Family | null> {
  const { data: members, error } = await supabase.from("household_members").select("household_id, user_id, email");
  if (error) throw error;
  if (!members || members.length === 0) return null;
  const householdId = members[0].household_id;
  const [household, rows] = await Promise.all([
    supabase.from("households").select("id, name, owner_id, invite_code").eq("id", householdId).single(),
    supabase.from("subscriptions").select(SUBSCRIPTION_COLUMNS).eq("household_id", householdId),
  ]);
  if (household.error) throw household.error;
  if (rows.error) throw rows.error;
  const shared: SharedSubscription[] = [];
  for (const row of rows.data as SubscriptionRow[]) {
    const sub = fromRow(row);
    if (sub) shared.push({ ...sub, ownerId: row.user_id });
  }
  return {
    id: household.data.id,
    name: household.data.name,
    ownerId: household.data.owner_id,
    inviteCode: household.data.invite_code,
    members: members.map((m) => ({ userId: m.user_id, email: m.email })),
    shared,
  };
}

export async function createFamily(supabase: DripSupabase, name: string): Promise<FamilyResult> {
  const { error } = await supabase.rpc("create_household", { p_name: name });
  return error ? fail(error) : { ok: true, value: undefined };
}

export async function joinFamily(supabase: DripSupabase, code: string): Promise<FamilyResult> {
  const { error } = await supabase.rpc("join_household", { p_code: code });
  return error ? fail(error) : { ok: true, value: undefined };
}

export async function leaveFamily(supabase: DripSupabase): Promise<FamilyResult> {
  const { error } = await supabase.rpc("leave_household");
  return error ? fail(error) : { ok: true, value: undefined };
}

export async function removeMember(supabase: DripSupabase, userId: string): Promise<FamilyResult> {
  const { error } = await supabase.rpc("remove_household_member", { p_user: userId });
  return error ? fail(error) : { ok: true, value: undefined };
}

export async function renewInviteCode(supabase: DripSupabase): Promise<FamilyResult<string>> {
  const { data, error } = await supabase.rpc("renew_invite_code");
  return error ? fail(error) : { ok: true, value: data };
}
