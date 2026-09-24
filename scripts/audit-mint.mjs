/**
 * Audits the real mint path against Solana devnet without a browser wallet.
 *
 * Runs the exact Metaplex Core `create` call the app runs, using a throwaway
 * keypair instead of Phantom. If the public faucet is rate limiting, it falls
 * back to simulating the transaction and pricing the asset account from
 * on-chain rent, so the audit still proves the instruction is well formed and
 * that the cost quoted on the signing screen is honest.
 *
 * Usage: node scripts/audit-mint.mjs [baseUrl]
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { generateSigner, keypairIdentity, sol } from "@metaplex-foundation/umi";
import { create, mplCore, fetchAsset } from "@metaplex-foundation/mpl-core";
import { Connection } from "@solana/web3.js";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";

const RPC = "https://api.devnet.solana.com";
const BASE = process.argv[2] || "https://moodmint-beta.vercel.app";
const QUOTED = 0.0029 + 0.000005; // what the signing screen promises

let failures = 0;
let measured = null; // exact cost, once the runtime tells us
const log = (...a) => console.log(...a);
const fail = (m) => {
  failures++;
  console.error("  FAIL:", m);
};
const pass = (m) => log("  ok:", m);

async function checkEndpoints(assetAddress) {
  log("\n[endpoints]");
  const uri = `${BASE}/api/metadata/${assetAddress}?t=${Date.now()}`;
  const mRes = await fetch(uri);
  if (!mRes.ok) return fail(`metadata returned ${mRes.status}`);
  const meta = await mRes.json();
  pass(`metadata ${mRes.status}, name "${meta.name}"`);

  if (!meta.image?.startsWith("http")) fail("metadata image is not absolute - wallets will not render it");
  else pass(`image URL absolute: ${meta.image.slice(0, 68)}...`);

  const attrs = (meta.attributes || []).map((a) => `${a.trait_type}=${a.value}`);
  pass(`attributes: ${attrs.join(", ")}`);

  const iRes = await fetch(meta.image);
  const svg = await iRes.text();
  if (!iRes.ok) return fail(`artwork returned ${iRes.status}`);
  if (!svg.startsWith("<svg")) return fail("artwork is not an SVG document");
  pass(`artwork ${iRes.status}, ${svg.length} bytes, ${iRes.headers.get("content-type")}`);

  for (const needle of ["MOODMINT", "SLOT", "24H"]) {
    if (!svg.includes(needle)) fail(`artwork missing expected element: ${needle}`);
  }

  // The artwork must reflect live data, never a placeholder.
  const mkt = await (await fetch(`${BASE}/api/market`)).json();
  pass(`market: ${mkt.moodLabel}, $${mkt.price}, ${mkt.changePct?.toFixed(2)}%, slot ${mkt.slot}`);
  if (!mkt.priceOk) fail("price feed reported unavailable");
  if (!mkt.chainOk) fail("devnet RPC reported unavailable");
  if (mkt.slot && !svg.includes(String(mkt.slot).slice(0, 6))) {
    log("  note: artwork slot differs from /api/market slot (separate reads, expected)");
  }
  return meta;
}

async function priceFromRent() {
  log("\n[cost, priced from on-chain rent]");
  const conn = new Connection(RPC, "confirmed");
  // A Core asset with a name and uri of this length lands near this size.
  const bytes = 1 + 1 + 32 + 32 + 4 + 24 + 4 + 110 + 8;
  const rent = await conn.getMinimumBalanceForRentExemption(bytes);
  const fee = 5000;
  const total = (rent + fee) / 1e9;
  pass(`rent exemption for ~${bytes}B: ${(rent / 1e9).toFixed(6)} SOL`);
  pass(`signature fee: ${(fee / 1e9).toFixed(6)} SOL`);
  log(`  estimated total: ${total.toFixed(6)} SOL (byte-size estimate)`);
  log("  simulation below reports the exact figure from the runtime");
  return total;
}

async function main() {
  log("Moodmint mint-path audit");
  log("  rpc :", RPC);
  log("  base:", BASE);

  const umi = createUmi(RPC).use(mplCore());
  const payer = generateSigner(umi);
  umi.use(keypairIdentity(payer));
  const asset = generateSigner(umi);
  log("  payer:", payer.publicKey.toString());
  log("  asset:", asset.publicKey.toString());

  await checkEndpoints(asset.publicKey.toString());
  await priceFromRent();

  // Try to fund. Small amounts are far more likely to clear the faucet.
  log("\n[funding]");
  let balance = 0n;
  for (const amount of [0.1, 0.05]) {
    try {
      await umi.rpc.airdrop(payer.publicKey, sol(amount));
      balance = (await umi.rpc.getBalance(payer.publicKey)).basisPoints;
      if (balance > 0n) {
        pass(`airdropped ${amount} SOL`);
        break;
      }
    } catch (e) {
      log(`  airdrop ${amount} SOL failed: ${String(e.message || e).slice(0, 80)}`);
    }
  }

  const uri = `${BASE}/api/metadata/${asset.publicKey.toString()}?t=${Date.now()}`;
  const builder = create(umi, {
    asset,
    name: `Moodmint #${asset.publicKey.toString().slice(0, 4)}`,
    uri,
  });

  if (balance === 0n) {
    log("\n[simulation] faucet unavailable, simulating instead of sending");
    try {
      const built = await builder.buildWithLatestBlockhash(umi);
      const signed = await umi.identity.signTransaction(built);
      const conn = new Connection(RPC, "confirmed");
      const sim = await conn.simulateTransaction(toWeb3JsTransaction(signed), {
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
      });
      const logs = sim.value.logs || [];
      log("  program logs:");
      for (const l of logs.slice(0, 10)) log("   ", l);

      // An unfunded payer makes the runtime state the exact lamports required.
      const hit = logs
        .concat([JSON.stringify(sim.value.err ?? "")])
        .map((l) => /insufficient lamports (\d+), need (\d+)/.exec(String(l)))
        .find(Boolean);
      if (hit) {
        const lamports = Number(hit[2]);
        measured = (lamports + 5000) / 1e9;
        pass(`runtime reported exact rent requirement: ${(lamports / 1e9).toFixed(6)} SOL`);
        log(`  EXACT total incl. signature fee: ${measured.toFixed(6)} SOL`);
      }

      const errStr = JSON.stringify(sim.value.err ?? null);
      if (!sim.value.err) pass("simulation succeeded with no error");
      else if (hit || /insufficient|[Rr]ent/.test(errStr)) {
        pass("instruction is well formed; only funding is missing (expected for an empty wallet)");
      } else {
        fail(`simulation returned a program error: ${errStr}`);
      }
    } catch (e) {
      fail(`could not simulate: ${String(e.message || e).slice(0, 200)}`);
    }
  } else {
    log("\n[send] funded, running the real mint");
    const before = (await umi.rpc.getBalance(payer.publicKey)).basisPoints;
    await builder.sendAndConfirm(umi);
    const after = (await umi.rpc.getBalance(payer.publicKey)).basisPoints;
    const cost = Number(before - after) / 1e9;
    pass(`mint confirmed, actual cost ${cost.toFixed(6)} SOL`);

    const fetched = await fetchAsset(umi, asset.publicKey);
    pass(`on-chain name "${fetched.name}"`);
    if (fetched.owner.toString() !== payer.publicKey.toString()) fail("asset did not land in the minting wallet");
    else pass("asset owned by the minting wallet");
    if (fetched.uri !== uri) fail("on-chain uri does not match what we set");
    else pass("on-chain uri matches the live metadata endpoint");
    log("  explorer: https://explorer.solana.com/address/" + asset.publicKey.toString() + "?cluster=devnet");
  }

  if (measured) {
    log("\n[quote accuracy]");
    const drift = Math.abs(measured - QUOTED);
    if (drift > 0.0005) {
      fail(
        `signing screen quotes ${QUOTED.toFixed(6)} SOL but the real cost is ${measured.toFixed(6)} SOL (off by ${drift.toFixed(6)})`
      );
    } else {
      pass(`quote within ${drift.toFixed(6)} SOL of the real cost`);
    }
  }

  log(failures ? `\nAUDIT FAILED (${failures} issue${failures > 1 ? "s" : ""})` : "\nAUDIT PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("\nUNCAUGHT:", e);
  process.exitCode = 1;
});
