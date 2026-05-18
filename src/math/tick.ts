export function tickToSqrtPrice(tick: number): bigint {
  const sqrtPrice = Math.pow(1.0001, tick / 2);
  return BigInt(Math.floor(sqrtPrice * 2 ** 64));
}

export function sqrtPriceToTick(sqrtPriceX64: bigint): number {
  const price = Number(sqrtPriceX64) / 2 ** 64;
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick * 2);
}

export function nearestTick(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

export function tickToPrice(tick: number, decimalsA: number, decimalsB: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimalsA - decimalsB);
}

export function priceToTick(price: number, decimalsA: number, decimalsB: number): number {
  return Math.floor(Math.log(price / Math.pow(10, decimalsA - decimalsB)) / Math.log(1.0001));
}

export function getNextInitializableTick(tick: number, tickSpacing: number, up: boolean): number {
  if (up) return Math.ceil(tick / tickSpacing) * tickSpacing;
  return Math.floor(tick / tickSpacing) * tickSpacing;
}
