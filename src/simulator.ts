import { ArbOpportunity } from './poolcheck';

interface TradeRecord {
  time: string;
  token: string;
  dexBuy: string;
  dexSell: string;
  spread: number;
  sizeSol: number;
  profitSol: number;
  profitUsd: number;
  solPrice: number;
}

export class ArbSimulator {
  capitalSol = 10;
  trades: TradeRecord[] = [];
  totalProfitSol = 0;
  maxDrawdown = 0;
  peakCapital = 10;
  minSpread = 0.5;    // minimum spread to trade (%)
  maxSpread = 3;      // max credible spread (% — reject fake data)
  maxTradeFrac = 0.2; // max 20% of capital per trade
  feeRate = 0.0006;   // 0.06% total fees (DEX + Jito)
  slippage = 0.1;     // 0.1% slippage (Jito bundles land atomically)
  minLiq = 2000;      // minimum liquidity ($)

  evaluate(opps: ArbOpportunity[], solPrice: number): string[] {
    const lines: string[] = [];

    for (const opp of opps) {
      if (opp.spreadPct < this.minSpread || opp.spreadPct > this.maxSpread) continue;
      const minLiq = Math.min(opp.liqA, opp.liqB);
      if (minLiq < this.minLiq) continue;

      // Determine direction
      const buyOn = opp.priceA < opp.priceB ? opp.dexA : opp.dexB;
      const sellOn = opp.priceA < opp.priceB ? opp.dexB : opp.dexA;
      const spread = opp.spreadPct;

      // Fee-adjusted net profit (spread - fees - slippage)
      const netSpread = spread - this.feeRate * 100 - this.slippage;
      if (netSpread <= 0) continue;

      // Trade size: cap % of capital, also cap at 5% of liquidity
      const sizeFromCap = this.capitalSol * this.maxTradeFrac;
      const sizeFromLiq = minLiq / solPrice * 0.05;
      const tradeSizeSol = Math.min(sizeFromCap, sizeFromLiq, 5); // max 5 SOL per trade
      if (tradeSizeSol < 0.05) continue;

      const grossProfitSol = tradeSizeSol * (netSpread / 100);
      const profitSol = Math.max(grossProfitSol, 0.00001);

      // Execute
      this.capitalSol += profitSol;
      this.totalProfitSol += profitSol;
      if (this.capitalSol > this.peakCapital) this.peakCapital = this.capitalSol;
      const dd = (this.peakCapital - this.capitalSol) / this.peakCapital * 100;
      if (dd > this.maxDrawdown) this.maxDrawdown = dd;

      const time = new Date().toLocaleTimeString();
      this.trades.push({
        time,
        token: opp.symbol,
        dexBuy: buyOn,
        dexSell: sellOn,
        spread,
        sizeSol: tradeSizeSol,
        profitSol,
        profitUsd: profitSol * solPrice,
        solPrice,
      });

      const pnlPct = (this.totalProfitSol / 10 * 100).toFixed(2);
      lines.push(
        `  ⚡ TRADE: ${opp.symbol} | ` +
        `${buyOn.split(':')[0]}→${sellOn.split(':')[0]} | ` +
        `size=${tradeSizeSol.toFixed(3)} SOL | ` +
        `profit=+${profitSol.toFixed(6)} SOL | ` +
        `PnL=${pnlPct}%`
      );
    }

    return lines;
  }

  summary(): string[] {
    const pnlPct = (this.totalProfitSol / 10 * 100).toFixed(2);
    const wins = this.trades.filter(t => t.profitSol > 0).length;
    const totalTrades = this.trades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : '0.0';
    const avgProfit = totalTrades > 0
      ? (this.totalProfitSol / totalTrades * 1000000).toFixed(2)
      : '0.00';

    return [
      `┌─ Paper Trading ──────────────────────────────────┐`,
      `│ Capital: ${this.capitalSol.toFixed(3)} SOL  (${pnlPct}%)                  │`,
      `│ Trades: ${totalTrades}  |  Win: ${winRate}%  |  Avg: ${avgProfit}μSOL     │`,
      `│ Drawdown: ${this.maxDrawdown.toFixed(2)}%                               │`,
      `└──────────────────────────────────────────────────┘`,
    ];
  }
}
