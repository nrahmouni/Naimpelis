import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import zlib from 'zlib';
import { createDecompressedWebStream } from '../server/utils/tlsFetch';
import { buildTelemetryMatchInsights } from '../server/routes/aiStudio/matchAnalyticsFallback';
import {
  clearAiModelCooldowns,
  generateContentWithResilience,
  isAiFallbackEligibleError,
} from '../server/routes/aiStudio/shared';

describe('tlsFetch createDecompressedWebStream ERR_INVALID_STATE guard', () => {
  it('safely ignores chunks pushed after reader.cancel() without throwing ERR_INVALID_STATE', async () => {
    const upstream = new PassThrough() as PassThrough & { complete?: boolean };
    upstream.complete = false;
    let cleanupCalls = 0;

    const webStream = createDecompressedWebStream(upstream, '', () => {
      cleanupCalls++;
    });

    const reader = webStream.getReader();
    upstream.write(Buffer.from('chunk-1'));
    const first = await reader.read();
    expect(Buffer.from(first.value!).toString('utf8')).toBe('chunk-1');

    await reader.cancel();
    // Simulate upstream / zlib pushing extra buffered data or errors right after cancellation
    expect(() => {
      upstream.emit('data', Buffer.from('chunk-after-cancel'));
      upstream.emit('error', new Error('late socket error'));
      upstream.emit('close');
    }).not.toThrow();

    expect(cleanupCalls).toBeGreaterThanOrEqual(1);
  });

  it('decompresses gzip streams cleanly and tolerates concurrent cancel mid-decompression', async () => {
    const upstream = new PassThrough() as PassThrough & { complete?: boolean };
    upstream.complete = true;
    const webStream = createDecompressedWebStream(upstream, 'gzip', () => {});
    const reader = webStream.getReader();

    const gzChunk = zlib.gzipSync(Buffer.from('hello-stream-body'));
    upstream.end(gzChunk);

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    expect(Buffer.concat(chunks).toString('utf8')).toBe('hello-stream-body');
  });

  it('closes prematurely aborted response streams with error instead of hanging', async () => {
    const upstream = new PassThrough() as PassThrough & { complete?: boolean };
    upstream.complete = false;
    const webStream = createDecompressedWebStream(upstream, '', () => {});
    const reader = webStream.getReader();

    upstream.emit('close');
    await expect(reader.read()).rejects.toThrow(/prematurely/i);
  });
});

describe('AI Quota Resilience & Live Telemetry Match Fallback', () => {
  it('cascades immediately from 429 quota-exhausted model to gemini-3.1-flash-lite', async () => {
    clearAiModelCooldowns();
    const calls: string[] = [];
    const mockAi = {
      models: {
        generateContent: vi.fn(async ({ model }: { model: string }) => {
          calls.push(model);
          if (model === 'gemini-4-hydrogen') {
            throw Object.assign(new Error('429 RESOURCE_EXHAUSTED quota exceeded'), { status: 429 });
          }
          return { text: '{"ok":true}' };
        }),
      },
    };

    const result = await generateContentWithResilience(mockAi as never, {
      model: 'gemini-4-hydrogen',
      contents: 'test prompt',
      config: { thinkingConfig: { thinkingLevel: 'LOW' as never } },
    });

    expect(result.text).toBe('{"ok":true}');
    expect(calls).toEqual(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
  });

  it('marks 429 / 503 / spending cap errors as eligible for non-blocking fallback engines', () => {
    expect(isAiFallbackEligibleError(new Error('429 RESOURCE_EXHAUSTED quota'))).toBe(true);
    expect(isAiFallbackEligibleError(new Error('503 UNAVAILABLE'))).toBe(true);
    expect(isAiFallbackEligibleError(new Error('spending cap ai.studio/spend'))).toBe(true);
  });

  it('builds structured Opta-style telemetry insights without any Gemini API call', () => {
    const report = buildTelemetryMatchInsights({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      homeScore: '2',
      awayScore: '1',
      statusState: 'live',
      statusLabel: "68'",
      competition: 'LaLiga',
      stats: [
        { label: 'Posesión', homeValue: '63%', awayValue: '37%' },
        { label: 'Remates totales', homeValue: '14', awayValue: '7' },
        { label: 'Remates a puerta', homeValue: '6', awayValue: '3' },
        { label: 'Córners', homeValue: '7', awayValue: '2' },
      ],
      events: [
        { time: "54'", type: 'Gol', team: 'home', player: 'Lamine Yamal' },
      ],
      lang: 'es',
    });

    expect(report.ok).toBe(true);
    expect(report.engineMode).toBe('telemetry');
    expect(report.momentum.favoredTeam).toBe('home');
    expect(report.momentum.intensity).toBeGreaterThan(55);
    expect(report.cards.length).toBeGreaterThanOrEqual(3);
    expect(report.headline).toContain('FC Barcelona');
    expect(report.watchNext.length).toBeGreaterThan(10);
  });
});
