const { Connection, PublicKey } = require("@solana/web3.js");
const conn = new Connection("https://api.mainnet-beta.solana.com", { commitment: "confirmed" });

const CLMM_NEW = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";  // correct
const AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";  // Raydium AMM

const pools = [
  ["3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv", "SOL/USDC"],
  ["2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv", "SOL/USDC"],
  ["CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq", "SOL/USDC"],
  ["9VSwL2dnZ3u6T74tWL34H7EfeiuDEQwRvdDuw4YPQUwK", "JUP/USDC"],
  ["8EzbUfvcRT1Q6RL462ekGkgqbxsPmwC5FMLQZhSPMjJ3", "mSOL/SOL"],
  ["3nMFwZXwY1s1M5s8vYAHqd4wGs4iSxXE4LRoUMMYqEgF", "SOL/USDT"],
  ["G7mw1d83ismcQJKkzt62Ug4noXCjVhu3eV7U5EMgge6Z", "BONK/USDC"],
  ["61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht", "RAY/USDC"],
  ["HBS7a3br8GMMWuqVa7VB3SMFa7xVi1tSFdoF5w4ZZ3kS", "POPCAT/USDC"],
  ["9n3dSLrERZQp95dHXywft7xV8D8xnGFLaUHtEhQVaXaC", "PYTH/SOL"],
  ["4mMDQ5kG9fFrBSQeedErsUoTBhY5KKnsKWGvenXRTwSy", "WIF/SOL"],
];

(async () => {
  console.log("Checking pool owners...\n");
  for (const [addr, label] of pools) {
    try {
      const acc = await conn.getAccountInfo(new PublicKey(addr));
      if (!acc) { console.log(`${label} (${addr.substring(0, 8)}...): NOT FOUND`); continue; }
      const owner = acc.owner.toBase58();
      const isCLMM = owner === CLMM_NEW;
      const isAMM = owner === AMM_V4;
      const tag = isCLMM ? "✅ CLMM" : isAMM ? "❌ AMMv4" : `❓ ${owner.substring(0, 12)}...`;
      console.log(`${label} (${addr.substring(0, 8)}...): ${tag} (${owner.substring(0, 16)}...) size=${acc.data.length}`);
    } catch (e) {
      console.log(`${label} (${addr.substring(0, 8)}...): ERROR ${e.message}`);
    }
  }
})();
