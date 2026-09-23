import { getMarket } from "@/lib/market";
import { Mood, moodFromChange, renderMascot } from "@/lib/mascot";

const MOODS: Mood[] = ["euphoric", "happy", "calm", "nervous", "wrecked"];

export const dynamic = "force-dynamic";

/** Turns an arbitrary string (the mint address) into a stable numeric seed. */
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mint = url.searchParams.get("mint") || "preview";
  const mintedAt = Number(url.searchParams.get("t") || "0");

  const m = await getMarket();
  const changePct = m.changePct ?? 0;
  const ageMinutes = mintedAt > 0 ? Math.max(0, (Date.now() - mintedAt) / 60000) : 0;

  // `force` renders a different mood for preview purposes. It is labelled as an
  // illustration in the UI and is never used for minted metadata.
  const forced = url.searchParams.get("force");
  const mood = forced && MOODS.includes(forced as Mood) ? (forced as Mood) : moodFromChange(changePct);

  const svg = renderMascot({
    mood,
    changePct,
    price: m.price ?? 0,
    slot: m.slot ?? 0,
    ageMinutes,
    seed: seedFrom(mint),
  });

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
