// Verificador de versões upstream (motor OBS + plugins de terceiros do catálogo local)
// contra o GitHub Releases de cada projeto. Só compara e relata; NUNCA baixa, instala
// ou altera nada. Isso é deliberado e complementar a dois sistemas que já existem e que
// este módulo não substitui nem contorna:
//   - atualizacao-online.mjs: atualização do PACOTE 3Mix (painel/ferramentas) por feed
//     assinado (ed25519), de um canal aprovado -- é quem baixa e aplica de verdade.
//   - plugin-manager.mjs: instalação/rollback de plugins nativos POR ZIP enviado pelo
//     operador; "install-catalog" (download automático a partir do catálogo) continua
//     recusado de propósito ali -- este módulo não muda isso.
//   - verificar-atualizacoes.mjs: integridade LOCAL dos componentes já instalados
//     (hashes contra o que a entrega aprovada declarou) -- não consulta nada externo.
// Este módulo soma a peça que faltava: "há uma versão mais nova no upstream real?" --
// puramente informativo, pensado para o operador (ou o empacotador da próxima entrega
// 3Mix) decidir se vale a pena revisar/testar essa versão nova antes de incluí-la numa
// entrega aprovada.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import https from 'node:https';

const GITHUB_API = 'api.github.com';
const TIMEOUT_MS = 8000;
const MAX_BODY = 256 * 1024; // a GitHub releases/latest response is a few KB; this is generous headroom, not a real limit we expect to hit.

// GitHub tag names vary in format (v3.2.1f, 1.36.1, 6.2.1). Strip only a leading "v"
// for a same-string check (obs-asio tags "v3.2.1f" against a catalog version of
// "3.2.1f" -- identical once the "v" is gone, no numeric comparison needed or wanted,
// since a trailing letter like "f" is not a semver field this code should interpret).
function stripV(raw) {
  return typeof raw === 'string' ? raw.replace(/^v(?=\d)/i, '') : raw;
}

// Only used when the stripped strings differ: keep the numeric dotted core for an
// ordering comparison, same normalization used by atualizacao-online.mjs's
// newerVersion(). A trailing letter/hash suffix is deliberately ignored here --
// catching it is stripV()'s job above, not this function's.
function normalizeVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/\d+(?:\.\d+)*/);
  return m ? m[0] : null;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function githubGetJSON(path, { timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: GITHUB_API,
      path,
      // GitHub's REST API requires a User-Agent on every request or it answers 403.
      headers: { 'User-Agent': '3Mix-update-checker', Accept: 'application/vnd.github+json' },
      timeout,
    }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode === 403) { res.resume(); return reject(Error('GitHub recusou a consulta (limite de requisições sem autenticação atingido); tente novamente mais tarde')); }
      if (res.statusCode !== 200) { res.resume(); return reject(Error('GitHub respondeu ' + res.statusCode)); }
      let size = 0, chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { req.destroy(Error('Resposta do GitHub maior que o esperado')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(Error('Resposta do GitHub não é JSON válido')); }
      });
    });
    req.on('timeout', () => req.destroy(Error('Tempo esgotado ao consultar o GitHub')));
    req.on('error', reject);
  });
}

// owner/repo extracted only from a github.com URL already present in our own catalog/config
// (never from arbitrary user input), so there is no path-injection surface here.
function githubRepoFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const [, owner, repo] = u.pathname.split('/');
    return owner && repo ? `${owner}/${repo.replace(/\.git$/, '')}` : null;
  } catch { return null; }
}

async function latestGithubRelease(ownerRepo) {
  const data = await githubGetJSON(`/repos/${ownerRepo}/releases/latest`);
  if (!data || typeof data.tag_name !== 'string') return null;
  return { tag: data.tag_name, version: normalizeVersion(data.tag_name), publishedAt: data.published_at || null, url: data.html_url || null };
}

// Reads the engine's own version string, embedded as plain text in obs.dll
// (e.g. "33.0.1-48-gd328c1924" from cmake/common/versionconfig.cmake's `git describe`).
// This is the same string `strings obs.dll | grep` finds; done in pure Node so it works
// without an external `strings` binary.
export async function readEngineVersion(root) {
  const path = join(root, 'bin/64bit/obs.dll');
  let buf;
  try { buf = await readFile(path); } catch (e) { return { version: null, path, error: e.code === 'ENOENT' ? 'obs.dll não encontrado nesta instalação' : e.message }; }
  const text = buf.toString('latin1');
  const m = text.match(/\b(\d+\.\d+\.\d+)-\d+-g[0-9a-f]+\b/) || text.match(/\b(\d+\.\d+\.\d+)\b/);
  return m ? { version: m[1], fullString: m[0], path } : { version: null, path, error: 'String de versão não encontrada em obs.dll' };
}

