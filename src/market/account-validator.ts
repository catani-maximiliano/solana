import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { logWarning, logDebug, logError } from "../logger";
import { OFFICIAL_PROGRAMS } from "../config/programs";

// ── Error types ──

export type RejectReason =
  | "WRONG_OWNER"
  | "WRONG_SIZE"
  | "WRONG_DISCRIMINATOR"
  | "TICK_OUT_OF_RANGE"
  | "SQRT_PRICE_ZERO"
  | "SQRT_PRICE_OUT_OF_RANGE"
  | "LIQUIDITY_ZERO"
  | "LIQUIDITY_ABSURD"
  | "PRICE_NAN"
  | "PRICE_INFINITE"
  | "PRICE_OUT_OF_BOUNDS"
  | "UNKNOWN_PAIR"
  | "UNKNOWN_DEX"
  | "CORRUPTED_DATA"
  | "INVALID_DECIMALS";

export interface ValidationResult {
  valid: boolean;
  reason?: RejectReason;
  detail?: string;
}

// ── Per-DEX expected account sizes (PoolState only) ──

interface DexAccountSpec {
  programId: string;
  poolStateSize: [number, number];  // [min, max] bytes
  validDiscriminators: bigint[];    // known pool discriminators (Anchor sha256("account:Name")[..8])
}

const DEX_SPECS: Record<string, DexAccountSpec> = {
  "Raydium CLMM": {
    programId: OFFICIAL_PROGRAMS.raydiumClmm.id,
    poolStateSize: [300, 3000],
    validDiscriminators: [],
  },
  "Whirlpool": {
    programId: OFFICIAL_PROGRAMS.whirlpool.id,
    poolStateSize: [85, 660],
    validDiscriminators: [],
  },
  "Meteora DLMM": {
    programId: OFFICIAL_PROGRAMS.meteoraDlmm.id,
    poolStateSize: [241, 2000],
    validDiscriminators: [],
  },
};

// ── Public API ──

export function getDexSpec(dex: string): DexAccountSpec | undefined {
  return DEX_SPECS[dex];
}

export function learnDiscriminator(dex: string, discriminator: bigint): void {
  const spec = DEX_SPECS[dex];
  if (!spec) return;
  if (!spec.validDiscriminators.includes(discriminator)) {
    spec.validDiscriminators.push(discriminator);
    logDebug(`Validator: learned discriminator 0x${discriminator.toString(16)} for ${dex}`);
  }
}

export function validateAccountSize(dex: string, size: number): ValidationResult {
  const spec = DEX_SPECS[dex];
  if (!spec) return { valid: false, reason: "UNKNOWN_DEX" };
  if (size < spec.poolStateSize[0] || size > spec.poolStateSize[1]) {
    return {
      valid: false,
      reason: "WRONG_SIZE",
      detail: `${dex}: size ${size} not in [${spec.poolStateSize[0]}, ${spec.poolStateSize[1]}]`,
    };
  }
  return { valid: true };
}

export function validateDiscriminator(dex: string, discriminator: bigint): ValidationResult {
  const spec = DEX_SPECS[dex];
  if (!spec) return { valid: false, reason: "UNKNOWN_DEX" };
  if (spec.validDiscriminators.length === 0) {
    return { valid: true };
  }
  if (!spec.validDiscriminators.includes(discriminator)) {
    return {
      valid: false,
      reason: "WRONG_DISCRIMINATOR",
      detail: `${dex}: discriminator 0x${discriminator.toString(16)} not in known set`,
    };
  }
  return { valid: true };
}

export function validateOwner(
  dex: string,
  actualOwner: string
): ValidationResult {
  const spec = DEX_SPECS[dex];
  if (!spec) return { valid: false, reason: "UNKNOWN_DEX" };
  if (actualOwner !== spec.programId) {
    return {
      valid: false,
      reason: "WRONG_OWNER",
      detail: `${dex}: expected ${spec.programId.substring(0, 12)}..., got ${actualOwner.substring(0, 12)}...`,
    };
  }
  return { valid: true };
}

export function validateTick(tick: number): ValidationResult {
  if (tick < -500000 || tick > 500000) {
    return {
      valid: false,
      reason: "TICK_OUT_OF_RANGE",
      detail: `tick ${tick} ∉ [-500000, 500000]`,
    };
  }
  return { valid: true };
}

export function validateSqrtPrice(sqrtPriceX64: bigint): ValidationResult {
  if (sqrtPriceX64 === 0n) {
    return { valid: false, reason: "SQRT_PRICE_ZERO" };
  }
  const sqrtNum = Number(sqrtPriceX64);
  if (!isFinite(sqrtNum) || sqrtNum <= 0) {
    return { valid: false, reason: "SQRT_PRICE_OUT_OF_RANGE", detail: "NaN or negative" };
  }
  const sqrtApprox = sqrtNum / 2 ** 64;
  if (sqrtApprox > 1e10 || (sqrtApprox > 0 && sqrtApprox < 1e-8)) {
    return {
      valid: false,
      reason: "SQRT_PRICE_OUT_OF_RANGE",
      detail: `≈${sqrtApprox.toExponential(2)}`,
    };
  }
  return { valid: true };
}

export function validateLiquidity(liquidity: bigint): ValidationResult {
  if (liquidity === 0n) {
    return { valid: false, reason: "LIQUIDITY_ZERO" };
  }
  const liqNum = Number(liquidity);
  if (!isFinite(liqNum)) {
    return { valid: false, reason: "LIQUIDITY_ABSURD", detail: "NaN" };
  }
  if (liqNum > 1e18) {
    return {
      valid: false,
      reason: "LIQUIDITY_ABSURD",
      detail: `${liqNum.toExponential(2)} > 1e18`,
    };
  }
  return { valid: true };
}

export function validatePrice(price: number, maxPrice: number = 1_000_000): ValidationResult {
  if (!isFinite(price)) {
    return { valid: false, reason: "PRICE_NAN", detail: String(price) };
  }
  if (price <= 0) {
    return { valid: false, reason: "PRICE_OUT_OF_BOUNDS", detail: `${price} <= 0` };
  }
  if (price > maxPrice) {
    return {
      valid: false,
      reason: "PRICE_OUT_OF_BOUNDS",
      detail: `${price.toExponential(2)} > ${maxPrice}`,
    };
  }
  return { valid: true };
}

export function validatePoolFields(
  tick: number,
  sqrtPrice: bigint,
  liquidity: bigint,
  fee: number
): ValidationResult {
  const checks = [validateTick(tick), validateSqrtPrice(sqrtPrice), validateLiquidity(liquidity)];
  if (fee < 0 || fee > 10000) {
    checks.push({ valid: false, reason: "CORRUPTED_DATA" as RejectReason, detail: `fee ${fee} bps` });
  }
  for (const c of checks) {
    if (!c.valid) return c;
  }
  return { valid: true };
}

// ── Owner verification ──

export async function verifyOwner(
  connection: Connection,
  poolAddress: string,
  expectedProgramId: string
): Promise<ValidationResult> {
  try {
    const pubkey = new PublicKey(poolAddress);
    const acc = await connection.getAccountInfo(pubkey);
    if (!acc) {
      return { valid: false, reason: "CORRUPTED_DATA", detail: "account not found" };
    }
    const actualOwner = acc.owner.toBase58();
    if (actualOwner !== expectedProgramId) {
      return {
        valid: false,
        reason: "WRONG_OWNER",
        detail: `expected ${expectedProgramId.substring(0, 12)}..., got ${actualOwner.substring(0, 12)}...`,
      };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: "CORRUPTED_DATA",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
