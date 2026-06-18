import fs from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import { fetchPools, findArb, formatSpread, ArbOpportunity } from './poolcheck';
import { TokenTracker, SEED_TOKENS } from './trackedTokens';
import { getHeldTokens, getTradeTokens, fetchSymbol } from './discover';
import {
  fetchOrcaPoolList, fetchSolPrice, KNOWN_RAYDIUM_POOLS,
  readRaydiumPrices, onchainPricesToPoolInfos, discoverRaydiumPools,
} from './onchain';
import { ArbSimulator } from './simulator';
import { subscribeRaydiumVaults, PriceUpdate } from './wsPriceFeed';

const POOLS_CACHE = 'pools.json';

function loadPoolCache(): any[] {
  try { return JSON.parse(fs.readFileSync(POOLS_CACHE, 'utf-8')); } catch { return []; }
}

function savePoolCache(pools: any[]) {
  try { fs.writeFileSync(POOLS_CACHE, JSON.stringify(pools, null, 2)); } catch {}
}

// ── Real-time shared price cache ──────────────────────────
interface CachedPrice { price: number; liq: number; ts: number }
const rtPrices = new Map<string, Map<string, CachedPrice>>();

function updateRtPrice(mint: string, dex: string, price: number, liq: number) {
  if (!rtPrices.has(mint)) rtPrices.set(mint, new Map());
  rtPrices.get(mint)!.set(dex, { price, liq, ts: Date.now() });
}

function getSymbol(mint: string, tracker: TokenTracker): string {
  return tracker.getList().find(t => t.mint === mint)?.symbol || mint.slice(0, 6);
}

function checkAndTrade(
  mint: string, tracker: TokenTracker, sim: ArbSimulator, solPriceVal: number
): boolean {
  const dexes = rtPrices.get(mint);
  if (!dexes || dexes.size < 2) return false;
  const entries = [...dexes.entries()].filter(([_, e]) => Date.now() - e.ts < 120_000);
  if (entries.length < 2) return false;

  let bestOpp: ArbOpportunity | null = null;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [dexA, a] = entries[i];
      const [dexB, b] = entries[j];
      const minP = Math.min(a.price, b.price);
      const maxP = Math.max(a.price, b.price);
      if (minP <= 0) continue;
      const spread = ((maxP - minP) / minP) * 100;
      if (spread < 0.5 || spread > 5) continue;
      bestOpp = {
        tokenMint: mint,
        symbol: getSymbol(mint, tracker),
        quoteSymbol: 'SOL',
        dexA: `${dexA}:${mint.slice(0, 4)}..`,
        dexB: `${dexB}:${mint.slice(0, 4)}..`,
        spreadPct: Math.round(spread * 100) / 100,
        priceA: a.price, priceB: b.price,
        liqA: a.liq, liqB: b.liq,
      };
    }
  }
  if (!bestOpp) return false;
  const lines = sim.evaluate([bestOpp], solPriceVal);
  if (lines.length > 0) {
    console.log(`  ── Real-time Arb ──`);
    for (const line of lines) console.log(line);
    for (const line of sim.summary()) console.log(line);
    return true;
  }
  return false;
}

const RPC_URL = 'https://api.mainnet-beta.solana.com';

const MIN_LIQ = 1000;
const MIN_SPREAD = 0.5;

