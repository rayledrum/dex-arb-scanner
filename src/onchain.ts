import { Connection, PublicKey } from '@solana/web3.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

// ── Known Raydium AMM Pools (curated from on-chain data) ──

interface PoolEntry {
  id: string;
  baseVault: string;
  quoteVault: string;
}

const KNOWN_RAYDIUM_POOLS: Record<string, PoolEntry> = {
  // SOL pairs
  [`7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj|${SOL_MINT}`]: { id: '9f4FtV6iFjZGiGWECcA3EEJZTaSxsnCUYFmDNKMQWBb', baseVault: '7nvSNUqNYsrYNdYMoG2Edu6BYxpfP4QaybBH3A6DGqxV', quoteVault: '3PiJv15KpT5mW5mEn5rrz3TAPjGAYCMUZpFGLj6nBFLB' },
  [`mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So|${SOL_MINT}`]: { id: '9aZaeJSA5ZF4LG4uKRM4kyUBk4FGptDFEHaJTjr4KCKk', baseVault: 'FmG6jDcH5u5NvVWvvMbrKjPK8g6PcEdftrbct5Hy5yYT', quoteVault: '9e1LfWLsMEcHRMdkRRPYH4Vf48JRzuCSUh79gCgqf8sf' },
  [`JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN|${SOL_MINT}`]: { id: 'GcJg3eHx2HmFjCYAo34zFnNK6BwABAMjCbBzJ1P4jFGs', baseVault: 'DW9ZvdSMKgCP7E5Asx3khLAmTNKxGHNCXjFMbZAr7NLi', quoteVault: 'B2ESckBnvDqMAGefyFVHDCsXn6bhhWVWJqjQHLhM4BkE' },
  [`DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263|${SOL_MINT}`]: { id: '2nJuYaW3S7fW8jnrcmsHdkF14mBfbE4JfmM9ZRhWQ8GV', baseVault: '6Y1pG8QQF1vPjEdHtKXEvJqY6AvUPwdCZPHEfGqKKcKc', quoteVault: '8KBKGkrrLS8MsZp6EXXYy71PbxZKQYePWKw3RDo8gfmE' },
  [`EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm|${SOL_MINT}`]: { id: '2FaDcb3TnQPKnd7QLkkYPPBUBwnbVJ7jjv8snrp4KKxi', baseVault: 'HRbCwGX32TbGRjx7mCFsUmdWQkVyRDXQcQGRuYsBZ3Uc', quoteVault: 'AykLaELvKjEksVVQhBmNgfmwBSRgWexQy1p5B17Hj1F1' },
  [`7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr|${SOL_MINT}`]: { id: 'Hx6PJXxNfnBf3EMimAwNHKApwBJPK1CNX9NW1rNQ4Bwe', baseVault: '5YK3wrVaFC8GEdqTjBGNVdG9NToFQ52YK2CzqcBC95V8', quoteVault: 'v3GQZBkCJWKCdGq1gxCVuTa6YSrAYDJsxCDQk7M6N1k' },

  // USDC pairs
  [`mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So|${USDC_MINT}`]: { id: 'ZfvDXXUh3zQTqH1FPMVYjAXpTy3ZfuGcFYj1WjMfN4r', baseVault: '8JUjWjAyYfgf9JBmNhYRNBcmArshRAFCf2K9h5eNyJ3T', quoteVault: 'DaXyxj42DxqN8hAqjpN82RKV3fDoBWPqREcErFEX3BxW' },
  [`JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN|${USDC_MINT}`]: { id: '7BhFm3TAz5nxcVaSjHeLKDsFF16FYSvLtASaMFHqLSN', baseVault: 'KFdp5YUwCXFa3bCJfSZuLWFbKtCNH4QkVWWELTdC7Xh', quoteVault: 'DpD6Yt3dsWKJRGGhZYJaCJXf5tsQCK6aYbBqEs26SpVN' },
};

export { KNOWN_RAYDIUM_POOLS };

// ── Batch Price Reading ──────────────────────────────

export interface OnchainPrice {
  poolId: string;
  dex: string;
  baseMint: string;
  quoteMint: string;
  priceUsd: number;
  liquidityUsd: number;
  label: string;
}

