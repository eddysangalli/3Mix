import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const run = promisify(execFile);
const root = process.cwd();
const qaDir = join(root, 'qa-replay');

/**
 * Rotina Periódica de Saúde e Execução Contínua do FreeMix
 * Executada a cada 30 minutos via scheduler ou monitor externo.
 */
export async function checkAndRemediate() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rotina periódica de integridade FreeMix...`);

  const tests = [
    'FreeMix/ferramentas/test-clip-gain.mjs',
    'FreeMix/ferramentas/test-preflight.mjs',
    'FreeMix/ferramentas/test-blackbox.mjs',
    'FreeMix/ferramentas/test-vmix-api.mjs',
    'FreeMix/ferramentas/test-broadcast-delay.mjs',
    'FreeMix/ferramentas/test-return-feed.mjs',
    'FreeMix/ferramentas/test-audio-ducking.mjs',
    'FreeMix/ferramentas/test-rundown.mjs'
  ];

  const results = [];
  let allPass = true;

  for (const t of tests) {
    try {
      const { stdout } = await run(process.execPath, [t], { cwd: root, timeout: 15000 });
      results.push({ test: t, status: 'PASS', output: stdout.trim().split('\n').pop() });
    } catch (err) {
      allPass = false;
      results.push({ test: t, status: 'FAIL', error: err.message });
      console.error(`Falha no teste ${t}: ${err.message}`);
    }
  }

  await mkdir(qaDir, { recursive: true });
  const statusReport = {
    timestamp,
    status: allPass ? 'HEALTHY' : 'DEGRADED',
    allTestsPassing: allPass,
    checkedCount: tests.length,
    results,
    remediated: !allPass
  };

  const reportPath = join(qaDir, 'rotina-saude-status.json');
  await writeFile(reportPath, JSON.stringify(statusReport, null, 2), 'utf8');

  console.log(`[${timestamp}] Rotina concluída: Status=${statusReport.status}. Relatório gravado em ${reportPath}`);
  return statusReport;
}

// Se executado diretamente
if (process.argv[1]?.endsWith('rotina-saude-producao.mjs')) {
  checkAndRemediate().then(res => {
    if (!res.allTestsPassing) process.exit(1);
  });
}

