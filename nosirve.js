solana.raydium_clmm.swap_v2
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.raydium_clmm.swap_v2", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.raydium_clmm.liquidity_change_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.raydium_clmm.liquidity_change_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.raydium_clmm.increase_liquidity_v2
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.raydium_clmm.increase_liquidity_v2", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.raydium_clmm.swap_router_base_in
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.raydium_clmm.swap_router_base_in", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.jupiter_swap.swaps_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.jupiter_swap.swaps_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.jupiter_swap.swap_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.jupiter_swap.swap_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.jupiter_swap.candidate_swap_results_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.jupiter_swap.candidate_swap_results_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.jupiter_swap.route_v2
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.jupiter_swap.route_v2", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.jupiter_swap.shared_accounts_route_v2
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.jupiter_swap.shared_accounts_route_v2", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.openbook_v2.place_order
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.openbook_v2.place_order", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.openbook_v2.place_take_order
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.openbook_v2.place_take_order", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});



solana.openbook_v2.consume_events
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.openbook_v2.consume_events", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.openbook_v2.cancel_order
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.openbook_v2.cancel_order", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.meteora_dlmm.swap_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.meteora_dlmm.swap_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.meteora_dlmm.lb_pair_create_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.meteora_dlmm.lb_pair_create_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.meteora_dlmm.composition_fee_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.meteora_dlmm.composition_fee_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});


solana.meteora_dlmm.dynamic_fee_parameter_update_event
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const def = protoLoader.loadSync("stream_service.proto");
const pkg = grpc.loadPackageDefinition(def).nln.stream.v1;

const client = new pkg.StreamService(
  "events.nln.clr3.org:443",
  grpc.credentials.createSsl()
);

const metadata = new grpc.Metadata();
metadata.set("x-api-key", "sk_live_WyFos0McoGTo53GhVpaDXqS9FYT0QuZy");
metadata.set("x-eventstream-policy",
  JSON.stringify({"version":1,"allowed_programs":"all","allowed_topics":"all"}));

const stream = client.Subscribe(
  { topic: "solana.meteora_dlmm.dynamic_fee_parameter_update_event", format: 1 },
  metadata
);

stream.on("data", (msg) => {
  const event = JSON.parse(msg.payload);
  console.log(`slot=${msg.slot}`, event);
});
