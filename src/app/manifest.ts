import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme-script";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Drip: subscription tracker",
    short_name: "Drip",
    description:
      "See what your subscriptions really cost each month, get warned before every charge and find the ones you no longer use.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    categories: ["finance", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Shown in the install dialog and used by app store packagers (PWABuilder).
    screenshots: [
      { src: "/screenshots/phone-overview.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Your monthly total and the next 30 days" },
      { src: "/screenshots/phone-list.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Every subscription, with cancel guides" },
      { src: "/screenshots/desktop-overview.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Drip on a computer" },
    ],
    shortcuts: [{ name: "Add a subscription", short_name: "Add", url: "/?add=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
