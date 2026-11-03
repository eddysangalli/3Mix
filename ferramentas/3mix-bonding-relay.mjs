import dgram from "node:dgram";
import http from "node:http";

console.log("=== 3Mix BONDING RELAY / RECEPTOR MULTI-WAN ===");

const RIST_PORT = 4000;
const HTTP_PORT = 4080;

const state = {
  activeSessions: 0,
  packetsReceived: 0,
  packetsDuplicatedDiscarded: 0,
  packetsDelivered: 0,
  receivedFromInterfaces: new Map(),
  currentBitrateKbps: 0,
  lastPacketTime: Date.now()
};

// 1. Servidor UDP / RIST Simulado para recepção de múltiplos links
const server = dgram.createSocket("udp4");
const packetSequenceSet = new Set();

server.on("message", (msg, rinfo) => {
  const senderKey = `${rinfo.address}:${rinfo.port}`;
  const count = state.receivedFromInterfaces.get(senderKey) || 0;
  state.receivedFromInterfaces.set(senderKey, count + 1);

  state.packetsReceived++;
  state.lastPacketTime = Date.now();

  // Lê sequence number se existir ou simula checagem de duplicata (Redundância Simultânea)
  let seq = 0;
  if (msg.length >= 4) {
    seq = msg.readUInt32BE(0);
  } else {
    seq = state.packetsReceived;
  }

  if (packetSequenceSet.has(seq)) {
    // Pacote duplicado descartado com sucesso (Hitless redundancy)
    state.packetsDuplicatedDiscarded++;
  } else {
    packetSequenceSet.add(seq);
    if (packetSequenceSet.size > 2000) {
      // Limpa janela deslizante
      const it = packetSequenceSet.values();
      for (let i = 0; i < 500; i++) packetSequenceSet.delete(it.next().value);
    }
    state.packetsDelivered++;
  }
});

server.on("listening", () => {
  const address = server.address();
  console.log(`✓ Receptor Multi-Link RIST ativo em UDP ${address.address}:${address.port}`);
});

server.bind(RIST_PORT);

// 2. Servidor HTTP para monitoramento e telemetria da recomposição
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  const links = [];
  for (const [k, v] of state.receivedFromInterfaces.entries()) {
    links.push({ source: k, packets: v });
  }

  res.end(JSON.stringify({
    status: "ONLINE",
    relayType: "RIST Multi-Link Packet Reassembly",
    totalPackets: state.packetsReceived,
    duplicatesCleaned: state.packetsDuplicatedDiscarded,
    cleanDeliveredPackets: state.packetsDelivered,
    hitlessEfficiency: state.packetsReceived > 0 
      ? ((state.packetsDelivered / state.packetsReceived) * 100).toFixed(1) + "%"
      : "100%",
    linksDetected: links
  }, null, 2));
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`✓ API de Telemetria do Receptor em http://127.0.0.1:${HTTP_PORT}/status`);
});

