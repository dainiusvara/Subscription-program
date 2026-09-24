/**
 * Step-by-step cancel guides. Each links to the service's own help page,
 * which has the latest steps; menus change, so the steps here are a summary.
 * Links and steps were checked against the official pages in September 2026.
 */
import type { Subscription } from "./types";

export interface CancelGuide {
  id: string;
  name: string;
  /** Names people type for this service. Matched as whole words. */
  aliases: string[];
  /** The service's official help page for cancelling, if there is one. */
  url: string | null;
  steps: string[];
  notes: string[];
}

export const GUIDES_CHECKED = "September 2026";

const APP_STORE_NOTE =
  "Signed up in the iPhone or Android app? Then Apple or Google bills you: cancel under Apple subscriptions or Google Play subscriptions instead.";

export const CANCEL_GUIDES: readonly CancelGuide[] = [
  {
    id: "netflix",
    name: "Netflix",
    aliases: ["netflix"],
    url: "https://help.netflix.com/en/node/407",
    steps: [
      "Sign in at netflix.com and open Manage your membership (Account → Membership).",
      "Select Cancel.",
      "Select Finish cancellation. You'll get a confirmation email.",
    ],
    notes: [
      "You can keep watching until the end of the period you've paid for.",
      "No Cancel button? A partner (like your phone or TV provider) bills you: the Membership section says how to cancel with them.",
    ],
  },
  {
    id: "spotify",
    name: "Spotify Premium",
    aliases: ["spotify", "spotify premium"],
    url: "https://support.spotify.com/article/cancel-premium/",
    steps: [
      "Sign in at spotify.com and go to Manage your plan.",
      "Select Cancel subscription and confirm.",
    ],
    notes: [
      "Premium lasts until your next billing date, then you move to Spotify Free. Your playlists stay.",
      "On a Family or Duo plan, only the plan manager can cancel.",
    ],
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    aliases: ["youtube premium", "youtube music", "youtube"],
    url: "https://support.google.com/youtube/answer/6308278",
    steps: [
      "Go to youtube.com/paid_memberships and sign in.",
      "Select your membership, then Deactivate or Cancel membership.",
      "Follow the prompts to confirm.",
    ],
    notes: ["Joined in the YouTube iPhone app? Cancel it in your Apple subscriptions instead."],
  },
  {
    id: "disney",
    name: "Disney+",
    aliases: ["disney", "disney plus"],
    url: "https://help.disneyplus.com/article/disneyplus-cancel",
    steps: [
      "Sign in at disneyplus.com in a browser (not the TV app).",
      "Open your profile, then Account, and select your Disney+ subscription.",
      "Select Cancel subscription and confirm.",
    ],
    notes: [
      "You keep access until the end of the current period.",
      "Billed through a partner (like an app store or your phone provider)? Cancel with them.",
      "Monthly plans billed by Disney+ can be paused instead.",
    ],
  },
  {
    id: "xbox",
    name: "Xbox Game Pass",
    aliases: ["xbox game pass", "game pass", "xbox"],
    url: "https://support.xbox.com/en-US/help/subscriptions-billing/manage-subscriptions/cancel-recurring-billing-or-subscription",
    steps: [
      "Go to account.microsoft.com/services and sign in with the account that pays for it.",
      "Find Game Pass and select Manage.",
      "Select Cancel and follow the steps on the page.",
    ],
    notes: ["If you see 'Turn on recurring billing' instead of Manage, it's already set to end and won't charge again."],
  },
  {
    id: "playstation",
    name: "PlayStation Plus",
    aliases: ["playstation plus", "ps plus", "playstation", "psn"],
    url: "https://www.playstation.com/en-us/support/store/cancel-ps-store-subscription/",
    steps: [
      "On PS5: Settings → Users and Accounts → Account → Payment and Subscriptions → Subscriptions.",
      "Select PlayStation Plus, then Cancel Subscription (or Turn Off Auto-Renew).",
      "Or on the web: sign in to PlayStation Account Management → Subscription.",
    ],
    notes: ["Your membership stays active until the end of the period you've paid for."],
  },
  {
    id: "nintendo",
    name: "Nintendo Switch Online",
    aliases: ["nintendo switch online", "switch online", "nintendo"],
    url: "https://en-americas-support.nintendo.com/app/answers/detail/a_id/41196",
    steps: [
      "Go to accounts.nintendo.com and sign in with the account that bought the membership.",
      "Select Nintendo Switch Online.",
      "Under Active Plan, select the option to turn off auto-renewal, then Confirm.",
    ],
    notes: [
      "Do it at least 48 hours before the membership renews.",
      "The membership stays active until its end date; there's no refund for the time left.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    aliases: ["chatgpt", "chat gpt", "openai"],
    url: "https://help.openai.com/en/articles/7232927-how-do-i-cancel-my-chatgpt-plus-subscription",
    steps: [
      "Sign in at chatgpt.com.",
      "Open your profile icon → Settings → Billing (or Account).",
      "Under Cancel plan, select Cancel.",
    ],
    notes: [
      "Cancel at least 24 hours before the next billing date to avoid the next charge.",
      APP_STORE_NOTE,
    ],
  },
  {
    id: "icloud",
    name: "iCloud+",
    aliases: ["icloud", "icloud plus"],
    url: "https://support.apple.com/en-us/108318",
    steps: [
      "On iPhone or iPad, open Settings and tap your name.",
      "Tap Subscriptions, then iCloud+.",
      "Tap Cancel Subscription. (To pay less instead: Settings → your name → iCloud → Manage Account Storage → Downgrade Options.)",
    ],
    notes: ["The change applies when the current billing period ends."],
  },
  {
    id: "apple",
    name: "Apple subscriptions (Music, TV+, Arcade, One, App Store)",
    aliases: ["apple music", "apple tv", "apple one", "apple arcade", "apple fitness", "apple news", "app store", "apple"],
    url: "https://support.apple.com/en-us/118428",
    steps: [
      "iPhone or iPad: open Settings, tap your name, then Subscriptions.",
      "Tap the subscription, then Cancel Subscription.",
      "On a Mac: App Store → your name → your name again → Subscriptions. On Windows: the Apple Music or Apple TV app → your name → View My Account → Subscriptions → Manage.",
    ],
    notes: [
      "This is also where you cancel apps you subscribed to through the App Store.",
      "Cancel a free trial at least 24 hours before it ends.",
    ],
  },
  {
    id: "google-play",
    name: "Google Play subscriptions",
    aliases: ["google play", "play store", "play pass"],
    url: "https://support.google.com/googleplay/answer/7018481",
    steps: [
      "Open subscriptions on Google Play (Play Store app → your profile icon → Payments & subscriptions → Subscriptions).",
      "Select the subscription.",
      "Tap Cancel subscription and follow the steps.",
    ],
    notes: ["This is where you cancel apps you subscribed to on Android. You keep access for the time you've paid for."],
  },
  {
    id: "google-one",
    name: "Google One",
    aliases: ["google one", "google ai pro", "google storage"],
    url: "https://support.google.com/googleone/answer/9056360",
    steps: [
      "Go to one.google.com (or open the Google One app).",
      "Open Settings.",
      "Select Cancel membership and confirm.",
    ],
    notes: [
      "Storage and benefits last until the end of the billing period. After that you're back to the free 15 GB.",
      "On iPhone: Google One app → Menu → Membership plans → Manage plan → Cancel membership.",
    ],
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    aliases: ["microsoft 365", "office 365", "microsoft office", "m365", "onedrive"],
    url: "https://support.microsoft.com/en-us/accounts-billing/subscriptions/cancel-a-microsoft-365-subscription",
    steps: [
      "Go to account.microsoft.com/services and sign in with the account that pays for it.",
      "Find Microsoft 365 and select Cancel subscription (it may say Upgrade or Cancel).",
      "Follow the steps to confirm.",
    ],
    notes: [
      "Bought through Apple, Google or a shop like Amazon? Cancel with them.",
      "Afterwards your cloud storage drops to 5 GB.",
    ],
  },
  {
    id: "adobe",
    name: "Adobe Creative Cloud",
    aliases: ["adobe", "creative cloud", "photoshop", "lightroom", "acrobat", "illustrator", "premiere"],
    url: "https://helpx.adobe.com/account/individual/subscriptions-and-plans/renewals-and-cancellations/cancel-adobe-subscription.html",
    steps: [
      "Sign in at account.adobe.com and open Plans and payment.",
      "Select Manage plan, then Cancel your plan.",
      "Select Continue to cancel, review the details, then Confirm cancellation.",
    ],
    notes: [
      "Annual plans paid monthly can charge a fee of 50% of what's left if you cancel after the first 14 days.",
      "Each plan is cancelled separately.",
    ],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    aliases: ["dropbox"],
    url: "https://help.dropbox.com/plans/downgrade-dropbox-individual-plans",
    steps: [
      "Sign in at dropbox.com.",
      "Click your avatar → Manage account → Change plan.",
      "Choose Dropbox Basic (free), then Review changes → Confirm change.",
    ],
    notes: [
      "The change applies at the end of the billing period. Basic has 2 GB of space.",
      "Subscribed in the phone app? Cancel it in the app store instead.",
    ],
  },
  {
    id: "canva",
    name: "Canva Pro",
    aliases: ["canva"],
    url: "https://www.canva.com/help/cancel-canva-plan/",
    steps: [
      "On the Canva homepage, open your account menu.",
      "Select Cancel plan, then Continue cancellation.",
      "Choose a reason and confirm. You'll get a confirmation email.",
    ],
    notes: ["You keep Pro features until the paid period ends.", APP_STORE_NOTE],
  },
  {
    id: "amazon-prime",
    name: "Amazon Prime",
    aliases: ["amazon prime", "prime video", "amazon"],
    url: "https://www.amazon.com/gp/help/customer/display.html?nodeId=GTJQ7QZY7QL2HK4Y",
    steps: [
      "Sign in to Amazon for your country (amazon.de, amazon.co.uk, amazon.com…).",
      "Go to Your Account → Prime Membership (or Memberships & Subscriptions).",
      "Select Manage membership → End membership and confirm.",
    ],
    notes: [
      "If you haven't used any Prime benefits in this period, Amazon may refund it in full.",
      "Channels you added through Prime Video are separate and keep charging: cancel them too.",
    ],
  },
  {
    id: "audible",
    name: "Audible",
    aliases: ["audible"],
    url: "https://help.audible.com/s/article/cancel-membership?language=en_US",
    steps: [
      "Sign in on the Audible website for your country (not the app).",
      "Open Account details (or Membership details).",
      "Select Cancel membership and follow the steps.",
    ],
    notes: [
      "Use your credits first: they expire when the membership ends. Books you bought stay yours.",
      APP_STORE_NOTE,
    ],
  },
  {
    id: "hbo-max",
    name: "HBO Max",
    aliases: ["hbo max", "max", "hbo"],
    url: "https://help.hbomax.com/us/Answer/Detail/000002526",
    steps: [
      "Go to HBOMax.com/subscription and sign in. The top of the page shows who bills you.",
      "If HBO Max bills you directly, choose to cancel your subscription there.",
      "If Amazon, Google Play, Roku or another partner bills you, cancel with them.",
    ],
    notes: ["You can keep watching until the end of the billing period."],
  },
  {
    id: "paramount",
    name: "Paramount+",
    aliases: ["paramount", "paramount plus"],
    url: "https://help.paramountplus.com/s/article/PD-How-can-I-cancel-my-Paramount-subscription",
    steps: [
      "Sign in at paramountplus.com in a browser.",
      "Open Account, then find your subscription.",
      "Select Cancel subscription and confirm.",
    ],
    notes: ["Subscribed through Prime Video, an app store or your TV provider? Cancel with them."],
  },
  {
    id: "deezer",
    name: "Deezer",
    aliases: ["deezer"],
    url: "https://support.deezer.com/hc/en-gb/articles/214349245-Cancel-Your-Deezer-Subscription",
    steps: [
      "Sign in at deezer.com or open the Deezer app.",
      "Open Account settings and your subscription.",
      "Choose to cancel. You'll get a confirmation email.",
    ],
    notes: [
      "Premium lasts until the end of the period, then you move to Deezer Free.",
      "Paying through Apple or a partner like your phone provider? Cancel with them.",
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn Premium",
    aliases: ["linkedin", "linkedin premium"],
    url: "https://www.linkedin.com/help/linkedin/answer/a545578",
    steps: [
      "On a computer: open the Me menu → Premium features.",
      "Select Manage subscription (under Plan details).",
      "Cancel the subscription and confirm.",
    ],
    notes: [
      "Cancel at least a day before the next billing date.",
      "Bought in the iPhone app? Cancel it in your Apple subscriptions.",
    ],
  },
  {
    id: "gym",
    name: "Gyms and clubs",
    aliases: ["gym", "fitness", "health club", "sports club", "yoga", "pilates", "crossfit"],
    url: null,
    steps: [
      "Find your contract or membership terms and check the notice period.",
      "Cancel in writing (email or letter) and ask for a written confirmation.",
      "Keep the confirmation until the last payment has gone through.",
    ],
    notes: [
      "Don't just cancel the card or direct debit: the contract usually still runs and fees can follow.",
      "Moved away, or can't train for health reasons? Many clubs let you leave early. Ask.",
    ],
  },
];

/** Used when no specific guide matches. */
export const GENERAL_GUIDE: CancelGuide = {
  id: "general",
  name: "Any other subscription",
  aliases: [],
  url: null,
  steps: [
    "Check who charges you: the name on your card statement, or the first receipt email.",
    "Bought in an iPhone or Android app? Cancel under Apple subscriptions or Google Play subscriptions.",
    "Otherwise sign in on the service's website and look under Account, Billing or Subscription.",
    "No option there? Email their support asking to cancel, and keep the reply.",
  ],
  notes: ["Cancelling usually keeps access until the end of the period you've paid for."],
};

/** Lowercase words only: "Disney+" → "disney", "iCloud+ 200GB" → "icloud 200gb". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The best guide for a name: the longest alias that appears in it as whole words. */
export function findGuideByName(name: string): CancelGuide | null {
  const padded = ` ${normalizeName(name)} `;
  let best: { guide: CancelGuide; length: number } | null = null;
  for (const guide of CANCEL_GUIDES) {
    for (const alias of guide.aliases) {
      const needle = ` ${normalizeName(alias)} `;
      if (padded.includes(needle) && (!best || needle.length > best.length)) {
        best = { guide, length: needle.length };
      }
    }
  }
  return best?.guide ?? null;
}

/** A guide for a subscription: by name, then gyms by category, then the general one. */
export function guideFor(sub: Pick<Subscription, "name" | "category">): CancelGuide {
  return (
    findGuideByName(sub.name) ??
    (sub.category === "Fitness" ? CANCEL_GUIDES.find((g) => g.id === "gym")! : GENERAL_GUIDE)
  );
}

/** Guides for named services (not the general advice ones). */
export const SERVICE_GUIDE_COUNT = CANCEL_GUIDES.filter((g) => g.url !== null).length;

export function searchGuides(query: string): CancelGuide[] {
  const q = normalizeName(query);
  const all = [...CANCEL_GUIDES, GENERAL_GUIDE];
  if (!q) return all;
  return all.filter((g) => normalizeName(`${g.name} ${g.aliases.join(" ")}`).includes(q));
}
