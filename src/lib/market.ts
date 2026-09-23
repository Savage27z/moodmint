/**
 * Live inputs for the artwork.
 *
 * Two independent sources, both labelled in the UI:
 *   - SOL price + 24h change: CoinGecko public API (off-chain market data)
 *   - Slot + epoch: Solana devnet RPC (on-chain network state)
 *
 * If a source is unavailable we say so. We never invent a number, because
 * presenting fabricated chain data is disqualifying and, more importantly,
 * the whole point of the app is that the picture is evidence.
 */

export interface MarketSnapshot {
  price: number | null;
  changePct: number | null;
  slot: number | null;
  epoch: number | null;
  priceSource: string;
  chainSource: string;
  priceOk: boolean;
  chainOk: boolean;
  fetchedAt: number;
  notes: string[];
}

const COINGECKO =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

let cache: { at: number; data: MarketSnapshot } | null = null;
const CACHE_MS = 15_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

async function fetchPrice(): Promise<{ price: number; changePct: number }> {
  const res = await withTimeout(fetch(COINGECKO, { cache: "no-store" }), 6000);
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j: any = await res.json();
  const price = j?.solana?.usd;
  const changePct = j?.solana?.usd_24h_change;
  if (typeof price !== "number" || typeof changePct !== "number") {
    throw new Error("coingecko: unexpected shape");
  }
  return { price, changePct };
}

async function fetchChain(): Promise<{ slot: number; epoch: number }> {
  const body = (method: string, id: number) =>
    JSON.stringify({ jsonrpc: "2.0", id, method, params: [] });

  const res = await withTimeout(
    fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `[${body("getSlot", 1)},${body("getEpochInfo", 2)}]`,
      cache: "no-store",
    }),
    6000
  );
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const j: any = await res.json();
  const slot = j?.find?.((r: any) => r.id === 1)?.result;
  const epoch = j?.find?.((r: any) => r.id === 2)?.result?.epoch;
  if (typeof slot !== "number") throw new Error("rpc: no slot");
  return { slot, epoch: typeof epoch === "number" ? epoch : 0 };
}

export async function getMarket(): Promise<MarketSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const notes: string[] = [];
  const [priceRes, chainRes] = await Promise.allSettled([fetchPrice(), fetchChain()]);

  const priceOk = priceRes.status === "fulfilled";
  const chainOk = chainRes.status === "fulfilled";

  if (!priceOk) notes.push("Price feed unavailable right now. Mood is held at its neutral state rather than guessed.");
  if (!chainOk) notes.push("Devnet RPC did not answer in time. Slot is shown as unknown.");

  const data: MarketSnapshot = {
    price: priceOk ? priceRes.value.price : null,
    changePct: priceOk ? priceRes.value.changePct : null,
    slot: chainOk ? chainRes.value.slot : null,
    epoch: chainOk ? chainRes.value.epoch : null,
    priceSource: "CoinGecko public API (SOL/USD spot + 24h change)",
    chainSource: "Solana devnet RPC (getSlot, getEpochInfo)",
    priceOk,
    chainOk,
    fetchedAt: Date.now(),
    notes,
  };

  cache = { at: Date.now(), data };
  return data;
}
