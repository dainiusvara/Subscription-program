import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/** Deletes the signed-in user's account. Their profile and subscriptions go with it (on delete cascade). */
export async function DELETE(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const { error } = await getAdmin().auth.admin.deleteUser(user.id);
  if (error) return json({ error: "Couldn't delete the account." }, 500);
  return json({ deleted: true });
}
