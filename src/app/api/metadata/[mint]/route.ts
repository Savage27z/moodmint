import { NextResponse } from "next/server";
import { getMarket } from "@/lib/market";
import { moodFromChange, moodLabel } from "@/lib/mascot";

export const dynamic = "force-dynamic";

function baseUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/**
 * Metadata is generated per request, so a wallet that re-reads it later sees
 * the mascot's current mood rather than the mood it had at mint time.
 */
export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const m = await getMarket();
  const changePct = m.changePct ?? 0;
  const mood = moodFromChange(changePct);
  const t = new URL(req.url).searchParams.get("t") || "0";
  const image = `${baseUrl(req)}/api/render?mint=${encodeURIComponent(params.mint)}&t=${t}`;

  return NextResponse.json(
    {
      name: `Moodmint - ${moodLabel(mood)}`,
      symbol: "MOOD",
      description:
        "A mascot that redraws itself from live market and network state. The artwork is generated on request from SOL price action and the current Solana slot, so this image changes as conditions change. Nothing is pre-rendered or swapped by hand.",
      image,
      external_url: baseUrl(req),
      attributes: [
        { trait_type: "Mood", value: moodLabel(mood) },
        { trait_type: "24h Change", value: `${changePct.toFixed(2)}%` },
        { trait_type: "SOL Price (USD)", value: m.price ? m.price.toFixed(2) : "unavailable" },
        { trait_type: "Slot At Read", value: m.slot ?? "unavailable" },
        { trait_type: "Render", value: "Live, generated per request" },
      ],
      properties: {
        files: [{ uri: image, type: "image/svg+xml" }],
        category: "image",
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}
