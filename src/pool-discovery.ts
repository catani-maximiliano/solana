import { Connection, PublicKey } from "@solana/web3.js";
import { logInfo, logWarning, logDebug, logError } from "./logger";
import { pairState } from "./pair-state";
import { marketValidator } from "./market-validator";
import { POOL_REGISTRY, PoolRegistryEntry } from "./config/pools";
import { OFFICIAL_PROGRAMS } from "./config/programs";

interface PoolCandidate {
  address: string;
  dex: string;
  pair: string;
  mintA: string;
  mintB: string;
}

export class PoolDiscoverer {
  private connection: Connection;
  private discovered: PoolCandidate[] = [];
  private done = false;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async discoverAll(registerProviders: boolean = true): Promise<PoolCandidate[]> {
    if (this.done) return this.discovered;
    this.discovered = [];

    logInfo("Pool discovery: usando pool registry manual...");
    logInfo(`Pool registry: ${POOL_REGISTRY.length} pools en registry`);

    for (const entry of POOL_REGISTRY) {
      this.discovered.push({
        address: entry.address,
        dex: entry.dex,
        pair: entry.pair,
        mintA: entry.mintA,
        mintB: entry.mintB,
      });

      pairState.registerPool(entry.pair, entry.address);
      const pair = pairState.getPair(entry.pair);
      if (pair && !pair.poolAddresses.includes(entry.address)) {
        pair.poolAddresses.push(entry.address);
      }
    }

    if (this.discovered.length === 0) {
      logWarning("Pool discovery: registry vacío — sin pools para subscribir");
    }

    this.done = true;
    const uniquePairs = [...new Set(this.discovered.map((p) => p.pair))];
    logInfo(`Pool discovery: ${this.discovered.length} pools registrados para ${uniquePairs.length} pares: ${uniquePairs.join(", ")}`);

    return this.discovered;
  }

  getDiscoveredPools(): PoolCandidate[] {
    return [...this.discovered];
  }
}

export const poolDiscoverer: PoolDiscoverer | null = null;
