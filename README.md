# Moodmint

**An NFT that feels the market.**

A pixel mascot whose artwork is never stored. It is redrawn from live SOL price action and current Solana network state every time anyone looks at it, so the same NFT has a different face on a green day than on a red one.

Built for **Proof of Taste**, a Solana design hackathon.

---

## What it does

1. The landing page shows the mascot as it is **right now**, driven by real data.
2. You connect a wallet and mint one on **Solana devnet**.
3. The NFT's metadata points at a live rendering endpoint instead of a stored image, so the artwork keeps changing after the mint.
4. Mascots held for over an hour render with a small crown.

The mood rules are fixed, public, and shown in the interface:

| Mood | Rule (SOL 24h change) |
|---|---|
| EUPHORIC | >= +6% |
| PLEASED | +1.5% to +6% |
| UNBOTHERED | -1.5% to +1.5% |
| NERVOUS | -6% to -1.5% |
| WRECKED | <= -6% |

Same inputs always produce the same face. The per-mint seed only varies sparkle and rain placement, never the mood.

## The signing screen

The brief scores the moment before signing, so that screen states in plain language:

- **What happens** — one Metaplex Core NFT is created in your wallet on devnet
- **What you get** — a mascot in its current mood, which will keep changing
- **What it costs** — about 0.0018 SOL rent plus about 0.000005 SOL network fee, roughly 0.001805 SOL total, all devnet
- **Moodmint's cut** — nothing, no platform fee and no royalty
- **Permissions** — none beyond creating this one NFT, no token approvals, no authority over anything you already hold
- **What could go wrong** — devnet resets remove the NFT; if the price feed is down the mascot holds a neutral face rather than inventing a number; the image is drawn on request, so it needs this app online

## Honesty about data

Two independent sources, both named in the interface:

| Data | Source | Type |
|---|---|---|
| SOL/USD price and 24h change | CoinGecko public API | off-chain market data |
| Slot and epoch | Solana devnet RPC (`getSlot`, `getEpochInfo`) | on-chain network state |

**Nothing is fabricated.** If a source fails, the app says so on screen and holds a neutral mood instead of inventing a number. The mood-preview buttons (EUPHORIC, WRECKED, and so on) are explicitly labelled as illustrations; only **LIVE** reflects real market state, and only live state is ever written into minted metadata.

## On-chain component

- **Metaplex Core** asset creation (`create` from `@metaplex-foundation/mpl-core`) on devnet
- Each asset's `uri` points to `/api/metadata/<assetAddress>`, which is generated per request
- No custom program is deployed, no mint authority is retained, no delegate is set, and the app never takes custody of anything


## Addresses, programs and external services

Everything this app touches, as required by the submission rules.

| What | Identifier | Notes |
|---|---|---|
| Metaplex Core program | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` | The only on-chain program invoked. Not written by me. |
| Custom program | none | No program is deployed by this project. |
| Mint addresses | none fixed | Every mint generates a fresh Core asset keypair client-side. The address is shown after minting and links to Solana Explorer. |
| Cluster | Solana **devnet** | `https://api.devnet.solana.com` by default, overridable. |
| Token mints / approvals | none | No SPL mint is created, no token approval or delegate is ever requested. |
| CoinGecko | `api.coingecko.com/api/v3/simple/price` | Public endpoint, no key, SOL/USD spot and 24h change. |
| Fees to the developer | none | No platform fee, no royalty, no fee-taking account. |

### Verifying the mint path yourself

```bash
node scripts/audit-mint.mjs https://moodmint-beta.vercel.app
```

It runs the same `create` call the app runs using a throwaway keypair, checks that the metadata and artwork endpoints answer, and compares the cost quoted on the signing screen against what the runtime actually charges.

## Run it locally

```bash
npm install
cp .env.example .env.local   # defaults work as-is
npm run dev                  # http://localhost:3400
```

Get free devnet SOL from https://faucet.solana.com before minting.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_RPC_ENDPOINT` | Solana RPC. Defaults to `https://api.devnet.solana.com`. |
| `NEXT_PUBLIC_BASE_URL` | Public URL of this deployment. Written into NFT metadata so the artwork resolves. |

No private keys or seed phrases are in this repository, and the app never asks for one. See `.env.example`.

## How it is built

| Layer | Choice |
|---|---|
| App | Next.js 14 (App Router), TypeScript, Tailwind |
| Wallet | Phantom, Solflare and Backpack via their injected providers |
| NFT | Metaplex Core via Umi |
| Artwork | Hand-authored 16x16 pixel maps rendered to SVG on the server |
| Network | Solana devnet |

The renderer is a pure function in [`src/lib/mascot.ts`](src/lib/mascot.ts): state in, SVG out, no randomness beyond a seeded PRNG.

## Design choice I am proudest of

The artwork is the receipt. Every number that produced the face — price, 24h change, slot — is printed on the image itself and on the page next to it, with its source named. Most NFT art asks you to trust it. This one shows its working, and when the data is missing it admits that instead of drawing a confident face over a guess.

## Project layout

```
src/
  app/
    api/market/route.ts          live price + slot, with graceful failure
    api/render/route.ts          SVG renderer endpoint
    api/metadata/[mint]/route.ts per-request NFT metadata
    page.tsx                     entry
  components/
    Studio.tsx                   interface + signing screen
  lib/
    mascot.ts                    pixel maps, palettes, SVG renderer
    market.ts                    data sources, caching, failure handling
    wallets.ts                   multi-wallet detection and connection
scripts/
  audit-mint.mjs                 audits the mint path against devnet
  make-og.py                     builds the social card from the pixel maps
```

## Limits

- Devnet only. Devnet SOL has no monetary value and the cluster is reset periodically.
- Artwork is served by this deployment, so it depends on the app being online. A production version would pin an on-chain or IPFS fallback frame.
- Mint history on the landing page is stored in the browser. The assets themselves live on-chain and can be verified in Solana Explorer.
