import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BROADCAST_PROFILES,
  estimativaMultiCorder,
  testeEscritaConcorrente
} from '../../ferramentas/disco-producao.mjs';
import { DiskReplay } from '../../ferramentas/replay-disco.mjs';

test('Perfis Broadcast e Estimativa de Armazenamento MultiCorder', async (t) => {
  await t.test('Perfis canônicos estão definidos com parâmetros válidos', () => {
    assert.ok(BROADCAST_PROFILES.xdcam_hd422, 'XDCAM HD422 deve existir');
    assert.equal(BROADCAST_PROFILES.xdcam_hd422.bitrateMbps, 50);
    assert.equal(BROADCAST_PROFILES.xdcam_hd422.container, 'mxf');

    assert.ok(BROADCAST_PROFILES.dnxhd_220, 'DNxHD 220 deve existir');
    assert.equal(BROADCAST_PROFILES.dnxhd_220.bitrateMbps, 220);
    assert.equal(BROADCAST_PROFILES.dnxhd_220.container, 'mxf');

    assert.ok(BROADCAST_PROFILES.prores_422, 'ProRes 422 deve existir');
    assert.equal(BROADCAST_PROFILES.prores_422.container, 'mov');

    assert.ok(BROADCAST_PROFILES.dnxhr_444, 'DNxHR 444 deve existir');
    assert.equal(BROADCAST_PROFILES.dnxhr_444.bitrateMbps, 440);
  });

  await t.test('Cálculo de vazão em MB/s e consumo em GB/h', () => {
    // 1 câmera XDCAM HD422 (50 Mbps):
    // 50 Mbps = 6.25 MB/s = 22.5 GB/h
    const est1 = estimativaMultiCorder({ format: 'mxf', camsCount: 1, broadcastProfile: 'xdcam_hd422', freeGb: 225 });
    assert.equal(est1.bitrateMbps, 50);
    assert.equal(est1.mbPerSecPerCam, 6.25);
    assert.equal(est1.gbPerHourPerCam, 22.5);
    assert.equal(est1.totalCams, 1);
    assert.equal(est1.totalMbPerSec, 6.25);
    assert.equal(est1.totalGbPerHour, 22.5);
    assert.equal(est1.estHoursRemaining, 10.0);
    assert.equal(est1.severity, 'OK');

    // 4 câmeras DNxHD 220 (220 Mbps cada):
    // Por cam: 27.5 MB/s, 99.0 GB/h. Total 4 cams: 110.0 MB/s, 396.0 GB/h.
    const est4 = estimativaMultiCorder({ format: 'mxf', camsCount: 4, broadcastProfile: 'dnxhd_220', freeGb: 396 });
    assert.equal(est4.mbPerSecPerCam, 27.5);
    assert.equal(est4.gbPerHourPerCam, 99.0);
    assert.equal(est4.totalCams, 4);
    assert.equal(est4.totalMbPerSec, 110.0);
    assert.equal(est4.totalGbPerHour, 396.0);
    assert.equal(est4.estHoursRemaining, 1.0);
    assert.equal(est4.severity, 'WARN');

    // Disco quase cheio (< 1h restante):
    const estCrit = estimativaMultiCorder({ format: 'mxf', camsCount: 4, broadcastProfile: 'dnxhd_220', freeGb: 100 });
    assert.equal(estCrit.severity, 'CRITICAL');
  });

  await t.test('Benchmark concorrente de escrita não destrutivo', async () => {
    const tmp1 = await mkdtemp(join(tmpdir(), '3mix-bench-1-'));
    const tmp2 = await mkdtemp(join(tmpdir(), '3mix-bench-2-'));

    try {
      // Escreve blocos de 2MB simultaneamente
      const res = await testeEscritaConcorrente([tmp1, tmp2], 2 * 1024 * 1024);
      assert.ok(res.success, 'Benchmark concorrente deve completar com sucesso');
      assert.equal(res.resultados.length, 2);
      for (const r of res.resultados) {
        assert.ok(r.gravado, 'Arquivo de benchmark deve ter sido gravado');
        assert.ok(r.velocidadeMBs > 0, 'Velocidade deve ser positiva');
        assert.equal(r.erro, null);
      }
    } finally {
      await rm(tmp1, { recursive: true, force: true }).catch(() => {});
      await rm(tmp2, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test('Suporte a formatos MXF e MOV no motor de Replay/ISO (DiskReplay)', async () => {
    // Instanciação isolada de DiskReplay com mock
    const fakeObs = {
      connected: true,
      req: async (tipo, dados) => {
        if (tipo === 'CallVendorRequest' && dados?.requestType === 'get_destinations') {
          return {
            responseData: {
              success: true,
              encoders: [
                { id: 'obs_x264', codec: 'h264' },
                { id: 'ffmpeg_dnxhd', codec: 'dnxhd' },
                { id: 'ffmpeg_prores', codec: 'prores' },
                { id: 'ffmpeg_xdcam', codec: 'mpeg2video' }
              ]
            }
          };
        }
        return { responseData: { success: true } };
      }
    };

    const replay = new DiskReplay({ root: '.', getObs: () => fakeObs, filter: 'ISO Test', namespace: 'test-iso' });

    // Validação de encoders com codecs broadcast
    const encoders = await replay.validateIsoEncoders({
      format: 'mxf',
      encoder: 'ffmpeg_dnxhd'
    });
    assert.ok(encoders.has('ffmpeg_dnxhd'), 'Encoder DNxHD deve ser aceito');

    const encodersProRes = await replay.validateIsoEncoders({
      format: 'mov',
      encoder: 'ffmpeg_prores'
    });
    assert.ok(encodersProRes.has('ffmpeg_prores'), 'Encoder ProRes deve ser aceito');
  });
});

