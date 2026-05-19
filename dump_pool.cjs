const { Connection, PublicKey } = require("@solana/web3.js");

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  { commitment: "confirmed", wsEndpoint: undefined }
);

const pools = [
  "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
  "G7mw1d83ismcQJKkzt62Ug4noXCjVhu3eV7U5EMgge6Z",
];

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
      console.log(`  Found ${label} at offset ${offset} (0x${offset.toString(16)})`);
    }
  }
}

async function dumpPool(poolAddress) {
  const pubkey = new PublicKey(poolAddress);
  const acc = await connection.getAccountInfo(pubkey);
  if (!acc) { console.log(`Pool ${poolAddress.substring(0, 12)}: NOT FOUND`); return; }

  const data = acc.data;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`Pool: ${poolAddress}`);
  console.log(`Owner: ${acc.owner.toBase58()}`);
  console.log(`Size: ${data.length} bytes`);
  console.log(`═══════════════════════════════════════════`);

  const disc = data.readBigInt64LE(0);
  console.log(`\nDiscriminator: 0x${disc.toString(16)}`);

  // Dump first 8 pubkeys (after 8-byte discriminator)
  console.log("\nFirst 8 pubkeys (each 32 bytes):");
  for (let offset = 8; offset < 8 + 8 * 32; offset += 32) {
    try {
      const pk = new PublicKey(data.slice(offset, offset + 32)).toBase58();
      console.log(`  Offset ${offset}: ${pk}`);
    } catch (e) {
      console.log(`  Offset ${offset}: INVALID`);
    }
  }

  // Search for known mints
  console.log("\nMint search:");
  findMintInBuffer(data, SOL, "SOL");
  findMintInBuffer(data, USDC, "USDC");
  findMintInBuffer(data, BONK, "BONK");

  // After the 8 pubkeys = 8 + 8*32 = 264 bytes of header
  // Then likely: tickSpacing (u16), factory/dynamic fields
  // Let's dump bytes 264-350 in detail
  console.log("\nDetailed dump of bytes 260-350:");
  for (let i = 260; i < Math.min(350, data.length); i += 2) {
    const b = data[i];
    const bNext = data[i+1];
    if (i >= 260) {
      const u16 = data.readUInt16LE(i);
      const i16 = data.readInt16LE(i);
      const u32 = i+3 < data.length ? data.readUInt32LE(i) : 0;
      const i32 = i+3 < data.length ? data.readInt32LE(i) : 0;
      console.log(`  0x${i.toString(16).padStart(4,'0')} (${i}): u8=${b} u16=${u16} i16=${i16} u32=${u32} i32=${i32}`);
    }
  }

  // Search for sqrtPriceQ64 near 2^64
  console.log("\nScanning for sqrtPrice (near 2^64 ≈ 1.84e19):");
  for (let offset = 360; offset < data.length - 16; offset += 1) {
    const lo = data.readBigUInt64LE(offset);
    const hi = data.readBigUInt64LE(offset + 8);
    const val = lo + (hi << 64n);
    const num = Number(val);
    if (num > 1e18 && num < 1e20) {
      const rawPrice = num / 2**64;
      const estimated = rawPrice * rawPrice;
      console.log(`  Offset ${offset}: sqrtPrice=${val} rawPrice=${rawPrice.toFixed(6)} price=${estimated.toFixed(6)}`);
    }
  }

  // Search for tick
  console.log("\nScanning for tick (i32 in [-500000, 500000], non-zero):");
  for (let offset = 360; offset < data.length - 4; offset += 1) {
    const tick = data.readInt32LE(offset);
    if (tick > -500000 && tick < 500000 && tick !== 0) {
      console.log(`  Offset ${offset}: tick=${tick}`);
    }
  }

  // Search for liquidity
  console.log("\nScanning for liquidity (u128 1e8..1e16):");
  for (let offset = 360; offset < data.length - 16; offset += 1) {
    const lo = data.readBigUInt64LE(offset);
    const hi = data.readBigUInt64LE(offset + 8);
    const val = lo + (hi << 64n);
    const num = Number(val);
    if (num > 1e8 && num < 1e16) {
      console.log(`  Offset ${offset}: liq=${val.toString()} (${num.toLocaleString()})`);
    }
  }
}

(async () => {
  await dumpPool(pools[0]);
  await dumpPool(pools[1]);
})();
