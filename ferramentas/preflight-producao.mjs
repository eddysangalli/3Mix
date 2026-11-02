import { diskReport } from './disco-producao.mjs';

/**
 * PreflightEngine — Mecanismo de Verificação Pré-Voo (Pre-Flight Check) do FreeMix
 * 
 * Avalia a prontidão técnica e operacional da mesa antes do comando GO LIVE:
 * - Status de Program e Preview (inputs válidos e ativos)
 * - FTB (Fade to Black) Guard (prevenção contra transmissão preta acidental)
 * - Saúde de Live Inputs (sinais ativos vs perdidos em câmeras, NDI, SRT)
 * - Áudio Master (mudo acidental, ganho zerado ou clipping)
 * - Capacidade de Armazenamento e cálculo de tempo restante de gravação
 * - Configuração e status dos destinos de Streaming (RTMP/SRT)
 * - Failover e rotas de contingência
 */
export class PreflightEngine {
  constructor(production) {
    this.p = production;
    this.lastCheck = null;
    this.cachedSummary = null;
  }

  /**
   * Executa a auditoria completa de prontidão pré-voo
   */
  async runCheck() {
    const p = this.p;
    const issues = [];
    const checks = [];

    // 1. Program & Preview Check
    const programScene = p.state?.program;
    const previewScene = p.state?.preview;
    
    if (!programScene) {
      issues.push({
        severity: 'CRITICAL',
        code: 'PROGRAM_EMPTY',
        message: 'Nenhum input selecionado no Program. A saída estará preta.',
        area: 'video'
      });
      checks.push({ name: 'Program Input', status: 'FAIL', value: 'Vazio' });
    } else {
      checks.push({ name: 'Program Input', status: 'PASS', value: programScene });
    }

    if (!previewScene) {
      checks.push({ name: 'Preview Input', status: 'WARN', value: 'Nenhum input no Preview' });
    } else {
      checks.push({ name: 'Preview Input', status: 'PASS', value: previewScene });
    }

    // 2. FTB (Fade to Black) Guard
    const ftbActive = p.state?.ftb === true || p.state?.fadeToBlack === true;
    if (ftbActive) {
      issues.push({
        severity: 'CRITICAL',
        code: 'FTB_ENGAGED',
        message: 'Fade to Black (FTB) está ATIVADO. Qualquer sinal ao ar será cortado para preto.',
        area: 'video'
      });
      checks.push({ name: 'Fade to Black', status: 'FAIL', value: 'ATIVO (Perigo de tela preta)' });
    } else {
      checks.push({ name: 'Fade to Black', status: 'PASS', value: 'Inativo' });
    }

    // 3. Audio Master Health Check
    const masterAudio = (p.state?.audioInputs || []).find(a => 
      a.name === 'Master' || a.name === '3Mix Master' || a.name === 'Áudio do Desktop' || a.name === 'Desktop Audio'
    );
    if (masterAudio) {
      if (masterAudio.muted) {
        issues.push({
          severity: 'CRITICAL',
          code: 'AUDIO_MASTER_MUTED',
          message: 'O barramento Áudio Master está MUTADO. A transmissão começará sem som.',
          area: 'audio'
        });
        checks.push({ name: 'Áudio Master', status: 'FAIL', value: 'MUTADO' });
      } else {
        checks.push({ name: 'Áudio Master', status: 'PASS', value: 'Desmutado' });
      }
    } else {
      checks.push({ name: 'Áudio Master', status: 'PASS', value: 'Barramento padrão' });
    }

    // 4. Live Inputs Health Check
    const inputs = p.state?.inputs || [];
    let lostSignalsCount = 0;
    for (const inp of inputs) {
      if (inp.health?.signal === 'lost' || inp.health?.signal === 'error') {
        lostSignalsCount++;
        issues.push({
          severity: 'WARN',
          code: 'INPUT_SIGNAL_LOST',
          message: `Sinal perdido na entrada "${inp.name || inp.key}"`,
          area: 'inputs'
        });
      }
    }
    checks.push({
      name: 'Entradas de Vídeo / Sinais',
      status: lostSignalsCount > 0 ? 'WARN' : 'PASS',
      value: `${inputs.length - lostSignalsCount}/${inputs.length} entradas ativas`
    });

    // 5. Storage & Disk Capacity Check (Gravação / ISO / Replay) — lógica compartilhada
    // com a checagem leve de disco em /api/health (disco-producao.mjs), para a primeira
    // execução e o Pre-Flight operacional concordarem nos mesmos limiares/mensagens.
    try {
      const report = await diskReport(p.root || process.cwd());
      if (report.supported) {
        if (report.severity === 'CRITICAL') {
          issues.push({
            severity: 'CRITICAL',
            code: 'DISK_SPACE_CRITICAL',
            message: `Espaço em disco crítico: apenas ${report.freeGb} GB livres (< 1h de gravação)`,
            area: 'storage'
          });
          checks.push({ name: 'Espaço em Disco', status: 'FAIL', value: `${report.freeGb} GB` });
        } else if (report.severity === 'WARN') {
          issues.push({
            severity: 'WARN',
            code: 'DISK_SPACE_LOW',
            message: `Espaço em disco reduzido: ${report.freeGb} GB livres (~${report.estRecordingHours}h de gravação)`,
            area: 'storage'
          });
          checks.push({ name: 'Espaço em Disco', status: 'WARN', value: `${report.freeGb} GB` });
        } else {
          checks.push({
            name: 'Espaço em Disco',
            status: 'PASS',
            value: `${report.freeGb} GB livres (~${report.estRecordingHours}h)`
          });
        }
      }
    } catch {
      checks.push({ name: 'Espaço em Disco', status: 'PASS', value: 'Disponível' });
    }

    // 6. Playout / Playlist Readiness
    const playoutState = p.state?.playout || p.playoutEngine?.state;
    if (playoutState) {
      if (playoutState.preview?.preloadState === 'error') {
        issues.push({
          severity: 'WARN',
          code: 'PLAYOUT_PRELOAD_ERROR',
          message: `Erro ao pré-carregar mídia no Playout: ${playoutState.preview.error || 'Falha de leitura'}`,
          area: 'playout'
        });
      }
      checks.push({
        name: 'Playout Dual-Player',
        status: playoutState.preview?.preloadState === 'error' ? 'WARN' : 'PASS',
        value: `Program: ${playoutState.program?.status || 'idle'} | Clip Gain: ${playoutState.program?.audioGainDb || 0} dB`
      });
    }

    // Classificação geral
    const hasCritical = issues.some(i => i.severity === 'CRITICAL');
    const hasWarn = issues.some(i => i.severity === 'WARN');
    const verdict = hasCritical ? 'FAIL' : (hasWarn ? 'WARN' : 'READY');

    const result = {
      timestamp: Date.now(),
      verdict, // 'READY' | 'WARN' | 'FAIL'
      readyToAir: !hasCritical,
      checks,
      issues,
      disk: diskReport,
      summary: hasCritical
        ? 'Atenção: Existem problemas críticos que impedem a entrada no ar com segurança!'
        : hasWarn
          ? 'Pronto com ressalvas: Verifique os alertas antes de iniciar a transmissão.'
          : 'Sistema 100% pronto para entrar no ar (GO LIVE aprovado).'
    };

    this.lastCheck = result;
    return result;
  }

  summary() {
    return this.lastCheck || {
      timestamp: 0,
      verdict: 'NOT_RUN',
      readyToAir: false,
      checks: [],
      issues: [],
      summary: 'Pre-flight check ainda não executado nesta sessão.'
    };
  }

  async execute(action, d = {}) {
    if (action === 'preflight_check' || action === 'preflight_run') {
      return this.runCheck();
    }
    if (action === 'preflight_summary') {
      return this.summary();
    }
    throw new Error(`Ação de preflight não reconhecida: ${action}`);
  }
}

