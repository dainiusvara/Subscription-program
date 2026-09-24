import { getStripe, stripeConfigured } from "@/lib/payments";
import { getAdmin, getUserFromRequest, json } from "@/lib/supabase/server";

/**
 * Deletes the signed-in user's account. Their profile and subscriptions go with
 * it (on delete cascade), and a paid Pro subscription is cancelled in Stripe.
 */
export async function DELETE(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: "Sign in first." }, 401);
  const admin = getAdmin();

  const { data: profile } = await admin.from("profiles").select("stripe_subscription_id, pro_status").eq("id", user.id).single();
  if (stripeConfigured() && profile?.stripe_subscription_id && profile.pro_status !== "canceled") {
    try {
      await getStripe().subscriptions.cancel(profile.stripe_subscription_id);
    } catch (error) {
      console.error("Couldn't cancel Stripe subscription", error);
      return json({ error: "Couldn't cancel your Pro subscription. Try again, or cancel it under Manage subscription first." }, 502);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: "Couldn't delete the account." }, 500);
  return json({ deleted: true });
}
