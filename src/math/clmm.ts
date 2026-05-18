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
  const [lower, upper] = sqrtPriceA < sqrtPriceB ? [sqrtPriceA, sqrtPriceB] : [sqrtPriceB, sqrtPriceA];

  if (sqrtPrice <= lower) return 0n;
  if (sqrtPrice >= upper) {
    const delta = upper - lower;
    return liquidity * delta / (upper * lower);
  }
  const delta = upper - sqrtPrice;
  return liquidity * delta / (upper * sqrtPrice);
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
  const fee = inputAmount * BigInt(feeBps) / 10000n;
  const amountIn = inputAmount - fee;

  let sqrtPriceAfter: bigint;
  let outputAmount: bigint;

  if (zeroForOne) {
    const numerator = liquidity * sqrtPrice;
    const denominator = liquidity + amountIn * sqrtPrice;
    sqrtPriceAfter = numerator / denominator;
    outputAmount = (liquidity * (sqrtPrice - sqrtPriceAfter)) / (sqrtPrice * sqrtPriceAfter);
  } else {
    sqrtPriceAfter = sqrtPrice + (amountIn * 2n ** 64n) / liquidity;
    outputAmount = (liquidity * (sqrtPriceAfter - sqrtPrice)) / sqrtPriceAfter;
  }

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
