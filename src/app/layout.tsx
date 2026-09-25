import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { THEME_COLORS, themeInitScript } from "@/lib/theme-script";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to Google from the user's browser.
// `subsets` only sets what is preloaded; accented letters (ą, š, ž...) still load on demand.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-figtree",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-jetbrains",
});

const title = "Drip · every subscription in one place";
const description =
  "See what your subscriptions really cost each month, get warned before every charge and find the ones you no longer use.";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  // Link previews need absolute image URLs. Without NEXT_PUBLIC_SITE_URL, Next.js uses the Vercel production domain.
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title,
  description,
  // The preview image itself comes from opengraph-image.tsx.
  openGraph: { type: "website", siteName: "Drip", title, description },
  twitter: { card: "summary_large_image", title, description },
  applicationName: "Drip",
  appleWebApp: { capable: true, title: "Drip", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script below may add data-theme before React loads.
      suppressHydrationWarning
      className={`${bricolage.variable} ${figtree.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans">
        {children}
        <ServiceWorkerRegistration />
        {/* Vercel Web Analytics: cookie-free page views, turned on in the Vercel project's Analytics tab. */}
        <Analytics />
      </body>
    </html>
  );
}
