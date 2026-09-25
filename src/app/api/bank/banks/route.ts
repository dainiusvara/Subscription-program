import { isCountryCode, bankConfigured, getBankApi } from "@/lib/bank/server";
import type { Bank } from "@/lib/bank/enable-banking";
import { getUserFromRequest, json } from "@/lib/supabase/server";

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; banks: Bank[] }>();

/** The banks a user can connect in a country: GET /api/bank/banks?country=LT */
export async function GET(request: Request) {
  if (!bankConfigured()) return json({ error: "Bank connections aren't set up yet." }, 503);
  if (!(await getUserFromRequest(request))) return json({ error: "Sign in first." }, 401);
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase();
  if (!isCountryCode(country)) return json({ error: "Expected ?country=XX." }, 400);

  const hit = cache.get(country);
  if (hit && Date.now() - hit.at < CACHE_MS) return json({ banks: hit.banks });
  try {
    const banks = (await getBankApi().listBanks(country)).sort((a, b) => a.name.localeCompare(b.name));
    cache.set(country, { at: Date.now(), banks });
    return json({ banks });
  } catch (error) {
    console.error("Listing banks failed", error);
    return json({ error: "Couldn't load the list of banks. Try again in a minute." }, 502);
  }
}
