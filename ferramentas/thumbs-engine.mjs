// Miniaturas reais das entradas para a interface nova (painel/estudio/), item
// 1.4 do plano de beta (FreeMix/docs/SUPER-PROMPT-CLAUDE-BETA-20261030.md).
// Cada fonte é capturada no máximo uma vez a cada ~900ms (cache em memória),
// com no máximo 2 capturas simultâneas no motor — o dock mostra até 8
// fontes de uma vez; sem esse limite, 8 chamadas simultâneas de
// GetSourceScreenshot competiriam pelo mesmo render thread do motor.
// Desconectado = {} (a UI usa a imagem estática local com selo "prévia"
// nesse caso — ver estudio/css/mesa.css e js/telas/mesa.js).
const MIN_INTERVALO_MS = 900;
const MAX_CONCORRENCIA = 2;
const LARGURA = 160, ALTURA = 90, QUALIDADE = 55;

export class ThumbsEngine {
  constructor(p) {
    this.p = p;
    this.cache = new Map(); // key -> { dataUrl, capturadoEm }
    this.emAndamento = new Set(); // keys sendo capturadas agora
    this.previewCache = new Map(); // key -> { dataUrl, capturadoEm } em 640x360
    this.previewBusy = new Set();
    this.ultimaTentativa = new Map(); // key -> instante da última captura pedida, com ou sem sucesso
  }

  // Quadro maior para a janela PTZ (16:9). Cache curto e uma captura por vez:
  // o preview não pode competir com o render do motor.
  async preview(key) {
    const agora = Date.now();
    const atual = this.previewCache.get(key);
    if (atual && agora - atual.capturadoEm < 900) return atual.dataUrl;
    if (this.previewBusy.has(key)) return atual?.dataUrl || null;
    this.previewBusy.add(key);
    try {
      const frame = await this.p.req('GetSourceScreenshot', {
        sourceUuid: key, imageFormat: 'jpg',
        imageWidth: 640, imageHeight: 360, imageCompressionQuality: 70
      });
      const entrada = { dataUrl: frame.imageData, capturadoEm: Date.now() };
      this.previewCache.set(key, entrada);
      return entrada.dataUrl;
    } catch {
      this.previewCache.delete(key);
      return null;
    } finally {
      this.previewBusy.delete(key);
    }
  }

  async capturar(key) {
    if (this.emAndamento.has(key)) return; // já tem uma captura dessa fonte em voo
    const atual = this.cache.get(key);
    if (atual && Date.now() - atual.capturadoEm < MIN_INTERVALO_MS) return;
    this.emAndamento.add(key);
    this.ultimaTentativa.set(key, Date.now());
    try {
      const frame = await this.p.req('GetSourceScreenshot', {
        sourceUuid: key, imageFormat: 'jpg',
        imageWidth: LARGURA, imageHeight: ALTURA, imageCompressionQuality: QUALIDADE
      });
      this.cache.set(key, { dataUrl: frame.imageData, capturadoEm: Date.now() });
    } catch {
      // Fonte sem vídeo, removida entre o snapshot e a captura, ou motor
      // momentaneamente ocupado — a tela cai para a imagem estática local,
      // não é um erro para propagar ao operador.
      this.cache.delete(key);
    } finally {
      this.emAndamento.delete(key);
    }
  }

  // Chamado pelo GET /api/thumbs: dispara captura das fontes visíveis que
  // estão vencidas (respeitando o limite de concorrência) e devolve
  // imediatamente o que já estiver em cache — nunca espera a captura nova
  // terminar, para não travar a resposta HTTP atrás do motor.
  async snapshot() {
    if (this.p.state?.connected !== true) return {};
    const inputs = (this.p.state?.inputs || [])
      .filter(i => i.key && i.name !== '3Mix Barramentos' && !String(i.name).startsWith('3Mix Slot '));
    // Quem espera há mais tempo vai primeiro; sem isso as primeiras entradas da lista ocupariam todas as vagas.
    const vencidas = inputs.filter(i => {
      const atual = this.cache.get(i.key);
      return !atual || Date.now() - atual.capturadoEm >= MIN_INTERVALO_MS;
    }).sort((a, b) => (this.ultimaTentativa.get(a.key) || 0) - (this.ultimaTentativa.get(b.key) || 0));
    const vagas = Math.max(0, MAX_CONCORRENCIA - this.emAndamento.size);
    for (const input of vencidas.slice(0, vagas)) this.capturar(input.key).catch(() => {});
    const thumbs = {};
    for (const input of inputs) {
      const atual = this.cache.get(input.key);
      if (atual) thumbs[input.name] = atual.dataUrl;
    }
    return thumbs;
  }
}
