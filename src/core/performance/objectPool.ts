import { logDebug } from "../../logger";

export class ObjectPool<T> {
  private pool: T[] = [];
  private hits = 0;
  private misses = 0;

  constructor(private factory: () => T, private reset: (obj: T) => void, private maxSize = 100) {}

  acquire(): T {
    if (this.pool.length > 0) {
      this.hits++;
      return this.pool.pop()!;
    }
    this.misses++;
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    if (this.pool.length < this.maxSize) this.pool.push(obj);
  }

  getStats(): { hits: number; misses: number; hitRate: string; size: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? `${Math.round(this.hits / total * 100)}%` : "N/A",
      size: this.pool.length,
    };
  }

  resetStats(): void { this.hits = 0; this.misses = 0; }
}
