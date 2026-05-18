export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  label: string = "operation"
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[${label}] Intento ${attempt}/${maxRetries} fallido. Reintentando en ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export function formatNumber(num: number, decimals: number = 4): string {
  return num.toFixed(decimals);
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}

export function truncate(str: string, maxLen: number = 16): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor(maxLen / 2);
  return `${str.substring(0, half)}...${str.substring(str.length - half)}`;
}

export function priceDiffPercent(priceA: number, priceB: number): number {
  if (priceA === 0) return 0;
  return ((priceB - priceA) / priceA) * 100;
}

export async function promiseAllChunked<T>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.allSettled(chunk.map(fn));
  }
}

export function toSolString(lamports: number, decimals: number = 6): string {
  return (lamports / 1_000_000_000).toFixed(decimals);
}

export function toUsdcString(amount: number, decimals: number = 4): string {
  return (amount / 1_000_000).toFixed(decimals);
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