/** Decode token account amount from raw account data (offset 64, u64). */
function decodeTokenAmount(data: Buffer): number {
  try {
    const raw = data.readBigUInt64LE(64);
    return Number(raw);
  } catch { return 0; }
}

/** Get token account decimals from the mint's data (offset 44, u8). */
function decodeTokenDecimals(data: Buffer): number {
  try {
    return data.readUInt8(44);
  } catch { return 0; }
}

/** Decode UI amount from a token account's raw data using mint decimals. */
function decodeUiAmount(acctData: Buffer, mintData?: Buffer): number {
  const raw = decodeTokenAmount(acctData);
  const decimals = mintData ? decodeTokenDecimals(mintData) : 9;
  return raw / Math.pow(10, decimals);
}

/** Read multiple Raydium pool vault balances in a single RPC batch call. */
export async function readRaydiumPrices(
  conn: Connection,
  mint: string,
  solPrice: number,
): Promise<OnchainPrice[]> {
  // Find pools involving this mint
  const relevantPools: { key: string; pool: PoolEntry; isBase: boolean }[] = [];

  for (const [key, pool] of Object.entries(KNOWN_RAYDIUM_POOLS)) {
    const [base, quote] = key.split('|');
    if (base === mint) {
      relevantPools.push({ key, pool, isBase: true });
    } else if (quote === mint) {
      relevantPools.push({ key, pool, isBase: false });
    }
  }

  if (relevantPools.length === 0) return [];

  // Collect all vault addresses to read
  const vaultKeys = relevantPools.flatMap(p => [
    new PublicKey(p.isBase ? p.pool.baseVault : p.pool.quoteVault),
    new PublicKey(p.isBase ? p.pool.quoteVault : p.pool.baseVault),
  ]);

  // Also collect mint account addresses for decimals
  const mintKeys = relevantPools.map(p =>
    new PublicKey(p.isBase ? p.key.split('|')[1] : p.key.split('|')[0])
  );

  try {
    // Single batch RPC call for all vaults + mints
    const allKeys = [...vaultKeys, ...mintKeys];
    const accounts = await conn.getMultipleAccountsInfo(allKeys);

    const results: OnchainPrice[] = [];

    for (let i = 0; i < relevantPools.length; i++) {
      const p = relevantPools[i];
      const vaultThis = accounts[i * 2];
      const vaultOther = accounts[i * 2 + 1];
      const mintInfo = accounts[vaultKeys.length + i];

      if (!vaultThis || !vaultOther) continue;

      const poolMint = p.isBase ? p.key.split('|')[0] : p.key.split('|')[1];
      const otherMint = p.isBase ? p.key.split('|')[1] : p.key.split('|')[0];

      // Skip if pool isn't for the requested mint
      if (poolMint !== mint) continue;

      const thisAmt = decodeUiAmount(vaultThis.data, mintInfo?.data);
      const otherAmt = decodeUiAmount(vaultOther.data);

      if (thisAmt <= 0 || otherAmt <= 0) continue;

      let priceUsd = 0;
      let liqUsd = 0;

      if (otherMint === SOL_MINT) {
        priceUsd = (otherAmt / thisAmt) * solPrice;
        liqUsd = otherAmt * solPrice;
      } else if (otherMint === USDC_MINT) {
        priceUsd = otherAmt / thisAmt;
        liqUsd = otherAmt;
      } else {
        continue;
      }

      results.push({
        poolId: p.pool.id,
        dex: 'raydium',
        baseMint: mint,
        quoteMint: otherMint,
        priceUsd,
        liquidityUsd: liqUsd,
        label: `raydium:${mint.slice(0, 4)}..`,
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ── Orca Whirlpools ────────────────────────────────────

export interface OrcaPoolRaw {
  name: string;
  poolAccount: string;
  tokenAAmount: number;
  tokenBAmount: number;
}

export async function fetchOrcaPoolList(): Promise<OrcaPoolRaw[]> {
  const res = await fetch('https://api.orca.so/allPools', {
    signal: AbortSignal.timeout(10_000),
  });
  const data: Record<string, any> = await res.json();
  return Object.entries(data).map(([name, p]: [string, any]) => ({
    name,
    poolAccount: p.poolAccount,
    tokenAAmount: Number(p.tokenAAmount) || 0,
    tokenBAmount: Number(p.tokenBAmount) || 0,
  }));
}

// ── Helpers ─────────────────────────────────────────────

export function onchainPricesToPoolInfos(
  prices: OnchainPrice[],
): any[] {
  return prices.map(p => ({
    dex: p.dex,
    pairAddress: p.poolId,
    baseMint: p.baseMint,
    quoteMint: p.quoteMint,
    priceUsd: p.priceUsd,
    priceNative: 0,
    liquidityUsd: p.liquidityUsd,
    fdv: 0,
    url: '',
    label: p.label,
  }));
}

// ── Raydium Pool Auto-Discovery ────────────────────────────

export interface RaydiumPoolRaw {
  key: string;
  baseMint: string;
  quoteMint: string;
  poolId: string;
  baseVault: string;
  quoteVault: string;
  liquidityUsd: number;
}

/** Raydium v4 AMM pool offset constants */
const RAYDIUM_V4_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

/**
 * Read baseVault + quoteVault from a Raydium v4 AMM pool account.
 * Layout: poolCoinVault at offset 192, poolPcVault at offset 224 (Pubkey = 32 bytes each)
 */
function parseRaydiumVaults(poolData: Buffer): { baseVault: string; quoteVault: string } | null {
  try {
    const baseVault = new PublicKey(poolData.subarray(192, 224)).toBase58();
    const quoteVault = new PublicKey(poolData.subarray(224, 256)).toBase58();
    return { baseVault, quoteVault };
  } catch {
    return null;
  }
}

export async function discoverRaydiumPools(
  conn: Connection,
  seedMints: string[],
  maxPools = 50,
): Promise<RaydiumPoolRaw[]> {
  const seenPoolIds = new Set<string>();
  const foundPools: { key: string; poolId: string }[] = [];

  // Scan seed mints in parallel (fast, rate limit is per-IP not per-call)
  const results = await Promise.allSettled(
    seedMints.map(mint =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${mint}`)
        .then(r => r.json())
        .then(d => (d.pairs || []).filter((p: any) =>
          p.chainId === 'solana' && p.dexId === 'raydium' &&
          [SOL_MINT, USDC_MINT].includes(p.quoteToken?.address || '')
        ))
    )
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const p of result.value) {
      const poolId: string = p.pairAddress || '';
      if (!poolId || seenPoolIds.has(poolId)) continue;
      seenPoolIds.add(poolId);
      const baseMint: string = p.baseToken?.address || '';
      const quoteMint: string = p.quoteToken?.address || '';
      if (!baseMint || !quoteMint) continue;
      foundPools.push({ key: `${baseMint}|${quoteMint}`, poolId });
    }
  }

  // Read vault addresses on-chain (single batch RPC call)
  const poolsWithVaults: RaydiumPoolRaw[] = [];
  for (let i = 0; i < foundPools.length && poolsWithVaults.length < maxPools; i += 15) {
    const batch = foundPools.slice(i, i + 15);
    const pks = batch.map(p => new PublicKey(p.poolId));
    const accounts = await conn.getMultipleAccountsInfo(pks);

    for (let j = 0; j < batch.length; j++) {
      const acc = accounts[j];
      if (!acc || acc.data.length < 256) continue;
      const vaults = parseRaydiumVaults(acc.data);
      if (!vaults) continue;
      const [baseMint, quoteMint] = batch[j].key.split('|');
      poolsWithVaults.push({
        key: batch[j].key,
        baseMint,
        quoteMint,
        poolId: batch[j].poolId,
        baseVault: vaults.baseVault,
        quoteVault: vaults.quoteVault,
        liquidityUsd: 0,
      });
    }
  }

  return poolsWithVaults.slice(0, maxPools);
}

export async function fetchSolPrice(): Promise<number> {
  for (const addr of [SOL_MINT, '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs']) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${addr}`, {
        signal: AbortSignal.timeout(4_000),
      });
      const data: any = await res.json();
      if (data.pairs) {
        const solPair = data.pairs.find((p: any) =>
          p.chainId === 'solana' &&
          (p.baseToken?.symbol === 'SOL' || p.quoteToken?.symbol === 'SOL') &&
          Number(p.liquidity?.usd || 0) > 100_000
        );
        if (solPair) return Number(solPair.priceUsd);
      }
    } catch {}
  }
  return 150;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
