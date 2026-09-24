import type { Metadata } from "next";
import "./globals.css";

/**
 * Resolved in priority order so link previews work without any manual config:
 * an explicit override, then Vercel's stable production alias, then the
 * per-deployment URL, then local dev.
 */
const BASE =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3400");

const title = "Moodmint - an NFT that feels the market";
const description =
  "A pixel mascot redrawn from live SOL price action and Solana network state every time you look at it. Mint on devnet and watch its face change.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title,
  description,
  openGraph: {
    title,
    description,
    url: BASE,
    siteName: "Moodmint",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Moodmint mascot" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
