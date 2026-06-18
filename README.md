# DEX Arb Scanner

Real-time Solana arbitrage scanner across Raydium, Orca, and Meteora.

## How It Works

- **WebSocket vault subscriptions** on top Raydium SOL/USDC pools for sub-second price updates
- **DexScreener polling** for 848+ tracked tokens (15s cycle)
- **Shared price cache** — both WS pushes and DexScreener polls feed into it
- **Instant arb check** on every WS price change
- **Paper trading** — 10 SOL capital, 0.5% min spread, 0.1% slippage, 0.06% fees

## Quick Start

```bash
npm install
npm run build
node dist/index.js
```

## Output

- `⚡ TRADE` lines for each paper trade
- Spread table with top arb opportunities
- PnL summary box

## Config

Edit settings in `src/index.ts` and `src/simulator.ts`:

| Setting | Default |
|---|---|
| Min spread | 0.5% |
| Max spread | 5% |
| Min liquidity | $1,000 |
| Capital | 10 SOL |
| Max trade size | 20% of capital, 5 SOL cap |
| Slippage | 0.1% |
| Fees | 0.06% |

## Token Discovery

On startup, reads holdings from known wallets to build a token tracker (~800 tokens). Top 50 Raydium pools auto-discovered for real-time WS subscriptions.
