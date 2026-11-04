// 3Mix Crew — Intercom: transporte WebSocket PCM (implementação 1 de 2 transportes
// previstos; o 2º é WebRTC, ver nota de migração no fim deste arquivo).
//
// Contrato de "Transport" que qualquer implementação deve cumprir (documentado aqui, não
// imposto por `implements` — JS não tem interface formal, mas o contrato é este):
//   - attach(memberId, ws): associa uma conexão de transporte a um membro já cadastrado
//     no CrewIntercomEngine. Não fala com o engine além de ouvir seu evento 'mix'.
//   - detach(memberId): remove a associação (ex.: no 'close' da conexão).
//   - Nunca decide QUEM ouve O QUE — isso é 100% responsabilidade do CrewIntercomEngine
//     (mixagem/PTT/grupos). O transporte só entrega o buffer que o engine já decidiu
//     mandar para aquele memberId.
//   - Nunca processa mensagens do cliente como comando de produção — handshake e PTT
//     passam pela API HTTP/WS já autenticada (mesmo padrão do Tally), nunca por este canal
//     de áudio puro.
//
// Esta implementação é deliberadamente o MESMO padrão que `retornos-calls.mjs:CallReturns`
// já usa em produção (envio binário direto do buffer de `mixReturn`, sem framing extra) —
// reaproveitado, não reinventado.
export class CrewIntercomWsTransport {
  constructor(intercom) {
    this.intercom = intercom;
    this.sockets = new Map(); // memberId -> ws
    this.onMix = (memberId, buffer) => {
      const ws = this.sockets.get(memberId);
      if (ws && ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(buffer); // mesmo teto de backpressure que CallReturns.pump já usa
    };
    this.intercom.on('mix', this.onMix);
  }

  attach(memberId, ws) {
    this.sockets.get(memberId)?.close();
    this.sockets.set(memberId, ws);
    this.intercom.heartbeat(memberId);
    ws.on('close', () => { if (this.sockets.get(memberId) === ws) { this.sockets.delete(memberId); this.intercom.markDisconnected(memberId); } });
    // Canal de transporte de áudio é SOMENTE SAÍDA (servidor -> cliente). Mensagens do
    // cliente (PTT, heartbeat) vão pela API HTTP/WS de controle já autenticada, nunca por
    // aqui — mesmo princípio de segurança do Tally (ver crew-tally-producao.mjs).
    ws.on('message', () => {});
  }

  detach(memberId) {
    this.sockets.get(memberId)?.close();
    this.sockets.delete(memberId);
  }

  close() {
    this.intercom.off('mix', this.onMix);
    for (const ws of this.sockets.values()) ws.close();
    this.sockets.clear();
  }
}

// --- Nota de migração para WebRTC (documentada por pedido explícito do dono: "se houver
// impedimento técnico para WebRTC nesta fase, entregue primeiro o transporte existente com
// testes e documente a migração, sem declarar WebRTC implementado") ---
//
// Investigação real feita antes de decidir (não suposição): `3mix-panel/package.json` não
// tem NENHUMA dependência de WebRTC server-side (nem mediasoup, nem node-webrtc, nem
// simple-peer) — só `ws`, `qrcode`, `exceljs`. O vídeo de convidados do 3Mix Calls usa
// VDO.Ninja (serviço externo embutido via iframe/browser_source no motor), não uma
// implementação própria de signaling/SFU; `NativeCallVideo` (call-video-native.mjs) não
// lida com RTCPeerConnection nenhum. Ou seja: WebRTC nativo para o Intercom seria
// construído DO ZERO (signaling server + decisão de mesh P2P vs. SFU), não uma extensão de
// algo que já existe — confirma o aviso do próprio superprompt para não presumir.
//
// Por que não foi implementado nesta rodada: WebRTC em mesh P2P não escala bem além de
// ~4-6 participantes simultâneos (cada participante abre N-1 conexões); um SFU próprio
// exigiria uma dependência nova pesada (ex. mediasoup, que tem build nativo C++ próprio) ou
// reimplementar roteamento de mídia — qualquer uma das duas é trabalho de dias, não de um
// ciclo de watchdog, e arriscaria "declarar WebRTC implementado" sem prova real (proibido
// pela regra 6 do superprompt).
//
// Caminho de migração real, sem reescrever o engine: o contrato de Transport acima
// (attach/detach, nunca decide quem ouve o quê) já é o ponto de extensão. Uma
// `CrewIntercomWebRtcTransport` futura faria `intercom.on('mix', ...)` do mesmo jeito, mas
// em vez de mandar o buffer binário puro, decodificaria o PCM e empurraria para uma
// MediaStreamTrack sintética (via um SFU real) ou renderizaria o sinal de volta a partir de
// um AudioWorklet no navegador, com signaling (oferta/resposta SDP, ICE) trafegando pelo
// `/api/crew/tally/ws`-equivalente de controle já autenticado — NUNCA por este canal PCM.
// PENDENTE, não implementado, não testado, não declarado pronto.
