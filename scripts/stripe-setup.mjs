// One-time Stripe setup for Drip. Safe to run again: it skips what exists.
//
//   npm run stripe:setup
//
// Reads STRIPE_SECRET_KEY and NEXT_PUBLIC_SITE_URL from .env.local. Creates:
//   - the "Drip Pro" product with a €2.99/month and a €24/year price
//   - the Customer Portal settings (switch plan, update card, cancel, invoices)
//   - the webhook endpoint at <site>/api/stripe/webhook (for a public https site)
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is missing. Put your Stripe secret key in .env.local first (see DEPLOY.md).");
  process.exit(1);
}
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
const stripe = new Stripe(key, {
  ...(process.env.STRIPE_API_HOST
    ? { host: process.env.STRIPE_API_HOST, port: Number(process.env.STRIPE_API_PORT ?? 12111), protocol: "http" }
    : {}),
});
const live = key.startsWith("sk_live_");
console.log(`Setting up Stripe in ${live ? "LIVE" : "test"} mode…`);

const PRICES = [
  { lookup_key: "drip_pro_monthly", unit_amount: 299, interval: "month", label: "€2.99 / month" },
  { lookup_key: "drip_pro_yearly", unit_amount: 2400, interval: "year", label: "€24 / year" },
];
// "Software as a service - personal use": the tax category Stripe needs to charge the right VAT,
// and one that's eligible for Managed Payments (STRIPE_MANAGED_PAYMENTS=true).
const TAX_CODE = "txcd_10103000";
// Prices include VAT, as EU consumers expect: €2.99 is what they pay.
const TAX_BEHAVIOR = "inclusive";

// Product and prices
const existing = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookup_key), active: true, expand: ["data.product"] });
let productId = existing.data[0] ? (typeof existing.data[0].product === "string" ? existing.data[0].product : existing.data[0].product.id) : null;
if (!productId) {
  const product = await stripe.products.create({
    name: "Drip Pro",
    description: "Unlimited subscriptions, reminders before every charge, cancel guides and more.",
    tax_code: TAX_CODE,
  });
  productId = product.id;
  console.log(`✓ Created product Drip Pro (${productId})`);
} else {
  console.log(`✓ Product exists (${productId})`);
  const product = await stripe.products.retrieve(productId);
  if (!product.tax_code) {
    await stripe.products.update(productId, { tax_code: TAX_CODE });
    console.log("✓ Set the product's tax code");
  }
}
const priceIds = {};
for (const price of PRICES) {
  const found = existing.data.find((p) => p.lookup_key === price.lookup_key);
  if (found) {
    priceIds[price.lookup_key] = found.id;
    console.log(`✓ Price ${price.label} exists (${found.id})`);
    // Stripe allows setting the tax behaviour once, on prices created without it.
    if (!found.tax_behavior || found.tax_behavior === "unspecified") {
      await stripe.prices.update(found.id, { tax_behavior: TAX_BEHAVIOR });
      console.log(`✓ Price ${price.label} now includes VAT`);
    }
    continue;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: price.unit_amount,
    recurring: { interval: price.interval },
    tax_behavior: TAX_BEHAVIOR,
    lookup_key: price.lookup_key,
    transfer_lookup_key: true,
  });
  priceIds[price.lookup_key] = created.id;
  console.log(`✓ Created price ${price.label} (${created.id})`);
}

// Customer Portal
const portals = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
if (portals.data.length === 0 || !portals.data[0].features.subscription_update.enabled) {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Drip Pro subscription" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [{ product: productId, prices: Object.values(priceIds) }],
      },
    },
  });
  console.log("✓ Configured the Customer Portal");
} else {
  console.log("✓ Customer Portal already configured");
}

// Webhook
if (!site.startsWith("https://")) {
  console.log("\n! NEXT_PUBLIC_SITE_URL isn't a public https address, so the webhook wasn't created.");
  console.log("  Run this again after deploying, with NEXT_PUBLIC_SITE_URL set to your site.");
} else {
  const url = `${site}/api/stripe/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  if (endpoints.data.some((e) => e.url === url)) {
    console.log(`✓ Webhook already exists for ${url}`);
    console.log("  Its signing secret is under Developers → Webhooks in the Stripe dashboard.");
  } else {
    const endpoint = await stripe.webhookEndpoints.create({
      url,
      enabled_events: [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ],
      description: "Drip: sets who is Pro",
    });
    console.log(`✓ Created webhook ${url}`);
    console.log(`\n  Add this to your hosting's environment variables (it's shown only once):`);
    console.log(endpoint.secret ? `  STRIPE_WEBHOOK_SECRET=${endpoint.secret}` : "  (Find the signing secret under Developers → Webhooks in the Stripe dashboard.)");
  }
}
console.log("\nDone. Set NEXT_PUBLIC_PAYMENTS_ENABLED=true (and STRIPE_MANAGED_PAYMENTS=true if Stripe is your");
console.log("merchant of record) and redeploy to switch on real payments.");
