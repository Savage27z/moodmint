"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

/** The slice of Phantom's injected provider we rely on. */
export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
  on: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana as PhantomProvider;
  if (w.solana?.isPhantom) return w.solana as PhantomProvider;
  return null;
}

export function usePhantom() {
  const [provider, setProvider] = useState<PhantomProvider | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const p = getProvider();
    setProvider(p);
    setInstalled(!!p);
    if (!p) return;

    // Reconnect silently if this site was already approved.
    p.connect({ onlyIfTrusted: true })
      .then(({ publicKey }) => setPublicKey(publicKey))
      .catch(() => {
        /* not previously trusted; user will connect manually */
      });

    const onConnect = (pk: PublicKey) => setPublicKey(pk);
    const onDisconnect = () => setPublicKey(null);
    const onAccountChanged = (pk: PublicKey | null) => setPublicKey(pk ?? null);

    p.on("connect", onConnect);
    p.on("disconnect", onDisconnect);
    p.on("accountChanged", onAccountChanged);
    return () => {
      p.removeListener?.("connect", onConnect);
      p.removeListener?.("disconnect", onDisconnect);
      p.removeListener?.("accountChanged", onAccountChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = provider ?? getProvider();
    if (!p) {
      window.open("https://phantom.app/download", "_blank", "noopener");
      return;
    }
    setConnecting(true);
    try {
      const { publicKey } = await p.connect();
      setPublicKey(publicKey);
    } catch {
      /* user dismissed the wallet prompt */
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    try {
      await provider?.disconnect();
    } finally {
      setPublicKey(null);
    }
  }, [provider]);

  return { provider, publicKey, connect, disconnect, connecting, installed };
}
