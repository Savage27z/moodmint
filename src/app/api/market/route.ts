import { NextResponse } from "next/server";
import { getMarket } from "@/lib/market";
import { moodFromChange, moodLabel } from "@/lib/mascot";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = await getMarket();
  const mood = moodFromChange(m.changePct ?? 0);
  return NextResponse.json(
    { ...m, mood, moodLabel: moodLabel(mood) },
    { headers: { "cache-control": "no-store" } }
  );
}
