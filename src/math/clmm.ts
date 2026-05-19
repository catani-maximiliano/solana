export interface ClmmPoolState {
  sqrtPriceX64: bigint;
  liquidity: bigint;
  tickCurrentIndex: number;
  fee: number;
  tickSpacing: number;
  tokenMintA: string;
  tokenMintB: string;
  decimalsA: number;
  decimalsB: number;
}

export function sqrtPriceX64ToPrice(sqrtPriceX64: bigint, decimalsA: number, decimalsB: number): number {
  const price = Number(sqrtPriceX64) / 2 ** 64;
  return price * price * Math.pow(10, decimalsA - decimalsB);
}

export function priceToSqrtPriceX64(price: number, decimalsA: number, decimalsB: number): bigint {
  const adjustedPrice = price / Math.pow(10, decimalsA - decimalsB);
  const sqrtPrice = Math.sqrt(adjustedPrice);
  return BigInt(Math.floor(sqrtPrice * 2 ** 64));
}

export function getAmountAFromLiquidity(
  liquidity: bigint,
  sqrtPrice: bigint,
  sqrtPriceA: bigint,
  sqrtPriceB: bigint
): bigint {
  if (liquidity <= 0n || sqrtPrice <= 0n || sqrtPriceA <= 0n || sqrtPriceB <= 0n) return 0n;

  const [lower, upper] = sqrtPriceA < sqrtPriceB ? [sqrtPriceA, sqrtPriceB] : [sqrtPriceB, sqrtPriceA];

  if (sqrtPrice <= lower) return 0n;
  if (lower <= 0n || upper <= 0n) return 0n;
  if (sqrtPrice >= upper) {
    const delta = upper - lower;
    const div = upper * lower;
    return div > 0n ? liquidity * delta / div : 0n;
  }
  const delta = upper - sqrtPrice;
  const div = upper * sqrtPrice;
  return div > 0n ? liquidity * delta / div : 0n;
}

export function getAmountBFromLiquidity(
  liquidity: bigint,
  sqrtPrice: bigint,
  sqrtPriceA: bigint,
  sqrtPriceB: bigint
): bigint {
  const [lower, upper] = sqrtPriceA < sqrtPriceB ? [sqrtPriceA, sqrtPriceB] : [sqrtPriceB, sqrtPriceA];

  if (sqrtPrice >= upper) return 0n;
  if (sqrtPrice <= lower) {
    return liquidity * (upper - lower);
  }
  return liquidity * (sqrtPrice - lower);
}

export function estimateSwapOutput(
  liquidity: bigint,
  sqrtPrice: bigint,
  inputAmount: bigint,
  feeBps: number,
  zeroForOne: boolean
): { outputAmount: bigint; sqrtPriceAfter: bigint; feePaid: bigint } {
  if (liquidity <= 0n || sqrtPrice <= 0n || inputAmount <= 0n) {
    return { outputAmount: 0n, sqrtPriceAfter: sqrtPrice, feePaid: 0n };
  }

  const fee = inputAmount * BigInt(feeBps) / 10000n;
  const amountIn = inputAmount - fee;
  if (amountIn <= 0n) {
    return { outputAmount: 0n, sqrtPriceAfter: sqrtPrice, feePaid: fee };
  }

  let sqrtPriceAfter: bigint;
  let outputAmount: bigint;

  if (zeroForOne) {
    const denominator = liquidity + amountIn * sqrtPrice;
    sqrtPriceAfter = denominator > 0n ? (liquidity * sqrtPrice) / denominator : sqrtPrice;
    const denom2 = sqrtPrice * sqrtPriceAfter;
    outputAmount = denom2 > 0n ? (liquidity * (sqrtPrice - sqrtPriceAfter)) / denom2 : 0n;
  } else {
    const liqDiv = amountIn * 2n ** 64n;
    sqrtPriceAfter = liquidity > 0n ? sqrtPrice + liqDiv / liquidity : sqrtPrice;
    outputAmount = sqrtPriceAfter > 0n ? (liquidity * (sqrtPriceAfter - sqrtPrice)) / sqrtPriceAfter : 0n;
  }

  if (outputAmount < 0n) outputAmount = 0n;

  return { outputAmount, sqrtPriceAfter, feePaid: fee };
}

export function getClmmPriceImpact(
  inputAmount: bigint,
  liquidity: bigint,
  sqrtPrice: bigint,
  feeBps: number
): number {
  const price = Number(liquidity > 0n ? sqrtPrice : 1n);
  const liq = Number(liquidity);
  const inp = Number(inputAmount);
  if (liq <= 0 || price <= 0) return 0;
  return Math.min(100, (inp / (liq * price)) * 100);
}