export async function readPluginCatalog(root) {
  try { return JSON.parse(await readFile(join(root, 'config/plugin-catalog.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

// One upstream check per catalog entry whose sourceUrl is on github.com, plus the
// engine itself against obsproject/obs-studio. Each lookup is independent: one failing
// (network down, repo renamed, GitHub rate limit) never stops the others, and shows up
// as its own `error` in that item's report instead of aborting the whole check.
export async function checkRemoteVersions(root, { engineRepo = 'obsproject/obs-studio', fetchRelease = latestGithubRelease } = {}) {
  const [engine, catalog] = await Promise.all([readEngineVersion(root), readPluginCatalog(root)]);
  const results = [];

  async function checkOne(label, installedVersion, repo, extra = {}) {
    if (!repo) return { ...extra, label, installedVersion, status: 'sem-origem-verificavel', note: 'Sem sourceUrl do GitHub no catálogo; não há onde verificar automaticamente.' };
    if (!installedVersion) return { ...extra, label, installedVersion: null, repo, status: 'versao-instalada-desconhecida', note: 'Não foi possível ler a versão instalada para comparar.' };
    let latest;
    try { latest = await fetchRelease(repo); }
    catch (e) { return { ...extra, label, installedVersion, repo, status: 'erro-consulta', note: e.message }; }
    if (!latest) return { ...extra, label, installedVersion, repo, status: 'sem-release-publicada', note: 'O projeto não publica releases no GitHub (ou nenhuma ainda).' };
    if (!latest.version) return { ...extra, label, installedVersion, repo, status: 'tag-nao-reconhecida', note: 'A tag mais recente (' + latest.tag + ') não tem um formato de versão reconhecível.', latestTag: latest.tag, latestUrl: latest.url };
    // Exact match once a leading "v" is stripped (handles suffixed tags like "v3.2.1f"
    // against a catalog version of "3.2.1f") takes priority over the numeric-core
    // comparison below, which would otherwise discard that "f" and flag a false update.
    const sameAsInstalled = stripV(latest.tag) === stripV(installedVersion);
    const installedCore = normalizeVersion(installedVersion);
    const numericOrder = installedCore ? compareVersions(latest.version, installedCore) : null;
    // Different suffixes with the same numeric core are not safely orderable.
    // Never turn NaN or an unknown suffix ordering into an "updated" claim.
    if (!sameAsInstalled && (numericOrder === null || (numericOrder === 0 && (stripV(latest.tag) !== installedCore || stripV(installedVersion) !== installedCore)))) {
      return { ...extra, label, installedVersion, repo, status: 'tag-nao-reconhecida', latestTag: latest.tag, latestUrl: latest.url,
        note: 'Versões com sufixos distintos exigem conferência das notas da release; não foi atribuída uma ordem automaticamente.' };
    }
    const cmp = sameAsInstalled ? 0 : numericOrder;
    return {
      ...extra, label, installedVersion, repo,
      latestVersion: latest.version, latestTag: latest.tag, latestPublishedAt: latest.publishedAt, latestUrl: latest.url,
      status: cmp > 0 ? 'atualizacao-disponivel' : cmp < 0 ? 'instalado-mais-novo-que-release' : 'atualizado',
    };
  }

  results.push(await checkOne('Motor OBS (libobs)', engine.version, engineRepo, { kind: 'engine', installedFullString: engine.fullString, engineError: engine.error }));
  for (const entry of catalog) {
    const repo = githubRepoFromUrl(entry.sourceUrl);
    results.push(await checkOne(entry.name || entry.id, entry.version, repo, { kind: 'plugin', id: entry.id }));
  }

  return {
    checkedAt: new Date().toISOString(),
    results,
    summary: {
      total: results.length,
      atualizacoesDisponiveis: results.filter(r => r.status === 'atualizacao-disponivel').length,
      semOrigemVerificavel: results.filter(r => r.status === 'sem-origem-verificavel').length,
      erros: results.filter(r => r.status === 'erro-consulta').length,
    },
    // Explicit, repeated here (not just in the file header) because this is the one
    // fact a caller of this function must never assume otherwise.
    disclaimer: 'Somente leitura: nenhum arquivo foi baixado, instalado ou alterado por esta checagem.',
  };
}
