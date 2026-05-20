import { TopicConfig, EventKind } from "./eventTypes";
import * as fs from "fs";
import * as path from "path";

const NLN_EVENTS_PATH = path.join(process.cwd(), "nln-events.txt");

const DEX_MAP: Record<string, string> = {
  orca_whirlpool: "Whirlpool",
  raydium_clmm: "Raydium CLMM",
  meteora_dlmm: "Meteora DLMM",
  jupiter: "Jupiter",
  phoenix: "Phoenix",
  openbook_v2: "OpenBook V2",
};

const KIND_MAP: Record<string, EventKind> = {
  swap: "SWAP",
  swap_v2: "SWAP",
  swap_event: "SWAP",
  two_hop_swap: "SWAP",
  two_hop_swap_v2: "SWAP",
  traded_event: "TRADED",
  route_event: "ROUTING",
  candidate_swap_results_event: "ROUTING",
  market_event: "ORDERBOOK",
};

/**
 * Detect which protocol a topic belongs to.
 * Example: "solana.orca_whirlpool.swap_v2" → dex="Whirlpool", kind="SWAP"
 */
export function classifyTopic(topic: string): { dex: string; eventKind: EventKind } {
  const parts = topic.split(".");
  // Expected: solana.<protocol>.<event_name>
  const protocol = parts.length >= 2 ? parts[1] : "unknown";
  const eventName = parts.length >= 3 ? parts.slice(2).join("_") : "unknown";

  const dex = DEX_MAP[protocol] || protocol;
  const eventKind = KIND_MAP[eventName] || "UNKNOWN";

  return { dex, eventKind };
}

/**
 * Parse nln-events.txt and return all discovered topics.
 */
export function parseEventFile(): TopicConfig[] {
  try {
    if (!fs.existsSync(NLN_EVENTS_PATH)) {
      return [];
    }
    const content = fs.readFileSync(NLN_EVENTS_PATH, "utf-8");
    const lines = content.split("\n");
    const topics: TopicConfig[] = [];
    let currentTopic = "";
    let currentDesc = "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      if (line.startsWith("EVENT:")) {
        // Save previous
        if (currentTopic) {
          const { dex, eventKind } = classifyTopic(currentTopic);
          topics.push({ topic: currentTopic, description: currentDesc, dex, eventType: eventKind, enabled: true });
        }
        currentTopic = line.substring(6).trim();
        currentDesc = "";
      } else if (line.startsWith("DESC:")) {
        currentDesc = line.substring(5).trim();
      }
    }
    // Save last
    if (currentTopic) {
      const { dex, eventKind } = classifyTopic(currentTopic);
      topics.push({ topic: currentTopic, description: currentDesc, dex, eventType: eventKind, enabled: true });
    }

    return topics;
  } catch {
    return [];
  }
}

/** Watch file for changes */
export function watchEventFile(callback: (topics: TopicConfig[]) => void): () => void {
  if (!fs.existsSync(NLN_EVENTS_PATH)) return () => {};
  const watcher = fs.watch(NLN_EVENTS_PATH, (eventType) => {
    if (eventType === "change") {
      const topics = parseEventFile();
      callback(topics);
    }
  });
  return () => watcher.close();
}
