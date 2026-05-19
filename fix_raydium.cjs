const { Connection, PublicKey } = require("@solana/web3.js");
const conn = new Connection("https://api.mainnet-beta.solana.com", { commitment: "confirmed" });

const poolAddr = "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

(async () => {
  const acc = await conn.getAccountInfo(new PublicKey(poolAddr));
  const d = acc.data;
  console.log(`Pool: ${poolAddr}`);
  console.log(`Owner: ${acc.owner.toBase58()} (expected: CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK)`);
  console.log(`Size: ${d.length} bytes`);
  console.log(`Owner match: ${acc.owner.toBase58() === "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"}`);

  // Verify discriminator matches PoolState
  const disc = [247, 237, 227, 245, 215, 195, 222, 70];
  const actualDisc = Array.from(d.slice(0, 8));
  console.log(`\nDiscriminator match: ${JSON.stringify(actualDisc) === JSON.stringify(disc)}`);

  // Verify mint0/1 at expected offsets
  const mint0 = new PublicKey(d.slice(73, 105)).toBase58();
  const mint1 = new PublicKey(d.slice(105, 137)).toBase58();
  console.log(`mint0 @73: ${mint0} (isSOL: ${mint0 === SOL})`);
  console.log(`mint1 @105: ${mint1} (isUSDC: ${mint1 === USDC})`);

  // Read decimals
  const dec0 = d.readUInt8(233);
  const dec1 = d.readUInt8(234);
  console.log(`\ndecimals_0 @233: ${dec0} (expected 9 for SOL)`);
  console.log(`decimals_1 @234: ${dec1} (expected 6 for USDC)`);

  // tick_spacing
  const ts = d.readUInt16LE(235);
  console.log(`tick_spacing @235: ${ts}`);

  // liquidity
  const liqLo = d.readBigUInt64LE(237);
  const liqHi = d.readBigUInt64LE(245);
  const liquidity = liqLo + (liqHi << 64n);
  console.log(`liquidity @237: ${liquidity.toString()} (${Number(liquidity).toLocaleString()})`);

  // sqrtPriceX64
  const sqrtLo = d.readBigUInt64LE(253);
  const sqrtHi = d.readBigUInt64LE(261);
  const sqrtPriceX64 = sqrtLo + (sqrtHi << 64n);
  const rawPrice = Number(sqrtPriceX64) / 2**64;
  // For pool with mint0=SOL, mint1=USDC, price = rawPrice² * 10^(dec0-dec1) = rawPrice² * 10^3
  const spotPrice = rawPrice * rawPrice * Math.pow(10, dec0 - dec1);
  console.log(`sqrtPrice @253: ${sqrtPriceX64.toString()} (rawPrice=${rawPrice.toFixed(10)})`);
  console.log(`    → spot price = rawPrice² * 10^(${dec0}-${dec1}) = ${spotPrice.toFixed(6)}`);

  // tick_current
  const tick = d.readInt32LE(269);
  console.log(`tick_current @269: ${tick}`);

  // Also check old offsets for comparison
  const oldSqrtLo = d.readBigUInt64LE(252);
  const oldSqrtHi = d.readBigUInt64LE(260);
  const oldSqrtPriceX64 = oldSqrtLo + (oldSqrtHi << 64n);
  console.log(`\nOLD sqrtPrice @252: ${oldSqrtPriceX64.toString()}`);
  const oldTick = d.readInt32LE(268);
  console.log(`OLD tick @268: ${oldTick}`);

  // Read from old offset 232: it was reading decimals_0/1 
  const oldDec0 = d.readUInt8(232);
  const oldDec1 = d.readUInt8(233);
  console.log(`OLD dec0 @232: ${oldDec0}, dec1 @233: ${oldDec1}`);
  console.log(`OLD tick_spacing @234: ${d.readUInt16LE(234)}`);
  console.log(`OLD liq @236: (${d.readBigUInt64LE(236).toString()}, ${d.readBigUInt64LE(244).toString()})`);

  // Spot check: verify the new tick is reasonable for SOL/USDC near $85
  // tick = log(spotPrice * 10^(dec1-dec0), 1.0001)
  // Actually in Raydium CLMM: tick = floor(log(Q / 10^(dec1-dec0)) / log(1.0001)) where Q = token_1/token_0
  // Or: tick from the pool's internal value
  const expectedTick = Math.floor(Math.log(spotPrice) / Math.log(1.0001));
  console.log(`\nExpected tick for price=${spotPrice}: ~${expectedTick}`);
  console.log(`Actual tick: ${tick} ${tick >= -500000 && tick <= 500000 ? '✅ VALID' : '❌ INVALID'}`);
})();
