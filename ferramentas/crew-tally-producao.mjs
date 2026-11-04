// 3Mix Crew — Tally Engine (Fase 1 do superprompt de Melhorias Broadcast + Crew).
//
// Decisões de desenho registradas aqui (não espalhadas em comentários soltos depois):
// - Esta classe é SOMENTE LEITURA. Nunca chama production.run()/req() para mutar o motor;
//   só lê this.p.state.tally (MAIN) e signalRegistry.meTally() (M/E 2-4, já existentes e
//   testados antes desta Fase — não duplica essa lógica, reaproveita).
// - Tally por CÂMERA (input.key), não por cena interna: o operador de câmera pensa "estou
//   no ar", não "minha cena está em algum M/E". Resolve isso via production.state.inputs.
// - Um input pode estar em PROGRAM de um destino e PREVIEW de outro ao mesmo tempo (ex:
//   PROGRAM do MAIN, PREVIEW do M/E 3). Por isso cada entrada do resumo é uma LISTA de
//   destinos, e o estado "resumido" (para o LED ficar vermelho/verde/neutro) aplica a regra
//   do superprompt: PROGRAM tem prioridade sobre PREVIEW quando simultâneo em qualquer
//   destino monitorado pelo dispositivo.
// - Dispositivos pareados (celular/tablet/ESP32) escolhem explicitamente qual destino
//   monitorar (MAIN, ou um M/E específico) — nunca um valor implícito. Sem esse campo, o
//   servidor não adivinha; o cliente tem que mandar `watching` no handshake.
// - allowedDestinations() existe para a UI oferecer só destinos que de fato existem agora
//   (M/E 2 pode não estar configurado) — nunca listar um M/E inexistente como opção.
export const TALLY_STATES = Object.freeze({
  PROGRAM: 'program',
  PREVIEW: 'preview',
  LIVRE: 'livre',
  DESCONECTADO: 'desconectado',
});

export class CrewTallyEngine {
  constructor(production) {
    this.p = production;
  }

  // Lista os destinos monitoráveis que EXISTEM agora (nunca um M/E não configurado).
  async allowedDestinations() {
    const destinos = [{ id: 'main', label: 'Programa/Preview principal' }];
    try {
      const mixes = (await this.p.mixEffects?.read?.())?.mixes || [];
      for (const mix of mixes) {
        const id = Number(mix.mixId);
        if ([2, 3, 4].includes(id)) destinos.push({ id: 'me' + id, label: 'M/E ' + id });
      }
    } catch { /* M/E ainda não disponível nesta instalação; só MAIN é oferecido */ }
    return destinos;
  }

  // Tally cru por destino: { main: {program:Set,preview:Set}, me2: {...}, ... }.
  // Nomes (não UUID) porque production.state.tally já trabalha com nomes de input, e
  // meTally() devolve nomes resolvidos via inputsByKey — mantém os dois no mesmo formato
  // sem duplicar lógica de resolução de UUID↔nome.
  async rawByDestination() {
    const result = { main: { program: new Set(this.p.state?.tally?.program || []), preview: new Set(this.p.state?.tally?.preview || []) } };
    try {
      const meTally = await this.p.signalRegistry?.meTally?.();
      for (const [mixId, t] of Object.entries(meTally || {})) {
        result['me' + mixId] = { program: new Set(t.program || []), preview: new Set(t.preview || []) };
      }
    } catch { /* M/E indisponível: dispositivos monitorando um M/E específico verão DESCONECTADO para ele, nunca um estado inventado */ }
    return result;
  }

  // Resumo pronto para enviar a dispositivos: por entrada (câmera), por destino, com o
  // estado já resolvido (PROGRAM > PREVIEW > LIVRE) e a lista de destinos reais onde
  // aparece. Nunca inclui um destino que o motor não confirmou existir.
  async summary() {
    const raw = await this.rawByDestination();
    const inputs = this.p.state?.inputs || [];
    const porEntrada = inputs.map((input) => {
      const destinos = {};
      for (const [destId, trees] of Object.entries(raw)) {
        const noPrograma = trees.program.has(input.name);
        const noPreview = trees.preview.has(input.name);
        destinos[destId] = noPrograma ? TALLY_STATES.PROGRAM : noPreview ? TALLY_STATES.PREVIEW : TALLY_STATES.LIVRE;
      }
      const resumo = Object.values(destinos).includes(TALLY_STATES.PROGRAM) ? TALLY_STATES.PROGRAM
        : Object.values(destinos).includes(TALLY_STATES.PREVIEW) ? TALLY_STATES.PREVIEW
        : TALLY_STATES.LIVRE;
      return { key: input.key, name: input.name, number: input.number, destinos, resumo };
    });
    return {
      conectado: this.p.state?.connected === true,
      atualizadoEm: Date.now(),
      destinosDisponiveis: await this.allowedDestinations(),
      entradas: porEntrada,
    };
  }

  // Estado para UM dispositivo que escolheu monitorar um destino específico. Se o destino
  // pedido não existe mais (M/E removido/desligado), devolve DESCONECTADO explícito para
  // essa entrada em vez de inventar um estado — a tela do dispositivo deve mostrar "sem
  // sinal deste destino", nunca um LED neutro que pareça "ao vivo, tudo bem".
  async forDevice(watching) {
    const full = await this.summary();
    const existe = full.destinosDisponiveis.some((d) => d.id === watching);
    return {
      conectado: full.conectado,
      atualizadoEm: full.atualizadoEm,
      watching,
      destinoValido: existe,
      entradas: full.entradas.map((e) => ({
        key: e.key, name: e.name, number: e.number,
        estado: !full.conectado ? TALLY_STATES.DESCONECTADO : !existe ? TALLY_STATES.DESCONECTADO : e.destinos[watching] ?? TALLY_STATES.LIVRE,
      })),
    };
  }
}
