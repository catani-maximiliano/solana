import { Connection, PublicKey } from "@solana/web3.js";
import { logInfo, logSuccess, logWarning, logError } from "../logger";

export interface ProgramConfig {
  id: string;
  name: string;
  type: "clmm" | "dlmm" | "amm";
  version: string;
  verified: boolean;
}

export const OFFICIAL_PROGRAMS: Record<string, ProgramConfig> = {
  raydiumClmm: {
    id: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    name: "Raydium CLMM",
    type: "clmm",
    version: "2.0",
    verified: true,
  },
  whirlpool: {
    id: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    name: "Orca Whirlpool",
    type: "clmm",
    version: "2.0",
    verified: true,
  },
  meteoraDlmm: {
    id: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
    name: "Meteora DLMM",
    type: "dlmm",
    version: "2.1",
    verified: true,
  },
};

export function getProgramId(key: string): string {
  return OFFICIAL_PROGRAMS[key]?.id || "";
}

export type ProgramKey = keyof typeof OFFICIAL_PROGRAMS;

export interface ProgramValidationResult {
  key: ProgramKey;
  program: ProgramConfig;
  exists: boolean;
  executable: boolean;
  latencyMs: number;
  error?: string;
}

export async function validateProgramIds(connection: Connection): Promise<ProgramValidationResult[]> {
  const results: ProgramValidationResult[] = [];

  for (const [key, program] of Object.entries(OFFICIAL_PROGRAMS)) {
    try {
      const start = Date.now();
      const pubkey = new PublicKey(program.id);
      const acc = await connection.getAccountInfo(pubkey);
      const latency = Date.now() - start;

      const exists = acc !== null;
      const executable = acc?.executable === true;

      results.push({
        key: key as ProgramKey,
        program,
        exists,
        executable,
        latencyMs: latency,
        error: !exists ? "Program ID no encontrado en RPC" : undefined,
      });

      if (exists && executable) {
        logSuccess(`✅ ${program.name}: ${program.id.substring(0, 12)}... — VÁLIDO (${latency}ms)`);
      } else if (exists && !executable) {
        logWarning(`⚠️  ${program.name}: encontrado pero NO ejecutable`);
      } else {
        logWarning(`❌ ${program.name}: ${program.id.substring(0, 12)}... — NO ENCONTRADO en RPC`);
      }
    } catch (err) {
      results.push({
        key: key as ProgramKey,
        program,
        exists: false,
        executable: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      logError(`❌ ${program.name}: error validando — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return results;
}

export function haveRequiredPrograms(results: ProgramValidationResult[]): boolean {
  const required = ["raydiumClmm", "whirlpool", "meteoraDlmm"];
  const available = results.filter((r) => r.exists && r.executable).map((r) => r.key);
  const missing = required.filter((k) => !available.includes(k as ProgramKey));
  if (missing.length > 0) {
    logWarning(`Programas faltantes: ${missing.join(", ")}`);
    return false;
  }
  return true;
}
