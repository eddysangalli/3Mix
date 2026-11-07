import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRemoteVersions, readEngineVersion, readPluginCatalog } from './verificar-versoes-remotas.mjs';

async function fixtureRoot({ engineVersionString, catalog } = {}) {
  const root = await mkdtemp(join(tmpdir(), '3mix-update-check-'));
  await mkdir(join(root, 'bin/64bit'), { recursive: true });
  await mkdir(join(root, 'config'), { recursive: true });
  // obs.dll is a binary with many strings; a minimal fixture only needs OUR regex to
  // find the version text somewhere in it, same as the real DLL.
  await writeFile(join(root, 'bin/64bit/obs.dll'), Buffer.from('\0\0junk\0' + (engineVersionString ?? '') + '\0more junk\0'));
  await writeFile(join(root, 'config/plugin-catalog.json'), JSON.stringify(catalog ?? []));
  return root;
}

test('readEngineVersion finds the git-describe style string embedded in obs.dll', async () => {
  const root = await fixtureRoot({ engineVersionString: '33.0.1-48-gd328c1924' });
  try {
    const r = await readEngineVersion(root);
    assert.equal(r.version, '33.0.1');
    assert.equal(r.fullString, '33.0.1-48-gd328c1924');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('readEngineVersion reports a clear error, never a fabricated version, when obs.dll is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), '3mix-update-check-'));
  try {
    const r = await readEngineVersion(root);
    assert.equal(r.version, null);
    assert.match(r.error, /não encontrado/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('readPluginCatalog returns [] rather than throwing when the catalog file is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), '3mix-update-check-'));
  try { assert.deepEqual(await readPluginCatalog(root), []); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('checkRemoteVersions: real update detected, never downloads or writes anything', async () => {
  const catalog = [{ id: 'demo-plugin', name: 'Demo Plugin', version: '1.0.0', sourceUrl: 'https://github.com/example/demo-plugin/releases/tag/1.0.0' }];
  const root = await fixtureRoot({ engineVersionString: '33.0.1-48-gd328c1924', catalog });
  try {
    const fetchRelease = async repo => {
      assert.equal(repo, 'example/demo-plugin');
      return { tag: '1.2.0', version: '1.2.0', publishedAt: '2026-01-01T00:00:00Z', url: 'https://github.com/example/demo-plugin/releases/tag/1.2.0' };
    };
    const r = await checkRemoteVersions(root, { engineRepo: 'obsproject/obs-studio', fetchRelease: async (repo) => repo === 'obsproject/obs-studio' ? { tag: '33.0.1', version: '33.0.1', publishedAt: null, url: null } : fetchRelease(repo) });
    const plugin = r.results.find(x => x.id === 'demo-plugin');
    assert.equal(plugin.status, 'atualizacao-disponivel');
    assert.equal(plugin.latestVersion, '1.2.0');
    const engine = r.results.find(x => x.kind === 'engine');
    assert.equal(engine.status, 'atualizado');
    assert.equal(r.summary.atualizacoesDisponiveis, 1);
    assert.match(r.disclaimer, /nenhum arquivo foi baixado/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('checkRemoteVersions: suffixed tag identical to installed version is "atualizado", not a false positive', async () => {
  // Regression test for the real bug found manually against obs-asio: tag "v3.2.1f"
  // vs. installed "3.2.1f" must compare equal, not have the trailing "f" silently
  // dropped by the numeric-core normalization and get flagged as an update.
  const catalog = [{ id: 'obs-asio', name: 'OBS ASIO', version: '3.2.1f', sourceUrl: 'https://github.com/Andersama/obs-asio/releases/tag/v3.2.1f' }];
  const root = await fixtureRoot({ engineVersionString: '33.0.1-1-gabc1234', catalog });
  try {
    const fetchRelease = async () => ({ tag: 'v3.2.1f', version: '3.2.1', publishedAt: null, url: null });
    const r = await checkRemoteVersions(root, { fetchRelease });
    const plugin = r.results.find(x => x.id === 'obs-asio');
    assert.equal(plugin.status, 'atualizado');
    assert.equal(plugin.versionSource, 'catalog');
    assert.equal(plugin.installedVersionVerified, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('checkRemoteVersions: one failing lookup never aborts the others', async () => {
  const catalog = [
    { id: 'good-plugin', name: 'Good Plugin', version: '1.0.0', sourceUrl: 'https://github.com/example/good/releases/tag/1.0.0' },
    { id: 'bad-plugin', name: 'Bad Plugin', version: '1.0.0', sourceUrl: 'https://github.com/example/bad/releases/tag/1.0.0' },
  ];
  const root = await fixtureRoot({ engineVersionString: '33.0.1-1-gabc1234', catalog });
  try {
    const fetchRelease = async repo => {
      if (repo === 'example/bad') throw Error('GitHub recusou a consulta (limite de requisições sem autenticação atingido); tente novamente mais tarde');
      if (repo === 'obsproject/obs-studio') return { tag: '33.0.1', version: '33.0.1', publishedAt: null, url: null };
      return { tag: '1.0.0', version: '1.0.0', publishedAt: null, url: null };
    };
    const r = await checkRemoteVersions(root, { fetchRelease });
    assert.equal(r.results.find(x => x.id === 'good-plugin').status, 'atualizado');
    assert.equal(r.results.find(x => x.id === 'bad-plugin').status, 'erro-consulta');
    assert.equal(r.summary.erros, 1);
    assert.equal(r.summary.total, 3); // engine + 2 plugins, all present despite one failure
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('checkRemoteVersions: catalog entry without a github.com sourceUrl is reported, not silently skipped', async () => {
  const catalog = [{ id: 'no-origin', name: 'Sem origem', version: '1.0.0', sourceUrl: 'https://example.com/not-github' }];
  const root = await fixtureRoot({ engineVersionString: '33.0.1-1-gabc1234', catalog });
  try {
    const r = await checkRemoteVersions(root, { fetchRelease: async () => ({ tag: '33.0.1', version: '33.0.1', publishedAt: null, url: null }) });
    const plugin = r.results.find(x => x.id === 'no-origin');
    assert.equal(plugin.status, 'sem-origem-verificavel');
    assert.equal(r.summary.semOrigemVerificavel, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('checkRemoteVersions: installed version newer than the latest release is flagged distinctly, not as "atualizado"', async () => {
  const catalog = [{ id: 'ahead-plugin', name: 'Ahead Plugin', version: '2.0.0', sourceUrl: 'https://github.com/example/ahead/releases/tag/2.0.0' }];
  const root = await fixtureRoot({ engineVersionString: '33.0.1-1-gabc1234', catalog });
  try {
    const fetchRelease = async repo => repo === 'obsproject/obs-studio' ? { tag: '33.0.1', version: '33.0.1', publishedAt: null, url: null } : { tag: '1.9.0', version: '1.9.0', publishedAt: null, url: null };
    const r = await checkRemoteVersions(root, { fetchRelease });
    assert.equal(r.results.find(x => x.id === 'ahead-plugin').status, 'instalado-mais-novo-que-release');
  } finally { await rm(root, { recursive: true, force: true }); }
});

 test('different suffixes with identical core are not falsely called current',async()=>{
 const root=await fixtureRoot({engineVersionString:'33.0.1-1-gabc1234',catalog:[{id:'suffix',name:'Suffix',version:'3.2.1f',sourceUrl:'https://github.com/example/suffix'}]});
 try {
  const r=await checkRemoteVersions(root,{fetchRelease:async()=>({tag:'v3.2.1g',version:'3.2.1',url:null,publishedAt:null})});
  assert.equal(r.results.find(x=>x.id==='suffix').status,'tag-nao-reconhecida');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('arbitrary component version in a binary is not accepted as libobs identity',async()=>{
 const root=await fixtureRoot({engineVersionString:'other dependency 9.8.7'});
 try {
  const r=await readEngineVersion(root);
  assert.equal(r.version,null);
  assert.match(r.error,/não encontrada/);
 }finally{await rm(root,{recursive:true,force:true});}
});
