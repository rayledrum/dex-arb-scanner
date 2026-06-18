import { Connection, PublicKey } from '@solana/web3.js';

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export interface DiscoveredToken {
  mint: string;
  symbol: string;
  source: 'holding' | 'trade';
  wallet: string;
  balance?: number;
}

/** Minimum raw token amount to consider a meaningful holding.
 *  For 6-decimal tokens (USDC) this is $1; for 9-decimal tokens this is ~0.001.
 *  High threshold avoids dust from thousands of tiny positions. */
const MIN_HOLD_AMOUNT = 1_000_000;

/** Get tokens currently held by a wallet (fast, single RPC call). */
export async function getHeldTokens(
  conn: Connection,
  walletAddr: string,
): Promise<DiscoveredToken[]> {
  const pk = new PublicKey(walletAddr);
  try {
    const accounts = await conn.getTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM });
    return accounts.value
      .map(acc => {
        const data = acc.account.data;
        const mint = new PublicKey(data.slice(0, 32)).toBase58();
        const amount = Number(data.readBigUInt64LE(64));
        return { mint, balance: amount, source: 'holding' as const, wallet: walletAddr, symbol: '' };
      })
      .filter(t => t.balance !== undefined && t.balance >= MIN_HOLD_AMOUNT);
  } catch (e) {
    return [];
  }
}

/** Get tokens from recent transactions (rate-limited, use sparingly). */
export async function getTradeTokens(
  conn: Connection,
  walletAddr: string,
  limit = 8,
): Promise<DiscoveredToken[]> {
  const pk = new PublicKey(walletAddr);
  const seen = new Set<string>();
  const results: DiscoveredToken[] = [];

  try {
    const sigs = await conn.getSignaturesForAddress(pk, { limit });
    for (const sig of sigs) {
      await sleep(500);
      try {
        const tx = await conn.getTransaction(sig.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) continue;
        const preBalances = tx.meta?.preTokenBalances || [];
        const postBalances = tx.meta?.postTokenBalances || [];
        const preMints = new Set(preBalances.map(b => b.mint).filter(Boolean));

        for (const b of postBalances) {
          if (!b.mint || seen.has(b.mint)) continue;
          seen.add(b.mint);
          const isNew = !preMints.has(b.mint);
          const amount = Number(b.uiTokenAmount?.uiAmount || 0);
          // Include both tokens that appeared (bought) and those traded
          if (isNew || amount > 0) {
            results.push({
              mint: b.mint,
              symbol: '',
              source: isNew ? 'trade' : 'holding',
              wallet: walletAddr,
              balance: amount,
            });
          }
        }
      } catch {
        // rate limited or timeout, skip
      }
    }
  } catch {}

  return results;
}

export async function fetchSymbol(mint: string): Promise<string> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${mint}`);
    const data: any = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      return data.pairs[0].baseToken?.symbol || data.pairs[0].quoteToken?.symbol || '';
    }
  } catch {}
  return '';
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
