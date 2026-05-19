const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const conn = new Connection(RPC, "confirmed");

const WHIRLPOOL_PROGRAM = "whirlp96r7JpNCQB7LGEsK9L8T3S5KfEcJ2KcKZje4";

const POOLS = [
  { addr: "6kT4MhDqKrkWikaGpFCvYsk45BUKXEe2gTpNGAR1YcjS", label: "SOL/USDT" },
  { addr: "Hp53XEtt4S8SvPCXarsLSdGfZBuUr5mMmZmX2DRNXQKp", label: "jitoSOL/SOL" },
  { addr: "3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1", label: "BONK/SOL" },
  { addr: "AHTTzwf3GmVMJdxWM8v2MSxyjZj8rQR6hyAC3g9477Yj", label: "POPCAT/SOL" },
  { addr: "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE", label: "SOL/USDC (WORKING)" },
];

function hexDump(buf, start, len, label) {
  const hex = buf.slice(start, start + len).toString("hex").match(/.{1,2}/g)?.join(" ") || "";
  console.log(`  ${label} [${start}..${start+len-1}]: ${hex}`);
}

async function main() {
  for (const pool of POOLS) {
    console.log(`\n══════ ${pool.label} ══════`);
    console.log(`Address: ${pool.addr}`);
    try {
      const pk = new PublicKey(pool.addr);
      const acc = await conn.getAccountInfo(pk);
      if (!acc) {
        console.log("  ❌ NO ENCONTRADO en RPC");
        continue;
      }
      console.log(`  Owner: ${acc.owner.toBase58()}`);
      console.log(`  Data length: ${acc.data.length} bytes`);
      console.log(`  Executable: ${acc.executable}`);
      console.log(`  Lamports: ${acc.lamports}`);

      const d = acc.data;
      const isWhirlpool = acc.owner.toBase58() === WHIRLPOOL_PROGRAM;

      if (isWhirlpool) {
        hexDump(d, 0, 8, "discriminator");
        hexDump(d, 40, 10, "bump+spacing+seed+protocol_rate+fee_rate");
        hexDump(d, 49, 16, "liquidity (u128)");
        hexDump(d, 65, 16, "sqrt_price (u128)");
        hexDump(d, 81, 4, "tick (i32)");
        hexDump(d, 101, 32, "token_mint_a");
        hexDump(d, 133, 32, "token_vault_a");
        hexDump(d, 181, 32, "token_mint_b");
        hexDump(d, 213, 32, "token_vault_b");

        // Parse values
        const liquidityLo = d.readBigUInt64LE(49);
        const liquidityHi = d.readBigUInt64LE(57);
        const liquidity = (liquidityHi << 64n) + liquidityLo;
        const sqrtLo = d.readBigUInt64LE(65);
        const sqrtHi = d.readBigUInt64LE(73);
        const sqrtPrice = (sqrtHi << 64n) + sqrtLo;
        const tick = d.readInt32LE(81);
        const feeRate = d.readUInt16LE(45);
        const tickSpacing = d.readUInt16LE(41);

        console.log(`  Parsed: tick=${tick} fee=${feeRate}bps spacing=${tickSpacing}`);
        console.log(`  sqrtPrice=${sqrtPrice.toString()}`);
        console.log(`  liquidity=${liquidity.toString()}`);

        const liqNum = Number(liquidity);
        console.log(`  liquidity ~ ${liqNum.toExponential(2)}`);

        if (d.length >= 213 + 32) {
          try {
            const mintA = new PublicKey(d.slice(101, 133)).toBase58();
            const mintB = new PublicKey(d.slice(181, 213)).toBase58();
            console.log(`  mintA: ${mintA}`);
            console.log(`  mintB: ${mintB}`);
          } catch (e) {
            console.log(`  mint parse error: ${e.message}`);
          }
        }
      } else {
        console.log(`  ❌ NO es Whirlpool (owner: ${acc.owner.toBase58().substring(0, 12)}...)`);
        // Still dump some hex
        hexDump(d, 0, Math.min(64, d.length), "first 64 bytes");
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }
}

main().then(() => console.log("\nDone!"));
