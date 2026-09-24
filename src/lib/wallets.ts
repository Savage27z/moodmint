"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

/**
 * The slice of an injected Solana provider we rely on. Phantom, Solflare and
 * Backpack all expose this same shape, which is also what Umi's
 * walletAdapterIdentity expects, so one interface covers every wallet without
 * pulling in the full wallet-adapter dependency tree.
 */
export interface SolanaProvider {
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
}

export interface WalletOption {
  id: string;
  name: string;
  installUrl: string;
  provider: SolanaProvider | null;
}

const LAST_USED_KEY = "moodmint:wallet";

function read(path: () => any): SolanaProvider | null {
  try {
    const p = path();
    return p && typeof p.connect === "function" && typeof p.signTransaction === "function" ? p : null;
  } catch {
    return null;
  }
}

/** Detects every supported wallet currently injected into the page. */
export function detectWallets(): WalletOption[] {
  if (typeof window === "undefined") {
    return [];
  }
  const w = window as any;
  return [
    {
      id: "phantom",
      name: "Phantom",
      installUrl: "https://phantom.app/download",
      provider: read(() => (w.phantom?.solana?.isPhantom ? w.phantom.solana : w.solana?.isPhantom ? w.solana : null)),
    },
    {
      id: "solflare",
      name: "Solflare",
      installUrl: "https://solflare.com/download",
      provider: read(() => (w.solflare?.isSolflare ? w.solflare : null)),
    },
    {
      id: "backpack",
      name: "Backpack",
      installUrl: "https://backpack.app/download",
      provider: read(() => w.backpack?.solana ?? (w.backpack?.isBackpack ? w.backpack : null)),
    },
    {
      // Anything else that injects the common interface still works.
      id: "injected",
      name: "Browser wallet",
      installUrl: "https://solana.com/ecosystem/wallets",
      provider: read(() => (w.solana && !w.solana.isPhantom ? w.solana : null)),
    },
  ];
}

export function useWallet() {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);

  const available = useMemo(() => wallets.filter((w) => w.provider), [wallets]);
  const active = useMemo(() => wallets.find((w) => w.id === activeId) ?? null, [wallets, activeId]);

  // Injected providers can arrive after first paint, so re-scan briefly.
  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const timers = [200, 600, 1500].map((ms) => setTimeout(scan, ms));
    window.addEventListener("load", scan);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("load", scan);
    };
  }, []);

  // Reconnect silently to whichever wallet was used last.
  useEffect(() => {
    if (publicKey || !available.length) return;
    const last = localStorage.getItem(LAST_USED_KEY);
    const target = available.find((w) => w.id === last) ?? null;
    if (!target?.provider) return;
    target.provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => {
        setPublicKey(publicKey);
        setActiveId(target.id);
      })
      .catch(() => {
        /* not previously trusted; the user will connect manually */
      });
  }, [available, publicKey]);

  // Track account changes and disconnects from the wallet itself.
  useEffect(() => {
    const p = active?.provider;
    if (!p?.on) return;
    const onDisconnect = () => setPublicKey(null);
    const onAccountChanged = (pk: PublicKey | null) => setPublicKey(pk ?? null);
    p.on("disconnect", onDisconnect);
    p.on("accountChanged", onAccountChanged);
    return () => {
      p.removeListener?.("disconnect", onDisconnect);
      p.removeListener?.("accountChanged", onAccountChanged);
    };
  }, [active]);

  const connect = useCallback(async (id: string) => {
    const target = detectWallets().find((w) => w.id === id);
    if (!target) return;
    if (!target.provider) {
      window.open(target.installUrl, "_blank", "noopener");
      return;
    }
    setConnecting(true);
    try {
      const res = await target.provider.connect();
      setPublicKey(res.publicKey ?? target.provider.publicKey);
      setActiveId(id);
      localStorage.setItem(LAST_USED_KEY, id);
    } catch {
      /* user dismissed the wallet prompt */
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await active?.provider?.disconnect();
    } finally {
      setPublicKey(null);
      setActiveId(null);
      localStorage.removeItem(LAST_USED_KEY);
    }
  }, [active]);

  return {
    wallets,
    available,
    active,
    provider: active?.provider ?? null,
    publicKey,
    connecting,
    connect,
    disconnect,
  };
}
