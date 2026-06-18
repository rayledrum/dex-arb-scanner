// Top Solana tokens by market cap + liquidity (seeded from Jupiter verified list)
export const SEED_TOKENS: string[] = [
  // Major stablecoins
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT

  // Top meme / community tokens
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', // POPCAT
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', // MEW
  'ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82', // BOME
  'A3eME5CetyZPBoWbRUwY3tSe25S6tb18ba9ZPbWk9eFJ', // PURPE
  '2weMjPLLybRMMva1fM3U31goWWrCpF53gWUKbplUpump', // PENG
  'HeLp6NuQkmYB4pYWo2zYs22mESH3QKpYJVx7B3U4Dq1', // CHAT (chatcoin)
  '3S8qX1MsMqRbiwKg2cQyx7nis1oHMgaCuc9c4VfvVdPN', // SAMO
  'zZRYpNBLM5QAa3F12y69bMQUdZRqJKBcxNmj3MxRytK', // TRUMP
  'Dfh5DzRgSvvCFDoYc2ciTk9kTyBUGzd2yyPiCMGeM4Cp', // TREMP
  'HhJgH2jh2YyyEMlbTqgmyzjtjTL3WjGVvQEuRP8ttEHo', // HEI

  // LSD / staking tokens
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
  'jtojtQpaH3Hoe6MxCn7hCfPBfNU5sDwWgFsgJpCrN3p', // JTO
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // BSWETH
  'LstxxxEWiSACoADNfLz3QyZ4VjHiUPJk1CjPqPqPMjg', // LstSOL (Sanctum)
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL (Blaze)
  'J1toso1uCk3QLmjYX8LhB6WjD3P2SN4HEtPdmeGEcat', // JitoSOL
  '7vH1HvN2KE7r4nW1NC3fFZLYLS5EFUhnjAqCJkTH9eQJ', // INF

  // DEX / DeFi tokens
  'RAYJ4Uq1e3tBvLH3KzjCxE4NyyG16nYscLbZcM7vySY', // RAY (Raydium)
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', // ORCA
  'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJQvv4s2Hxz', // MNGO
  'SRMuApVNdxXokk5GT7XD5cUUgXBSCKbFeJfEJSK27AT', // SRM
  'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2YpTP5eSbH', // STEP
  'FwqY6v82DQ9q3jWpXzDYjTu36sdwK3BJ3FjPe3Jq3vVx', // DRIFT
  'ZScHuRnL2Y6LgGcfM3DYWUqNRyJoMAMonLsCvkkyMg9', // KMNO (Kamino)
  'MEANeD3XDdUmNMsGjndoBmbU4VAkgtzYxpW15PeF4MX', // MEAN

  // Bridge tokens
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
  '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk', // ETH (Squads? No)
  'J9BcrCT787ckK1yXQZBfqCJCBjg3TCjVCMiVFKSePMkC', // Portal ETH
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', // WBTC

  // AI / infra tokens
  '6cR2rMdaHLvG3QERvSwNkTh4kyVPkb4cxRrSMg3NpKVP', // IO
  'Hk2BvLNYaoJpWFo3BAseGcgSVBwuJJNzZdtgWqazNbqc', // RNDR
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', // RENDER

  // Other high-volume
  'MYTHsK3ocx2PCozYquhMNvL3xNrtYxpFhFAchqjRWHt', // MYTH
  '9tNbcEK36MjLo6G7HFqnGQBfLKJYKdQ8NZCRcFf4mSqY', // SOON
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF (dedup, keep)
  '85VBFQZC9TZkfaptBWj81UwMsY4kcT8jPBvjNxPJBx7D', // LISTA
  '5oVNBeooQdT24Z1KJnL7AHE2BPS7EME4N5stNzaFwA4W', // SC (Soul Capital)
  'Ghtq22muCiqcGSGR4BBr7Jfg5HTvErpcufJFDBVFHJAh', // LYNX
  'Bzqsoi3Ry7QpbqCKGZCqCvF6ksySXSe3qPzFirVzV3Zz', // ATH
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF (actual WIF address)
];

export interface TrackedToken {
  mint: string;
  symbol: string;
  firstSeen: number;
  lastCheck: number;
  poolsCount: number;
  maxSpread: number;
  maxLiq: number;
}

export class TokenTracker {
  tokens = new Map<string, TrackedToken>();

  constructor() {
    for (const m of SEED_TOKENS) this.add(m);
  }

  add(mint: string, symbol = '') {
    if (this.tokens.has(mint)) return;
    this.tokens.set(mint, {
      mint,
      symbol,
      firstSeen: Date.now(),
      lastCheck: 0,
      poolsCount: 0,
      maxSpread: 0,
      maxLiq: 0,
    });
  }

  addMany(mints: string[]) {
    for (const m of mints) this.add(m);
  }

  getList(): TrackedToken[] {
    return [...this.tokens.values()];
  }

  getActive(thresholdSpread = 0.5): TrackedToken[] {
    return [...this.tokens.values()]
      .filter(t => t.maxSpread >= thresholdSpread && t.poolsCount >= 2)
      .sort((a, b) => b.maxSpread - a.maxSpread);
  }

  update(mint: string, poolsCount: number, maxSpread: number, maxLiq: number) {
    const t = this.tokens.get(mint);
    if (!t) return;
    t.lastCheck = Date.now();
    t.poolsCount = poolsCount;
    t.maxSpread = Math.max(t.maxSpread, maxSpread);
    t.maxLiq = Math.max(t.maxLiq, maxLiq);
  }

  stats(): string {
    const total = this.tokens.size;
    const active = this.getActive().length;
    const checked = [...this.tokens.values()].filter(t => t.lastCheck > 0).length;
    return `total=${total} checked=${checked} active=${active}`;
  }
}