const DISCOVERY_WALLETS = [
  { addr: '4GQeEya6ZTwvXre4Br6ZfDyfe2WQMkcDz2QbkJZazVqS', label: 'exec-1' },
  { addr: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', label: 'exec-2' },
];

// ── On-chain Discovery ──────────────────────────────

async function runDiscovery(connection: Connection, tracker: TokenTracker) {
  console.log('\n  ── On-Chain Discovery ──\n');

  const held1 = await getHeldTokens(connection, DISCOVERY_WALLETS[0].addr);
  console.log(`  ${DISCOVERY_WALLETS[0].label}: ${held1.length} tokens held`);

  const topHeld = [...held1].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 10);
  if (topHeld.length > 0) {
    console.log('  Top holdings:');
    for (const t of topHeld) {
      const sym = await fetchSymbol(t.mint);
      console.log(`    ${(sym || t.mint.slice(0, 8)).padEnd(12)} bal=${abbrevNum(t.balance || 0)}`);
      tracker.add(t.mint, sym);
    }
  }

  for (const t of held1) {
    if (!topHeld.some(h => h.mint === t.mint)) {
      tracker.add(t.mint);
    }
  }

  console.log(`  ${DISCOVERY_WALLETS[1].label}: scanning recent trades...`);
  const traded = await getTradeTokens(connection, DISCOVERY_WALLETS[1].addr, 6);
  const newFromTrades = traded.filter(t => !tracker.getList().some(tt => tt.mint === t.mint));
  for (const t of newFromTrades) {
    const sym = await fetchSymbol(t.mint);
    console.log(`    [trade] ${(sym || t.mint.slice(0, 8)).padEnd(12)}`);
    tracker.add(t.mint, sym);
  }

  console.log(`\n  ✓ Discovery: ${held1.length} holdings + ${newFromTrades.length} trade tokens`);
  console.log(`    Total tracked: ${tracker.getList().length} tokens\n`);
}

function abbrevNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// ── Main ─────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(62));
  console.log('  DEX Arb Scanner — Paper Trading');
  console.log('═'.repeat(62));
  console.log(`  Seed tokens: ${SEED_TOKENS.length}`);

  const connection = new Connection(RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://'),
  });

  const tracker = new TokenTracker();

  // Phase 1: Discovery
  await runDiscovery(connection, tracker);

  // Phase 2: Fetch on-chain pool lists
  console.log('  ── Loading On-Chain Pool Data ──\n');

  const solPrice = await fetchSolPrice();
  console.log(`  SOL price: ~$${solPrice.toFixed(2)}`);

  const raydiumPoolsCount = Object.keys(KNOWN_RAYDIUM_POOLS).length;
  console.log(`  Raydium AMM: ${raydiumPoolsCount} known pools (hardcoded)`);

  let orcaPoolsCount = 0;
  try {
    const orcaPools = await fetchOrcaPoolList();
    orcaPoolsCount = orcaPools.length;
    console.log(`  Orca Whirlpools: ${orcaPoolsCount} pools available`);
  } catch (e) {
    console.log('  Orca Whirlpools: failed to load');
  }

  console.log(`  Settings: minLiq=$${MIN_LIQ}  minSpread=${MIN_SPREAD}%\n`);

  // Discover Raydium pools — try cache first, then auto-discover
  let cachedPools = loadPoolCache();
  let discoveredPools: any[] = [];

  if (cachedPools.length >= 8) {
    discoveredPools = cachedPools;
    console.log(`  Loaded ${cachedPools.length} Raydium pools from cache`);
  } else {
    discoveredPools = await discoverRaydiumPools(connection, SEED_TOKENS, 50);
    savePoolCache(discoveredPools);
    console.log(`  Discovered ${discoveredPools.length} Raydium pools (saved to pools.json)`);
  }

  const allWsPools = [...Object.entries(KNOWN_RAYDIUM_POOLS).map(([key, p]) => ({
    key,
    baseMint: key.split('|')[0],
    quoteMint: key.split('|')[1],
    poolId: p.id,
    baseVault: p.baseVault,
    quoteVault: p.quoteVault,
    liquidityUsd: 0,
  })), ...discoveredPools];

  // Dedup by poolId
  const seen = new Set<string>();
  const dedupedPools = allWsPools.filter(p => {
    if (seen.has(p.poolId)) return false;
    seen.add(p.poolId);
    return true;
  });

  console.log(`  Raydium WS pools: ${dedupedPools.length} tracked`);

  const sim = new ArbSimulator();

  // Phase 3b: WebSocket price feed (real-time)
  let wsManager: { cleanup: () => void; addPools: (pools: any[]) => Promise<void> } | undefined;
  wsManager = await subscribeRaydiumVaults(connection, solPrice, (upd: PriceUpdate) => {
    updateRtPrice(upd.mint, upd.dex, upd.price, upd.liq);
    if (sim) checkAndTrade(upd.mint, tracker, sim, solPrice);
  }, dedupedPools);

  const subscribedPoolIds = new Set(dedupedPools.map(p => p.poolId));

  // Pre-cache DexScreener prices for WS-tracked tokens so arb detection fires instantly
  const wsTrackedMints = new Set<string>();
  for (const p of dedupedPools) {
    wsTrackedMints.add(p.key.split('|')[0]);
  }
  for (const mint of wsTrackedMints) {
    try {
      const dsPools = await fetchPools(mint);
      for (const p of dsPools) updateRtPrice(p.baseMint, p.dex, p.priceUsd, p.liquidityUsd);
      await sleep(400);
    } catch {}
  }
  // Trigger arb check for all WS-tracked tokens now that both sides are cached
  for (const mint of wsTrackedMints) {
    checkAndTrade(mint, tracker, sim, solPrice);
  }

  console.log('  ✓ On-chain + DexScreener price feeds');
  console.log('  ✓ WebSocket: real-time Raydium vault subscriptions');
  console.log('  ✓ Paper trader: 4 SOL initial\n');
  console.log('  Spreads update via WebSocket + 8s cycle.\n');

  // DexScreener cache to avoid repeated calls
  const dsCache = new Map<string, { data: any[]; ts: number }>();
  const DS_CACHE_TTL = 60_000; // 1 minute cache

  // Phase 4: Main check loop
  let lastPrint = 0;
  let checkIndex = 0;
  const PER_CYCLE = 25;

  while (true) {
    const list = tracker.getList();
    const all: ArbOpportunity[] = [];

    const sorted = [...list].sort((a, b) => {
      const age = Date.now() - a.lastCheck;
      if (a.maxSpread > 1) return -1;
      if (a.poolsCount === 0 && age < 600_000) return 1;
      return b.maxSpread - a.maxSpread;
    });

    const batch = sorted.slice(checkIndex % Math.max(sorted.length, 1), (checkIndex % Math.max(sorted.length, 1)) + PER_CYCLE);

    const newRaydiumPoolIds: string[] = [];

    for (let bi = 0; bi < batch.length; bi++) {
      const t = batch[bi];
      let pools: any[] = [];

      // Try on-chain first (single batched RPC call, no rate limit issue)
      const rayPrices = await readRaydiumPrices(connection, t.mint, solPrice);
      if (rayPrices.length >= 2) {
        pools = onchainPricesToPoolInfos(rayPrices);
      }

      // Supplement with DexScreener (cached)
      if (pools.length < 2) {
        const cached = dsCache.get(t.mint);
        if (cached && Date.now() - cached.ts < DS_CACHE_TTL) {
          pools = [...pools, ...cached.data];
        } else {
          await sleep(250); // delay between DexScreener calls to avoid 429
          const dsPools = await fetchPools(t.mint);
          dsCache.set(t.mint, { data: dsPools, ts: Date.now() });
          pools = [...pools, ...dsPools];
        }
      }

      // Update shared price cache from DexScreener data
      for (const p of pools) {
        updateRtPrice(p.baseMint, p.dex, p.priceUsd, p.liquidityUsd);
      }

      // Track newly discovered Raydium pools for WS subscription
      for (const p of pools) {
        if (p.dex === 'raydium' && p.pairAddress && !subscribedPoolIds.has(p.pairAddress)) {
          subscribedPoolIds.add(p.pairAddress);
          newRaydiumPoolIds.push(p.pairAddress);
        }
      }

      const opps = findArb(pools, MIN_LIQ, MIN_SPREAD);
      const maxSpread = opps.length > 0 ? Math.max(...opps.map(o => o.spreadPct)) : 0;
      const maxLiq = opps.length > 0
        ? Math.max(...opps.map(o => Math.min(o.liqA, o.liqB)))
        : (pools.length > 0 ? Math.max(...pools.map((p: any) => p.liquidityUsd || 0)) : 0);
      tracker.update(t.mint, pools.length, maxSpread, maxLiq);
      all.push(...opps);
    }

    // Subscribe to newly discovered Raydium pools for real-time WS updates
    if (newRaydiumPoolIds.length > 0 && wsManager) {
      const pks = newRaydiumPoolIds.map(id => new PublicKey(id));
      const poolAccounts = await connection.getMultipleAccountsInfo(pks);
      const newPools: any[] = [];

      for (let i = 0; i < poolAccounts.length; i++) {
        const acc = poolAccounts[i];
        if (!acc || acc.data.length < 256) continue;
        try {
          const coinMint = new PublicKey(acc.data.subarray(128, 160)).toBase58();
          const pcMint = new PublicKey(acc.data.subarray(160, 192)).toBase58();
          const coinVault = new PublicKey(acc.data.subarray(192, 224)).toBase58();
          const pcVault = new PublicKey(acc.data.subarray(224, 256)).toBase58();
          // Determine orientation: quote should be SOL or USDC
          const [baseMint, quoteMint, baseVault, quoteVault] =
            pcMint === 'So11111111111111111111111111111111111111112' || pcMint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
              ? [coinMint, pcMint, coinVault, pcVault]
              : [pcMint, coinMint, pcVault, coinVault];
          if (quoteMint !== 'So11111111111111111111111111111111111111112' && quoteMint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') continue;
          newPools.push({
            key: `${baseMint}|${quoteMint}`,
            baseMint, quoteMint,
            poolId: newRaydiumPoolIds[i],
            baseVault, quoteVault,
            liquidityUsd: 0,
          });
        } catch {}
      }

      if (newPools.length > 0) {
        await wsManager.addPools(newPools);
        // Update cache for next startup
        const cache = loadPoolCache();
        const cacheIds = new Set(cache.map((p: any) => p.poolId));
        const fresh = newPools.filter((p: any) => !cacheIds.has(p.poolId));
        if (fresh.length > 0) savePoolCache([...cache, ...fresh]);
        console.log(`  ◇ +${newPools.length} WS pools (${subscribedPoolIds.size} known)`);
      }
    }

    checkIndex = (checkIndex + PER_CYCLE) % Math.max(sorted.length, 1);

    all.sort((a, b) => b.spreadPct - a.spreadPct);

    // Paper trade simulator
    const tradeLines = sim.evaluate(all, solPrice);

    const now = Date.now();
    if (now - lastPrint >= 10_000 || all.length > 0 || tradeLines.length > 0) {
      lastPrint = now;

      console.log('\n' + '─'.repeat(62));
      console.log(`  ${new Date().toLocaleTimeString()}  ─  ${tracker.stats()}`);
      console.log('─'.repeat(62));

      // Paper trades first (if any)
      for (const line of tradeLines) {
        console.log(line);
      }

      if (all.length === 0 && tradeLines.length === 0) {
        console.log('  No arb spreads detected');
        console.log(`  Paper trades: ${sim.trades.length}`);
      } else {
        const topLabelled = all
          .map(o => ({ o, label: formatSpread(o) }))
          .filter((x, i, a) => a.findIndex(y => y.label === x.label) === i);
        for (const x of topLabelled.slice(0, 8)) {
          console.log(`  ${x.label}`);
        }
        if (all.length > 8) {
          console.log(`  ... ${all.length - 8} more`);
        }
        // Simulator summary
        for (const line of sim.summary()) {
          console.log(line);
        }
      }
    }

    await sleep(8_000);
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(console.error);
