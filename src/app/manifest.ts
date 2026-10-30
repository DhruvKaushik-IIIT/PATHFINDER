// PWA manifest (Phase 6E): installable on Android (Chrome prompt) and iPhone (Share → Add to Home Screen).
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pathfinder — Himachal road conditions",
    short_name: "Pathfinder",
    description: "Live, AI-verified road and trek conditions for Himachal Pradesh. Pathfinder decides the safe route, Google Maps drives it.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#E7EDE3",
    theme_color: "#E7EDE3",
    categories: ["navigation", "travel", "weather"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
