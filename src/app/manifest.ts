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
  };
}
