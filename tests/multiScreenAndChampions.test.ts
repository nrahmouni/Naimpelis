import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  isInstantDirectMultiStream,
  removeSecondaryStreamAt,
  upsertSecondaryStreamList,
} from '../src/hooks/playback/multiScreenHelpers';
import { parseAppRoute } from '../src/shared/dedicatedRoutes';
import type { SecondaryStreamState } from '../src/types';

const ROOT = process.cwd();

const makeStream = (id: string, title: string, rawSourceUrl: string, layout: 'split' | 'pip' = 'split'): SecondaryStreamState => ({
  id,
  title,
  url: rawSourceUrl,
  rawSourceUrl,
  mode: 'hls',
  layout,
});

describe('Champions World, Multi-Partido (up to 4 screens) & Smart TV ES5 integration', () => {
  it('supports up to 3 secondary streams (4 total screens), deduplicates matches, and forces split grid on 3+ screens', () => {
    let list: SecondaryStreamState[] = [];

    const first = upsertSecondaryStreamList(list, makeStream('s2', 'Arsenal vs PSG', '/api/iptv/live/m2.m3u8', 'pip'));
    list = first.list;
    expect(first.assignedSlot).toBe(1);
    expect(first.duplicateFound).toBe(false);
    expect(list).toHaveLength(1);

    const second = upsertSecondaryStreamList(list, makeStream('s3', 'Inter vs Bayern', '/api/iptv/live/m3.m3u8', 'pip'));
    list = second.list;
    expect(second.assignedSlot).toBe(2);
    expect(list).toHaveLength(2);
    expect(list.every((s) => s.layout === 'split')).toBe(true);

    const third = upsertSecondaryStreamList(list, makeStream('s4', 'Real Madrid vs City', '/api/iptv/live/m4.m3u8'));
    list = third.list;
    expect(third.assignedSlot).toBe(3);
    expect(list).toHaveLength(3);

    const dup = upsertSecondaryStreamList(list, makeStream('s4-dup', 'Real Madrid vs City HD', '/api/iptv/live/m4.m3u8'));
    expect(dup.duplicateFound).toBe(true);
    expect(dup.assignedSlot).toBe(3);
    expect(dup.list).toHaveLength(3);

    const fourthOverflow = upsertSecondaryStreamList(
      list,
      makeStream('s5', 'Barça vs Liverpool', '/api/iptv/live/m5.m3u8'),
      { activeAudioSlot: 3 }
    );
    expect(fourthOverflow.list).toHaveLength(3);
    expect(fourthOverflow.assignedSlot).toBe(2);
    expect(fourthOverflow.list[1].title).toBe('Barça vs Liverpool');
    expect(fourthOverflow.list[2].title).toBe('Real Madrid vs City');
  });

  it('re-indexes activeAudioSlot cleanly when removing secondary screens or clearing all', () => {
    const initial = [
      makeStream('s2', 'P2', '/api/iptv/live/2.m3u8'),
      makeStream('s3', 'P3', '/api/iptv/live/3.m3u8'),
      makeStream('s4', 'P4', '/api/iptv/live/4.m3u8'),
    ];

    const removedBeforeAudio = removeSecondaryStreamAt(initial, 0, 3);
    expect(removedBeforeAudio.list.map((s) => s.title)).toEqual(['P3', 'P4']);
    expect(removedBeforeAudio.nextAudioSlot).toBe(2);

    const removedActiveAudio = removeSecondaryStreamAt(initial, 1, 2);
    expect(removedActiveAudio.nextAudioSlot).toBe(0);

    const clearedAll = removeSecondaryStreamAt(initial, undefined, 2);
    expect(clearedAll.list).toEqual([]);
    expect(clearedAll.nextAudioSlot).toBe(0);
  });

  it('recognizes instant direct multi-screen streams and /champions route', () => {
    expect(isInstantDirectMultiStream('/api/iptv/live/dazn1.m3u8', 'sports_channel')).toBe(true);
    expect(isInstantDirectMultiStream('/api/hls-proxy?url=test', 'tdt_hls')).toBe(true);
    expect(isInstantDirectMultiStream('https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8', 'tdt_hls')).toBe(true);
    expect(isInstantDirectMultiStream('https://example.com/embed/match', 'sports_channel')).toBe(false);

    expect(parseAppRoute('/champions')).toEqual({
      kind: 'world',
      world: 'champions',
      roomId: undefined,
    });
  });

  it('validates public/tv/tv-champions-multi.js is strict ES5 and exposes multi-screen TV APIs', () => {
    const tvMultiPath = path.join(ROOT, 'public/tv/tv-champions-multi.js');
    const code = fs.readFileSync(tvMultiPath, 'utf8');

    expect(code).not.toMatch(/(?:^|\s)(?:let|const|class|async)\s+[a-zA-Z_$]/m);
    expect(code).not.toContain('=>');
    expect(code).not.toContain('`');
    expect(() => new vm.Script(code)).not.toThrow();

    expect(code).toContain('tv-multi-grid');
    expect(code).toContain('MAX_TV_MULTI = 4');
    expect(code).toContain('renderTvChampionsInto');
    expect(code).toContain('stopTvMultiPlayback');
    expect(code).toContain('isTvMultiActive');
  });
});
