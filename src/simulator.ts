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
  filled: boolean;
}

function slippageForLiq(liq: number): number {
  if (liq < 10_000) return 1.0;
  if (liq < 50_000) return 0.5;
  if (liq < 200_000) return 0.3;
  return 0.15;
}

export class ArbSimulator {
  readonly initialCapital = 4;
  capitalSol = this.initialCapital;
  trades: TradeRecord[] = [];
  totalProfitSol = 0;
  maxDrawdown = 0;
  peakCapital = this.initialCapital;
  minSpread = 0.7;
  maxSpread = 5;
  maxTradeFrac = 0.25;
  feeRate = 0.0006;
  jitoTipSol = 0.001;
  minLiq = 2000;

  evaluate(opps: ArbOpportunity[], solPrice: number): string[] {
    const lines: string[] = [];
    let available = this.capitalSol;

    for (const opp of opps) {
      if (opp.spreadPct < this.minSpread || opp.spreadPct > this.maxSpread) continue;
      const minLiq = Math.min(opp.liqA, opp.liqB);
      if (minLiq < this.minLiq) continue;

      // Simulate competition: 70% fill rate
      if (Math.random() > 0.7) continue;

      const buyOn = opp.priceA < opp.priceB ? opp.dexA : opp.dexB;
      const sellOn = opp.priceA < opp.priceB ? opp.dexB : opp.dexA;
      const spread = opp.spreadPct;

      const slippage = slippageForLiq(minLiq);
      const netSpread = spread - this.feeRate * 100 - slippage;
      if (netSpread <= 0) continue;

      const sizeFromCap = available * this.maxTradeFrac;
      const sizeFromLiq = minLiq / solPrice * 0.03;
      const tradeSizeSol = Math.min(sizeFromCap, sizeFromLiq, 5);
      if (tradeSizeSol < 0.01) continue;

      const grossProfitSol = tradeSizeSol * (netSpread / 100);
      const profitSol = Math.max(grossProfitSol - this.jitoTipSol, 0);
      if (profitSol <= 0) continue;

      // Reserve trade capital and add profit back
      available -= tradeSizeSol;
      this.capitalSol += profitSol;
      this.totalProfitSol += profitSol;
      if (this.capitalSol > this.peakCapital) this.peakCapital = this.capitalSol;
      const dd = (this.peakCapital - this.capitalSol) / this.peakCapital * 100;
      if (dd > this.maxDrawdown) this.maxDrawdown = dd;

      const time = new Date().toLocaleTimeString();
      this.trades.push({
        time, token: opp.symbol,
        dexBuy: buyOn, dexSell: sellOn,
        spread, sizeSol: tradeSizeSol,
        profitSol, profitUsd: profitSol * solPrice, solPrice,
        filled: true,
      });

      const pnlPct = (this.totalProfitSol / this.initialCapital * 100).toFixed(2);
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
    const pnlPct = (this.totalProfitSol / this.initialCapital * 100).toFixed(2);
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
