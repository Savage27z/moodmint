import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moodmint - an NFT that feels the market",
  description:
    "A pixel mascot whose artwork is generated live from SOL price action and Solana network state. Mint on devnet and watch it change.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
