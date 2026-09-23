# Moodmint — submission pack

Everything needed for the Proof of Taste entry form, the video, and the X post.

---

## 1. Submission description (paste into the form)

**Moodmint — an NFT that feels the market.**

Most NFT art is a picture someone uploaded once. Moodmint has no stored picture at all. The mascot is redrawn from live SOL price action and the current Solana slot every time anyone looks at it, so the same NFT is euphoric on a green day and wrecked on a red one. Mint it on devnet and its face keeps changing after you own it.

**What is real:** the mint is a Metaplex Core asset created on Solana devnet, and each asset's `uri` points at a metadata endpoint that is generated per request rather than pinned to a fixed image. Price and 24h change come from the CoinGecko public API; slot and epoch come from Solana devnet RPC. Both sources are named on screen. If a source fails, the app says so and holds a neutral face rather than inventing a number, because fabricated data would defeat the entire idea.

**What is illustrated:** the mood-preview buttons (EUPHORIC, WRECKED, and the rest) show how the mascot looks in other market conditions. They are labelled as illustrations in the interface, and only live state is ever written into minted metadata.

**On signing:** before the wallet opens, the app states what will happen, what you get, the exact expected cost broken into rent and network fee, that Moodmint takes no fee and no royalty, that no approvals or authorities are requested, and what could go wrong including devnet resets.

**The design choice I am proudest of:** the artwork is its own receipt. Every number that produced the face — price, 24h change, slot — is printed on the image and on the page beside it, each with its source named. Most NFT art asks you to trust it. This one shows its working, and admits when it cannot.

---

## 2. One-sentence design choice (if a short field is required)

The artwork prints the exact data that produced it, so the picture doubles as its own receipt.

---

## 3. Demo video script (target 2:10, hard limit 3:00)

Record at 1280x720 or larger. Keep the cursor slow. No music needed; if you speak, keep it flat and factual.

| Time | On screen | Say (or caption) |
|---|---|---|
| 0:00-0:12 | Landing page, mascot breathing | "This is Moodmint. This mascot isn't a stored image. It's being drawn right now from SOL's price action." |
| 0:12-0:30 | Point at the data panel | "These are the numbers it's reading: SOL price, 24-hour change, and the current devnet slot. Both sources are named here. If either goes down, the app says so instead of guessing." |
| 0:30-0:45 | Click through mood previews | "These buttons preview the other moods. They're labelled as illustrations — only LIVE is real market state." |
| 0:45-0:55 | Mood rules table | "The rules are fixed and public. Same inputs, same face, every time." |
| 0:55-1:05 | Connect wallet, balance appears | "Connect Phantom on devnet." |
| 1:05-1:35 | **Click Review and mint. Read the signing screen aloud.** | "Before anything is signed: what happens, what you get, the exact cost split into rent and network fee, that we take zero, that no approvals are requested, and what could go wrong." |
| 1:35-1:55 | **Phantom opens → approve → confirmation** | "Approve. That's a real transaction on devnet." |
| 1:55-2:10 | New mascot in the list, click Explorer | "Here it is on-chain in Solana Explorer. Its artwork will keep changing with the market — this NFT looks different tomorrow." |

**Must be in frame:** the signing screen, the Phantom approval, the confirmation, and the Explorer page. The brief explicitly asks for a real transaction end to end including the signing screen.

---

## 4. X post draft

> Most NFT art is a picture someone uploaded once.
>
> Moodmint has no stored image. The mascot is redrawn from live SOL price action every time you look at it.
>
> Green day: euphoric. Red day: wrecked.
>
> Minted on Solana devnet. Built for #ProofOfTaste
>
> [link] [demo clip]

Attach the 20-second clip showing the mascot in two different moods, not the full video. Reply to your own post with the live link and repo so the first tweet stays clean.

---

## 5. Submission checklist

- [ ] Public GitHub repo, with README explaining how to run it, the network, and every address it touches
- [ ] Live link that works in a browser with a standard Solana wallet
- [ ] Demo video, 3 minutes or less, showing a real transaction end to end including the signing screen and confirmation
- [ ] Short description of what you built and why, plus the design-choice sentence
- [ ] `.env.example` present, no private keys or seed phrases anywhere in the repo
- [ ] Anything reused from before the hackathon is disclosed (this project was built from scratch during it)
- [ ] Posted on X, with the post linked in the submission
