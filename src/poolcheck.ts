export interface PoolInfo {
  dex: string;
  pairAddress: string;
  baseMint: string;
  quoteMint: string;
  priceUsd: number;
  priceNative: number;
  liquidityUsd: number;
  fdv: number;
  url: string;
  label: string;
}

export interface ArbOpportunity {
  tokenMint: string;
  symbol: string;
  quoteSymbol: string;
  dexA: string;
  dexB: string;
  spreadPct: number;
  priceA: number;
  priceB: number;
  liqA: number;
  liqB: number;
}

const KNOWN_DEXES = new Set(['raydium', 'orca', 'meteora']);

const MIN_PRICE = 0.000001;
const MAX_RATIO = 2.5; // max price ratio between same-quote pools (reject fake pools)
const MAX_SPREAD_PCT = 5; // reject spreads > 5% (likely stale/fake data)

export async function fetchPools(mint: string): Promise<PoolInfo[]> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${mint}`;
  try {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(2000); return fetchPools(mint); }
    const data: any = await res.json();
    if (!data.pairs || !Array.isArray(data.pairs)) return [];
    return data.pairs
      .filter((p: any) => p.chainId === 'solana' && KNOWN_DEXES.has(p.dexId))
      .map((p: any) => ({
        dex: p.dexId,
        pairAddress: p.pairAddress,
        baseMint: p.baseToken?.address || '',
        quoteMint: p.quoteToken?.address || '',
        priceUsd: Number(p.priceUsd) || 0,
        priceNative: Number(p.priceNative) || 0,
        liquidityUsd: Number(p.liquidity?.usd) || 0,
        fdv: Number(p.fdv) || 0,
        url: p.url,
        label: `${p.dexId}:${p.baseToken?.symbol || ''}/${p.quoteToken?.symbol || ''}`,
      }));
  } catch {
    return [];
  }
}

export function findArb(pools: PoolInfo[], minLiq = 500, minSpread = 0.3): ArbOpportunity[] {
  const valid = pools
    .filter(p => p.priceUsd >= MIN_PRICE && p.liquidityUsd >= minLiq)
    // Dedup: keep only most liquid pool per DEX per quote
    .reduce((acc, p) => {
      const key = `${p.dex}|${p.quoteMint}`;
      const existing = acc.get(key);
      if (!existing || p.liquidityUsd > existing.liquidityUsd) acc.set(key, p);
      return acc;
    }, new Map<string, PoolInfo>())
    .values();

  const arr = [...valid];
  const opps: ArbOpportunity[] = [];

  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i];
      const b = arr[j];

      // Only compare pools with the SAME quote token (e.g. both SOL, both USDC)
      if (a.quoteMint !== b.quoteMint) continue;

      const minP = Math.min(a.priceUsd, b.priceUsd);
      const maxP = Math.max(a.priceUsd, b.priceUsd);
      if (minP <= 0) continue;
      if (maxP / minP > MAX_RATIO) continue;

      const spread = ((maxP - minP) / minP) * 100;
      if (spread >= minSpread && spread <= MAX_SPREAD_PCT) {
        opps.push({
          tokenMint: a.baseMint || b.baseMint,
          symbol: a.label.split(':')[1]?.split('/')[0] || '?',
          quoteSymbol: a.label.split('/')[1] || '',
          dexA: a.label,
          dexB: b.label,
          spreadPct: Math.round(spread * 100) / 100,
          priceA: a.priceUsd,
          priceB: b.priceUsd,
          liqA: a.liquidityUsd,
          liqB: b.liquidityUsd,
        });
      }
    }
  }

  return opps.sort((a, b) => b.spreadPct - a.spreadPct);
}

export function formatSpread(o: ArbOpportunity): string {
  const dir = o.priceA > o.priceB ? 'SELL' : 'BUY';
  const pct = `${o.spreadPct.toFixed(2)}%`;
  const liq = `(${fmtLiq(Math.min(o.liqA, o.liqB))})`;

  const fmtPrice = (p: number) => {
    if (p >= 10) return `$${p.toFixed(2)}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    if (p >= 0.001) return `$${p.toFixed(6)}`;
    return `$${p.toFixed(10)}`;
  };

  const sym = `${o.symbol}/${o.quoteSymbol}`;
  return `${sym.padEnd(14)} ${pct.padStart(7)} ${dir}  ${fmtPrice(o.priceA)} → ${fmtPrice(o.priceB)}  ${liq}`;
}

function fmtLiq(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
