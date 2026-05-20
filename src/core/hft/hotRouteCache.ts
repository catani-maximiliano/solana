export interface HotRoute {
  route: string;
  instructions: any[];
  computeUnits: number;
  optimalFee: number;
  hitCount: number;
}

export class HotRouteCache {
  private routes = new Map<string, HotRoute>();

  /** Record a successful route */
  record(route: string, instructions: any[], computeUnits: number, optimalFee: number): void {
    const existing = this.routes.get(route) || { route, instructions, computeUnits, optimalFee, hitCount: 0 };
    existing.hitCount++;
    existing.optimalFee = Math.round((existing.optimalFee + optimalFee) / 2);
    this.routes.set(route, existing);
  }

  /** Get cached route */
  get(route: string): HotRoute | undefined { return this.routes.get(route); }

  /** Get most frequently used routes */
  getHottest(n = 5): HotRoute[] {
    return Array.from(this.routes.values()).sort((a, b) => b.hitCount - a.hitCount).slice(0, n);
  }

  getSize(): number { return this.routes.size; }

  reset(): void { this.routes.clear(); }
}

export const hotRouteCache = new HotRouteCache();
