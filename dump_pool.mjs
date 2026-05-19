import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./dist/config/index.js";

const connection = new Connection(
  "https://mainnet.helius-rpc.com/?api-key=2e82a76a-46fa-4e4c-8201-b7a224f7eb13",
  { commitment: "confirmed", wsEndpoint: undefined }
);

// Raydium CLMM pool addresses
const pools = [
  "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv", // SOL/USDC
  "G7mw1d83ismcQJKkzt62Ug4noXCjVhu3eV7U5EMgge6Z", // BONK/USDC
];

// Known mint addresses
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

function findMintInBuffer(data, mintB58, label) {
  const mint = new PublicKey(mintB58).toBytes();
  for (let offset = 0; offset <= data.length - 32; offset++) {
    let match = true;
    for (let i = 0; i < 32; i++) {
      if (data[offset + i] !== mint[i]) { match = false; break; }
    }
    if (match) {
      console.log(`  Found ${label} (${mintB58.substring(0, 8)}...) at offset ${offset} (0x${offset.toString(16)})`);
    }
  }
}

async function dumpPool(poolAddress) {
  const pubkey = new PublicKey(poolAddress);
  const acc = await connection.getAccountInfo(pubkey);
  if (!acc) { console.log(`Pool ${poolAddress.substring(0, 12)}...: NOT FOUND`); return; }

  const data = acc.data;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`Pool: ${poolAddress}`);
  console.log(`Owner: ${acc.owner.toBase58()}`);
  console.log(`Size: ${data.length} bytes`);
  console.log(`Executable: ${acc.executable}`);
  console.log(`═══════════════════════════════════════════`);

  // Dump first 500 bytes in hex
  console.log("\nHex dump (first 500 bytes):");
  const hexLines = [];
  for (let i = 0; i < Math.min(500, data.length); i += 16) {
    const slice = data.slice(i, i + 16);
    const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice).map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
    console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} ${ascii}`);
  }

  // Search for known mints
  console.log("\nMint search:");
  findMintInBuffer(data, SOL, "SOL");
  findMintInBuffer(data, USDC, "USDC");
  findMintInBuffer(data, BONK, "BONK");

  // Dump discriminator (first 8 bytes)
  const disc = data.readBigInt64LE(0);
  console.log(`\nDiscriminator: 0x${disc.toString(16)}`);

  // Dump first 5 public keys in base58
  for (let offset = 8; offset < 8 + 5 * 32; offset += 32) {
    try {
      const pk = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      console.log(`  Pubkey at offset ${offset}: ${pk.substring(0, 16)}...`);
    } catch (e) {
      console.log(`  Pubkey at offset ${offset}: INVALID`);
    }
  }

  // Try to find sqrtPrice (u128): should be ~2^64 ≈ 1.84e19
  console.log("\nScanning for sqrtPriceQ64 (u128) close to 2^64:");
  for (let offset = 300; offset < data.length - 16; offset += 1) {
    const lo = data.readBigUInt64LE(offset);
    const hi = data.readBigUInt64LE(offset + 8);
    const val = lo + (hi << 64n);
    const num = Number(val);
    if (num > 1e18 && num < 1e20 && val > 0n) {
      const rawPrice = num / 2**64;
      const estimated = rawPrice * rawPrice;
      if (estimated > 0.01 && estimated < 1e6) {
        console.log(`  Offset ${offset} (0x${offset.toString(16)}): sqrtPrice=${val.toString()} rawPrice=${rawPrice.toFixed(6)} estimatedPrice=${estimated.toFixed(6)}`);
      }
    }
  }

  // Try to find tick (i32): should be a reasonable value like [-100000, 100000]
  console.log("\nScanning for tick (i32) in reasonable range:");
  for (let offset = 300; offset < data.length - 4; offset += 1) {
    const tick = data.readInt32LE(offset);
    if (tick > -500000 && tick < 500000 && tick !== 0) {
      console.log(`  Offset ${offset} (0x${offset.toString(16)}): tick=${tick}`);
    }
  }

  // Try to find liquidity (u128): should be reasonable
  console.log("\nScanning for liquidity (u128) in reasonable range:");
  for (let offset = 300; offset < data.length - 16; offset += 1) {
    const lo = data.readBigUInt64LE(offset);
    const hi = data.readBigUInt64LE(offset + 8);
    const val = lo + (hi << 64n);
    const num = Number(val);
    if (num > 1e10 && num < 1e16 && val > 0n) {
      console.log(`  Offset ${offset} (0x${offset.toString(16)}): liq=${val.toString()} (${num.toLocaleString()})`);
    }
  }
}

await dumpPool(pools[0]);
await dumpPool(pools[1]);
