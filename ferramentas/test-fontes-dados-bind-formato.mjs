// Teste real de integração: DataSources.bind()/mapped() (classe de produção real, não um
// mock) com a formatação por campo nova. Usa um diretório temporário real (mkdtemp) como
// root, exatamente como DataSources grava de verdade em config/obs-studio/plugin_config/
// freemix-data -- prova persistência real, não só a função pura isolada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSources } from './fontes-dados.mjs';

async function novaFonte() {
  const root = await mkdtemp(join(tmpdir(), '3mix-dados-formato-'));
  const ds = new DataSources(root);
  await ds.setScope('Projeto Teste');
  const s = await ds.import({
    name: 'Placar e hora', format: 'csv',
    text: 'equipe,gols,duracaoMs,inicioISO\nTime A,3,65000,2026-11-04T15:30:00',
  });
  return { root, ds, id: s.id };
}

test('bind() sem format: comportamento idêntico ao de antes desta extensão existir (zero regressão)', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await ds.bind({ id, kind: 'lower', mapping: { title: 'equipe', subtitle: 'gols' } });
    const mapped = ds.mapped(id);
    assert.equal(mapped.data.title, 'Time A', 'sem formato, o campo sai exatamente como a célula crua');
    assert.equal(mapped.data.subtitle, '3');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind() com format: campo formatado aplica a transformação; campo sem format continua cru', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await ds.bind({
      id, kind: 'lower',
      mapping: { title: 'equipe', subtitle: 'duracaoMs' },
      format: { subtitle: { type: 'milliseconds', style: 'mm:ss' } },
    });
    const mapped = ds.mapped(id);
    assert.equal(mapped.data.title, 'Time A', 'campo sem formato (title) continua cru');
    assert.equal(mapped.data.subtitle, '01:05', 'campo com formato (subtitle) vira mm:ss');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind() com format: persiste de verdade em disco (setScope de novo relê o arquivo gravado)', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await ds.bind({
      id, kind: 'lower',
      mapping: { title: 'equipe', subtitle: 'inicioISO' },
      format: { subtitle: { type: 'time', seconds: false } },
    });
    const ds2 = new DataSources(root);
    await ds2.setScope('Projeto Teste');
    const mapped = ds2.mapped(id);
    assert.equal(mapped.data.subtitle, '15:30', 'formato sobrevive a uma releitura real do disco, não só em memória');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind() rejeita format para kind="score" -- o contrato numérico do template de placar não pode ser formatado como texto', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await assert.rejects(
      ds.bind({ id, kind: 'score', mapping: { scoreHome: 'gols' }, format: { scoreHome: { type: 'number' } } }),
      /Placar/,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind() rejeita formato para campo sem vínculo correspondente', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await assert.rejects(
      ds.bind({ id, kind: 'lower', mapping: { title: 'equipe' }, format: { subtitle: { type: 'text' } } }),
      /sem vínculo/,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind(): reconfigurar sem format remove a formatação anterior (binding é substituído por completo, não mesclado)', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await ds.bind({ id, kind: 'lower', mapping: { title: 'equipe', subtitle: 'duracaoMs' }, format: { subtitle: { type: 'milliseconds' } } });
    assert.equal(ds.mapped(id).data.subtitle, '01:05');
    await ds.bind({ id, kind: 'lower', mapping: { title: 'equipe', subtitle: 'duracaoMs' } }); // sem format
    assert.equal(ds.mapped(id).data.subtitle, '65000', 'sem format no novo bind(), o campo volta a sair cru');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bind(): formato malformado (não objeto) é ignorado silenciosamente como "sem formato", nunca lança por um payload incompleto', async () => {
  const { root, ds, id } = await novaFonte();
  try {
    await ds.bind({ id, kind: 'lower', mapping: { title: 'equipe' }, format: 'não é objeto' });
    assert.equal(ds.mapped(id).data.title, 'Time A');
  } finally { await rm(root, { recursive: true, force: true }); }
});
