import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const DESCRIPTION =
  "Live, AI-verified road and trek conditions for Himachal Pradesh. Report a landslide with one photo; Meta's Muse models verify it, plan your trip around it and warn you on the way. Pathfinder decides the safe route, Google Maps drives it.";
const SPLASH: [number, number, number][] = [
  [1170, 2532, 3], [1179, 2556, 3], [1290, 2796, 3], [1125, 2436, 3], [828, 1792, 2], [750, 1334, 2],
];

export const metadata: Metadata = {
  // Absolute URLs for the OG/Twitter images (Vercel sets VERCEL_PROJECT_PRODUCTION_URL).
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "Pathfinder — Himachal road & trek conditions",
  description: DESCRIPTION,
  applicationName: "Pathfinder",
  appleWebApp: {
    capable: true,
    title: "Pathfinder",
    statusBarStyle: "default",
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/splash/iphone-${w}x${h}.png`,
      media: `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Pathfinder",
    title: "Pathfinder — know the road before you go",
    description: "Live, AI-verified road and trek conditions for Himachal Pradesh, built with Meta's Muse models and SAM 3.1.",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pathfinder — know the road before you go",
    description: "Live, AI-verified road and trek conditions for Himachal Pradesh, built with Meta's Muse models and SAM 3.1.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#E7EDE3",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
