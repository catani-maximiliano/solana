export class PreSignedTxCache {
  private cache = new Map<string, Buffer>();

  /** Store a pre-built/pre-signed transaction */
  set(key: string, tx: Buffer): void {
    this.cache.set(key, tx);
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  /** Get a cached transaction */
  get(key: string): Buffer | undefined { return this.cache.get(key); }

  /** Check if transaction exists in cache */
  has(key: string): boolean { return this.cache.has(key); }

  getSize(): number { return this.cache.size; }

  reset(): void { this.cache.clear(); }
}

export const preSignedTxCache = new PreSignedTxCache();
