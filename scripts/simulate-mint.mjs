/**
 * Proves the mint instruction actually executes on devnet, without needing a
 * funded wallet or the faucet.
 *
 * Simulation does not verify signatures and moves no funds, so we can borrow an
 * already-funded devnet account as the fee payer purely to satisfy the runtime's
 * rent check. Nothing is signed, nothing is sent, and no balance changes. What
 * we learn is whether the Metaplex Core `create` call the app builds is valid
 * and what it really costs.
 *
 * Usage: node scripts/simulate-mint.mjs [baseUrl]
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { generateSigner, publicKey, signerIdentity, createNoopSigner } from "@metaplex-foundation/umi";
import { create, mplCore } from "@metaplex-foundation/mpl-core";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";
import { Connection, SystemProgram, PublicKey } from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const BASE = process.argv[2] || "https://moodmint-beta.vercel.app";

const log = (...a) => console.log(...a);
let failures = 0;
const fail = (m) => {
  failures++;
  console.error("  FAIL:", m);
};
const pass = (m) => log("  ok:", m);

/**
 * Finds a funded, system-owned devnet account to borrow as fee payer.
 * Validator identity accounts fit and cost one cheap RPC call, unlike
 * getLargestAccounts which the public endpoint rate limits hard.
 */
async function findFundedPayer(conn) {
  const votes = await conn.getVoteAccounts();
  const candidates = [...votes.current, ...votes.delinquent].slice(0, 12);
  for (const v of candidates) {
    try {
      const pk = new PublicKey(v.nodePubkey);
      const info = await conn.getAccountInfo(pk);
      if (info && info.owner.equals(SystemProgram.programId) && info.lamports > 5e8) {
        return { address: pk, lamports: info.lamports };
      }
    } catch {
      /* try the next validator */
    }
  }
  return null;
}

async function main() {
  log("Moodmint mint simulation (no funds, no signatures, nothing sent)");
  const conn = new Connection(RPC, "confirmed");

  const borrowed = await findFundedPayer(conn);
  if (!borrowed) {
    fail("could not find a funded devnet account to borrow as fee payer");
    return;
  }
  log("  borrowed fee payer:", borrowed.address.toString(), `(${(borrowed.lamports / 1e9).toFixed(2)} SOL)`);

  const umi = createUmi(RPC).use(mplCore());
  const payer = createNoopSigner(publicKey(borrowed.address.toString()));
  umi.use(signerIdentity(payer));

  const asset = generateSigner(umi);
  const uri = `${BASE}/api/metadata/${asset.publicKey.toString()}?t=${Date.now()}`;
  log("  asset:", asset.publicKey.toString());

  const built = await create(umi, {
    asset,
    name: `Moodmint #${asset.publicKey.toString().slice(0, 4)}`,
    uri,
  }).buildWithLatestBlockhash(umi);

  const web3Tx = toWeb3JsTransaction(built);
  const sim = await conn.simulateTransaction(web3Tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [asset.publicKey.toString()] },
  });

  log("\n  program logs:");
  for (const l of sim.value.logs || []) log("   ", l);

  if (sim.value.err) {
    fail(`simulation error: ${JSON.stringify(sim.value.err)}`);
  } else {
    pass("mint instruction executed successfully against devnet");
  }

  const created = sim.value.accounts?.[0];
  if (created) {
    const size = Buffer.from(created.data[0], "base64").length;
    const rent = await conn.getMinimumBalanceForRentExemption(size);
    const total = (rent + 5000) / 1e9;
    pass(`asset account created in simulation: ${size} bytes, owner ${created.owner}`);
    log(`  EXACT rent for that size: ${(rent / 1e9).toFixed(6)} SOL`);
    log(`  EXACT total incl. fee   : ${total.toFixed(6)} SOL`);

    const quoted = 0.0018 + 0.000005;
    const drift = Math.abs(total - quoted);
    log(`  signing screen quotes   : ${quoted.toFixed(6)} SOL`);
    if (drift > 0.0005) fail(`quote is off by ${drift.toFixed(6)} SOL`);
    else pass(`quote within ${drift.toFixed(6)} SOL of the real cost`);
  } else {
    log("  note: simulation returned no account snapshot, cost not measured this run");
  }

  log(failures ? `\nSIMULATION FAILED (${failures})` : "\nSIMULATION PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("UNCAUGHT:", e);
  process.exitCode = 1;
});
