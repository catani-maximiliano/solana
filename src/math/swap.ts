export interface SwapSimulation {
  outputAmount: bigint;
  priceImpactPct: number;
  feePaid: bigint;
}

export function simulateConstantProductSwap(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps: number
): SwapSimulation {
  if (reserveIn <= 0n || reserveOut <= 0n || amountIn <= 0n) {
    return { outputAmount: 0n, priceImpactPct: 0, feePaid: 0n };
  }

  const fee = amountIn * BigInt(feeBps) / 10000n;
  const amountInAfterFee = amountIn - fee;

  const numerator = amountInAfterFee * reserveOut;
  const denominator = reserveIn + amountInAfterFee;
  const outputAmount = numerator / denominator;

  const priceBefore = Number(reserveOut) / Number(reserveIn);
  const priceAfter = Number(reserveOut - outputAmount) / Number(reserveIn + amountInAfterFee);
  const priceImpactPct = priceBefore > 0 ? Math.abs((priceAfter - priceBefore) / priceBefore) * 100 : 0;

  return { outputAmount, priceImpactPct, feePaid: fee };
}

export function simulateMultiHopSwap(
  hops: Array<{ reserveIn: bigint; reserveOut: bigint; feeBps: number }>,
  amountIn: bigint
): SwapSimulation {
  let currentAmount = amountIn;
  let totalFee = 0n;

  for (const hop of hops) {
    const result = simulateConstantProductSwap(hop.reserveIn, hop.reserveOut, currentAmount, hop.feeBps);
    if (result.outputAmount <= 0n) return { outputAmount: 0n, priceImpactPct: 100, feePaid: totalFee };
    currentAmount = result.outputAmount;
    totalFee += result.feePaid;
  }

  const totalImpact = hops.length > 0 && amountIn > 0n
    ? (1 - Number(currentAmount) / Number(amountIn)) * 100
    : 0;

  return { outputAmount: currentAmount, priceImpactPct: Math.min(100, totalImpact), feePaid: totalFee };
}

export function estimateRequiredLiquidity(amountIn: bigint, desiredPriceImpact: number): bigint {
  if (desiredPriceImpact <= 0) return 0n;
  return amountIn * BigInt(Math.ceil(100 / desiredPriceImpact));
}
