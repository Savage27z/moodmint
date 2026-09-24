"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { generateSigner } from "@metaplex-foundation/umi";
import { create, mplCore } from "@metaplex-foundation/mpl-core";
import { RPC_ENDPOINT, useWallet, type WalletOption } from "@/lib/wallets";
import type { Mood } from "@/lib/mascot";

type Market = {
  price: number | null;
  changePct: number | null;
  slot: number | null;
  priceSource: string;
  chainSource: string;
  mood: Mood;
  moodLabel: string;
  notes: string[];
};

type Minted = { address: string; at: number; mood: string };

const MOOD_TABLE = [
  { mood: "EUPHORIC", rule: "24h change >= +6%" },
  { mood: "PLEASED", rule: "+1.5% to +6%" },
  { mood: "UNBOTHERED", rule: "-1.5% to +1.5%" },
  { mood: "NERVOUS", rule: "-6% to -1.5%" },
  { mood: "WRECKED", rule: "24h change <= -6%" },
];

const MOODS: Mood[] = ["euphoric", "happy", "calm", "nervous", "wrecked"];

/** Rent for one Metaplex Core asset plus the signature fee, measured on devnet. */
const EST_RENT_SOL = 0.0018;
const EST_FEE_SOL = 0.000005;

export default function Studio() {
  const { publicKey, connect, disconnect, connecting, provider, wallets, available, active } =
    useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);

  const [market, setMarket] = useState<Market | null>(null);
  const [tick, setTick] = useState(0);
  const [preview, setPreview] = useState<Mood | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [minted, setMinted] = useState<Minted[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/market", { cache: "no-store" });
        const j = await r.json();
        if (alive) setMarket(j);
      } catch {
        /* the data panel renders its own unavailable state */
      }
    };
    load();
    const id = setInterval(() => {
      load();
      setTick((t) => t + 1);
    }, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("moodmint:minted") : null;
    if (raw) {
      try {
        setMinted(JSON.parse(raw));
      } catch {
        /* ignore malformed local history */
      }
    }
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    let alive = true;
    const conn = new Connection(RPC_ENDPOINT, "confirmed");
    conn
      .getBalance(publicKey)
      .then((b) => alive && setBalance(b / 1e9))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [publicKey, minted.length]);

  const imgSrc = useMemo(() => {
    const q = new URLSearchParams({ mint: "preview", t: "0", v: String(tick) });
    if (preview) q.set("force", preview);
    return `/api/render?${q.toString()}`;
  }, [tick, preview]);

  const enoughBalance = balance === null || balance >= EST_RENT_SOL + EST_FEE_SOL;

  const doMint = useCallback(async () => {
    if (!publicKey || !provider) return;
    setMinting(true);
    setError(null);
    try {
      const umi = createUmi(RPC_ENDPOINT)
        .use(mplCore())
        .use(walletAdapterIdentity(provider as any));
      const asset = generateSigner(umi);
      const mintedAt = Date.now();
      const uri = `${window.location.origin}/api/metadata/${asset.publicKey.toString()}?t=${mintedAt}`;

      await create(umi, {
        asset,
        name: `Moodmint #${asset.publicKey.toString().slice(0, 4)}`,
        uri,
      }).sendAndConfirm(umi);

      const entry: Minted = {
        address: asset.publicKey.toString(),
        at: mintedAt,
        mood: market?.moodLabel || "UNKNOWN",
      };
      const next = [entry, ...minted].slice(0, 12);
      setMinted(next);
      localStorage.setItem("moodmint:minted", JSON.stringify(next));
      setSheetOpen(false);
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(
        /reject|denied|cancel/i.test(msg)
          ? "You cancelled the signature. Nothing was created and nothing was charged."
          : `The mint did not go through: ${msg}`
      );
    } finally {
      setMinting(false);
    }
  }, [publicKey, provider, market, minted]);

  const change = market?.changePct;
  const up = (change ?? 0) >= 0;
  const short = publicKey ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}` : "";

  return (
    <main className="min-h-screen">
      <header className="border-b hairline">
        <div className="mx-auto max-w-5xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[15px] tracking-[0.3em]">MOODMINT</div>
            <div className="label mt-1">Solana devnet</div>
          </div>
          {publicKey ? (
            <button
              onClick={disconnect}
              className="rounded-lg border hairline px-3 h-[38px] text-[12px] flex items-center gap-2"
              title="Disconnect"
            >
              <span className="text-[color:var(--muted)]">{active?.name}</span>
              {short}
            </button>
          ) : (
            <button
              onClick={() => {
                // One wallet installed is not a choice worth making the user make.
                if (available.length === 1) connect(available[0].id);
                else setPickerOpen(true);
              }}
              disabled={connecting}
              className="rounded-lg bg-white text-black px-4 h-[38px] text-[13px] disabled:opacity-40"
            >
              {connecting ? "Connecting..." : "Connect wallet"}
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pt-10 pb-6">
        <h1 className="text-[28px] sm:text-[38px] leading-tight max-w-2xl">
          An NFT that <span style={{ color: up ? "#5ef2a0" : "#ff6b8a" }}>feels</span> the market.
        </h1>
        <p className="mt-3 text-[13px] sm:text-sm text-[color:var(--muted)] max-w-xl leading-relaxed">
          No stored picture. The mascot is redrawn from live SOL price action and the current Solana
          slot every time anyone looks at it, so your NFT&apos;s face changes with the market.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 grid gap-5 lg:grid-cols-[360px,1fr]">
        <div className="card p-4 rise">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt="Mascot rendered live from current market and network state"
            width={360}
            height={440}
            className="w-full h-auto rounded-lg"
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setPreview(null)}
              className={`px-2 py-1 rounded text-[10px] border hairline ${!preview ? "bg-white text-black" : ""}`}
            >
              LIVE
            </button>
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setPreview(m)}
                className={`px-2 py-1 rounded text-[10px] border hairline ${preview === m ? "bg-white text-black" : ""}`}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-[color:var(--muted)] leading-relaxed">
            LIVE is the real, current mood. The other buttons preview how the mascot looks in other
            market conditions. Those are illustrations, not live data.
          </p>
        </div>

        <div className="grid gap-5 content-start">
          <div className="card p-5 rise">
            <div className="label">What the artwork is reading</div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="SOL / USD" value={market?.price != null ? `$${market.price.toFixed(2)}` : "unavailable"} />
              <Stat
                label="24h change"
                value={change != null ? `${up ? "+" : ""}${change.toFixed(2)}%` : "unavailable"}
                color={change == null ? undefined : up ? "#5ef2a0" : "#ff6b8a"}
              />
              <Stat label="Mood" value={market?.moodLabel ?? "..."} />
              <Stat label="Devnet slot" value={market?.slot != null ? market.slot.toLocaleString() : "unavailable"} />
            </div>
            <div className="mt-5 pt-4 border-t hairline grid gap-1.5 text-[11px] text-[color:var(--muted)]">
              <div>Price: {market?.priceSource ?? "-"}</div>
              <div>Chain: {market?.chainSource ?? "-"}</div>
              {market?.notes?.map((n) => (
                <div key={n} className="text-[#f0cf7a]">
                  {n}
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 rise">
            <div className="label">How the mood is decided</div>
            <div className="mt-3 grid gap-1.5">
              {MOOD_TABLE.map((r) => (
                <div
                  key={r.mood}
                  className={`flex items-center justify-between text-[12px] px-3 py-2 rounded border hairline ${
                    market?.moodLabel === r.mood ? "bg-white/[0.06]" : ""
                  }`}
                >
                  <span>{r.mood}</span>
                  <span className="text-[color:var(--muted)]">{r.rule}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[color:var(--muted)] leading-relaxed">
              The rules are fixed and public. Same inputs, same face, every time.
            </p>
          </div>

          <div className="card p-5 rise">
            <div className="label">Mint</div>
            <p className="mt-2 text-[12px] text-[color:var(--muted)] leading-relaxed">
              Creates one Metaplex Core NFT in your wallet on devnet. Devnet SOL is free from the
              faucet and has no monetary value.
            </p>
            {!publicKey ? (
              <p className="mt-4 text-[12px]">
                {available.length === 0
                  ? "No Solana wallet detected in this browser."
                  : `Connect a wallet to continue. Detected: ${available.map((w) => w.name).join(", ")}.`}
              </p>
            ) : (
              <>
                <div className="mt-4 text-[12px] text-[color:var(--muted)]">
                  Balance: {balance == null ? "..." : `${balance.toFixed(4)} SOL`}
                </div>
                {!enoughBalance && (
                  <p className="mt-2 text-[12px] text-[#f0cf7a]">
                    That balance is too low to cover rent. Get free devnet SOL at faucet.solana.com.
                  </p>
                )}
                <button
                  onClick={() => setSheetOpen(true)}
                  disabled={!enoughBalance}
                  className="mt-4 w-full rounded-lg bg-white text-black text-[13px] py-3 disabled:opacity-40"
                >
                  Review and mint
                </button>
              </>
            )}
            {error && <p className="mt-3 text-[12px] text-[#ff6b8a] leading-relaxed">{error}</p>}
          </div>

          {minted.length > 0 && (
            <div className="card p-5 rise">
              <div className="label">Your mascots</div>
              <div className="mt-3 grid gap-2">
                {minted.map((m) => (
                  <div key={m.address} className="flex items-center gap-3 text-[11px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/render?mint=${m.address}&t=${m.at}&v=${tick}`}
                      alt=""
                      className="w-10 h-12 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{m.address}</div>
                      <div className="text-[color:var(--muted)]">Minted while {m.mood}</div>
                    </div>
                    <a
                      className="underline text-[color:var(--muted)] shrink-0"
                      href={`https://explorer.solana.com/address/${m.address}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explorer
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {pickerOpen && (
        <WalletPicker
          wallets={wallets}
          onPick={(id) => {
            setPickerOpen(false);
            connect(id);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {sheetOpen && (
        <SignSheet
          onCancel={() => setSheetOpen(false)}
          onConfirm={doMint}
          minting={minting}
          moodLabel={market?.moodLabel ?? "UNKNOWN"}
          wallet={publicKey?.toString() ?? ""}
        />
      )}

      <footer className="border-t hairline">
        <div className="mx-auto max-w-5xl px-5 py-6 text-[11px] text-[color:var(--muted)] leading-relaxed">
          Devnet only. Moodmint takes no fee, requests no approvals or authorities, and never asks
          for a seed phrase. The artwork is served live by this app, so it depends on this app
          staying online.
        </div>
      </footer>
    </main>
  );
}

/** Wallet chooser. Installed wallets first, the rest offered as install links. */
function WalletPicker({
  wallets,
  onPick,
  onClose,
}: {
  wallets: WalletOption[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const installed = wallets.filter((w) => w.provider);
  const missing = wallets.filter((w) => !w.provider && w.id !== "injected");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-5"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-sm p-5 rounded-b-none sm:rounded-2xl rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="label">Connect a wallet</div>
        <h2 className="mt-2 text-[17px]">Solana devnet</h2>

        {installed.length > 0 && (
          <div className="mt-4 grid gap-2">
            {installed.map((w) => (
              <button
                key={w.id}
                onClick={() => onPick(w.id)}
                className="w-full rounded-lg border hairline px-4 py-3 text-[13px] text-left hover:bg-white/[0.06] flex items-center justify-between"
              >
                {w.name}
                <span className="text-[10px] text-[color:var(--muted)]">DETECTED</span>
              </button>
            ))}
          </div>
        )}

        {installed.length === 0 && (
          <p className="mt-4 text-[12px] text-[color:var(--muted)] leading-relaxed">
            No Solana wallet was detected in this browser. Install one below, then reload this page.
          </p>
        )}

        {missing.length > 0 && (
          <div className="mt-4 pt-4 border-t hairline">
            <div className="label">Not installed</div>
            <div className="mt-2 grid gap-2">
              {missing.map((w) => (
                <a
                  key={w.id}
                  href={w.installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full rounded-lg border hairline px-4 py-3 text-[13px] flex items-center justify-between text-[color:var(--muted)] hover:bg-white/[0.04]"
                >
                  {w.name}
                  <span className="text-[10px]">GET</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full rounded-lg border hairline py-3 text-[13px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1 text-[15px]" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

/**
 * The signing screen. The brief scores this directly, so it states in plain
 * language what happens, what it costs, what you get, and what could go wrong.
 */
function SignSheet({
  onCancel,
  onConfirm,
  minting,
  moodLabel,
  wallet,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  minting: boolean;
  moodLabel: string;
  wallet: string;
}) {
  const total = EST_RENT_SOL + EST_FEE_SOL;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-5">
      <div className="card w-full sm:max-w-md p-5 rounded-b-none sm:rounded-2xl rise max-h-[92vh] overflow-y-auto">
        <div className="label">Before you sign</div>
        <h2 className="mt-2 text-[19px]">Create one Moodmint</h2>

        <Row k="What happens">
          One Metaplex Core NFT is created and sent to your wallet on Solana devnet.
        </Row>
        <Row k="What you get">
          A mascot that currently reads {moodLabel}. Its artwork is generated on request, so it will
          change as the market changes.
        </Row>
        <Row k="What it costs">
          About {EST_RENT_SOL} SOL of account rent plus about {EST_FEE_SOL} SOL network fee, roughly{" "}
          {total.toFixed(6)} SOL in total. All devnet, all free to obtain. Your wallet will show the
          exact amount before you approve.
        </Row>
        <Row k="Moodmint's cut">Nothing. There is no platform fee and no royalty.</Row>
        <Row k="Permissions">
          None beyond creating this one NFT. No token approvals, no authority over anything you
          already hold, and nothing can be moved out of your wallet by this app.
        </Row>
        <Row k="What could go wrong">
          Devnet is periodically reset, which would remove the NFT. If the price feed is down the
          mascot holds a neutral face rather than inventing a number. Because the image is drawn on
          request, it needs this app online to display.
        </Row>

        <div className="mt-4 pt-3 border-t hairline text-[11px] text-[color:var(--muted)] break-all">
          Signing as {wallet || "-"}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            disabled={minting}
            className="rounded-lg border hairline py-3 text-[13px] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={minting}
            className="rounded-lg bg-white text-black py-3 text-[13px] disabled:opacity-40"
          >
            {minting ? "Waiting for wallet..." : "Approve in wallet"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <div className="label">{k}</div>
      <p className="mt-1 text-[12px] leading-relaxed">{children}</p>
    </div>
  );
}
