import { Connection, PublicKey } from '@solana/web3.js';
import { fetchSolPrice, RaydiumPoolRaw } from './onchain';

export interface PriceUpdate {
  mint: string;
  dex: string;
  price: number;
  liq: number;
}

type PriceCallback = (update: PriceUpdate) => void;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export async function subscribeRaydiumVaults(
  conn: Connection,
  initialSolPrice: number,
  onPrice: PriceCallback,
  initialPools: RaydiumPoolRaw[],
): Promise<{ cleanup: () => void; addPools: (pools: RaydiumPoolRaw[]) => Promise<void> }> {
  let solPrice = initialSolPrice;

  const solUpdater = setInterval(async () => {
    try { solPrice = await fetchSolPrice(); } catch {}
  }, 60_000);

  const vaultToPool = new Map<string, { key: string; baseVault: string; quoteVault: string }>();
  const allMints = new Set<string>();
  const mintDecimals = new Map<string, number>();
  const vaultBalances = new Map<string, number>();
  const subIds: number[] = [];

  async function addPools(pools: RaydiumPoolRaw[]) {
    const newMintAddrs: string[] = [];
    const newVaultAddrs: string[] = [];
    const newPoolEntries: { addr: string; info: { key: string; baseVault: string; quoteVault: string } }[] = [];

    for (const p of pools) {
      if (vaultToPool.has(p.baseVault) || vaultToPool.has(p.quoteVault)) continue;

      const info = { key: p.key, baseVault: p.baseVault, quoteVault: p.quoteVault };
      vaultToPool.set(p.baseVault, info);
      vaultToPool.set(p.quoteVault, info);
      newVaultAddrs.push(p.baseVault, p.quoteVault);
      newPoolEntries.push({ addr: p.baseVault, info }, { addr: p.quoteVault, info });

      const [base, quote] = p.key.split('|');
      for (const m of [base, quote]) {
        if (!mintDecimals.has(m)) {
          newMintAddrs.push(m);
          allMints.add(m);
        }
      }
    }

    if (newVaultAddrs.length === 0) return;

    let freshDecimals = 0;
    if (newMintAddrs.length > 0) {
      const mintPks = newMintAddrs.map(a => new PublicKey(a));
      const mintAccs = await conn.getMultipleAccountsInfo(mintPks);
      for (let i = 0; i < mintPks.length; i++) {
        if (mintAccs[i]) {
          mintDecimals.set(mintPks[i].toBase58(), mintAccs[i]!.data.readUInt8(44));
          freshDecimals++;
        }
      }
    }

    const vaultPks = newVaultAddrs.map(a => new PublicKey(a));
    const vaultAccs = await conn.getMultipleAccountsInfo(vaultPks);
    for (let i = 0; i < vaultPks.length; i++) {
      if (vaultAccs[i]) {
        const addr = newVaultAddrs[i];
        const raw = Number(vaultAccs[i]!.data.readBigUInt64LE(64));
        const info = vaultToPool.get(addr)!;
        const [baseMint, quoteMint] = info.key.split('|');
        const isBaseVault = info.baseVault === addr;
        const tokenMint = isBaseVault ? baseMint : quoteMint;
        const decimals = mintDecimals.get(tokenMint) || 9;
        vaultBalances.set(addr, raw / Math.pow(10, decimals));
      }
    }

    let emitted = 0;
    for (const p of pools) {
      const [baseMint, quoteMint] = p.key.split('|');
      const baseBal = vaultBalances.get(p.baseVault) || 0;
      const quoteBal = vaultBalances.get(p.quoteVault) || 0;
      if (baseBal <= 0 || quoteBal <= 0) continue;
      let price = 0, liq = 0;
      if (quoteMint === SOL_MINT) { price = (quoteBal / baseBal) * solPrice; liq = quoteBal * solPrice; }
      else if (quoteMint === USDC_MINT) { price = quoteBal / baseBal; liq = quoteBal; }
      else continue;
      onPrice({ mint: baseMint, dex: 'raydium', price, liq });
      emitted++;
    }

    for (const { addr, info } of newPoolEntries) {
      const pk = new PublicKey(addr);
      const subId = conn.onAccountChange(pk, (acctInfo) => {
        const raw = Number(acctInfo.data.readBigUInt64LE(64));
        const [baseMint, quoteMint] = info.key.split('|');
        const isBaseVault = info.baseVault === addr;
        const tokenMint = isBaseVault ? baseMint : quoteMint;
        const decimals = mintDecimals.get(tokenMint) || 9;
        const bal = raw / Math.pow(10, decimals);
        vaultBalances.set(addr, bal);

        const baseBal = vaultBalances.get(info.baseVault) || 0;
        const quoteBal = vaultBalances.get(info.quoteVault) || 0;
        if (baseBal <= 0 || quoteBal <= 0) return;
        let price = 0, liq = 0;
        if (quoteMint === SOL_MINT) { price = (quoteBal / baseBal) * solPrice; liq = quoteBal * solPrice; }
        else if (quoteMint === USDC_MINT) { price = quoteBal / baseBal; liq = quoteBal; }
        else return;
        onPrice({ mint: baseMint, dex: 'raydium', price, liq });
      }, 'confirmed');
      subIds.push(subId);
    }
  }

  await addPools(initialPools);
  console.log(`  ✓ WebSocket: ${subIds.length} Raydium vaults subscribed`);

  return {
    cleanup() {
      clearInterval(solUpdater);
      for (const id of subIds) {
        try { conn.removeAccountChangeListener(id); } catch {}
      }
    },
    addPools,
  };
}
