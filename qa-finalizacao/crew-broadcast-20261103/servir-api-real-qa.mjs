// QA-only: sobe o ARQUIVO REAL ferramentas/servidor-api.mjs (nunca uma cópia) numa porta
// isolada, com um ROOT sintético (sem motor nativo conectado — connect() tenta e falha em
// background, nunca bloqueia o boot HTTP, comportamento já documentado nesta tarefa) e
// FREEMIX_PANEL_DIR apontando para o painel REAL (só leitura de arquivos estáticos — nada
// é escrito lá). Objetivo: verificar no browser real a correção da rota /crew que estava
// faltando na tabela `routes`, contra o roteamento de produção de verdade, não um harness
// simplificado. Nunca toca o motor do operador nem a porta real 8088.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PANEL_REAL = fileURLToPath(new URL('../../painel/', import.meta.url));
const ROOT_QA = fileURLToPath(new URL('./rootqa-regressao-rota-crew-browser/', import.meta.url));
await mkdir(join(ROOT_QA, 'config'), { recursive: true });

process.env.FREEMIX_API_PORT = process.argv[2] || '8695';
// 0.0.0.0 só nesta instância ISOLADA de QA (porta não-padrão, ROOT sintético), para o
// próprio hub.html confirmar via fetch real que o endereço de rede responde (medirRede) —
// nunca expor a porta real 8088 assim; essa decisão é só desta ferramenta de verificação.
process.env.FREEMIX_API_HOST = '0.0.0.0';
process.env.FREEMIX_ROOT = ROOT_QA;
process.env.FREEMIX_PANEL_DIR = PANEL_REAL;

await import('../../ferramentas/servidor-api.mjs');
