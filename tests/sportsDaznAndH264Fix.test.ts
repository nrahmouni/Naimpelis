import { describe, expect, it } from 'vitest';
import {
  analyzeDecodedRgbFrame,
  isFatalH264Stderr,
  validateH264StreamBuffer,
} from '../server/extractors/h264FrameValidator';
import {
  buildFootballMatchChannels,
  isFeaturedSpanishClubMatch,
  resolveMatchSpanishBroadcaster,
  sortTracksWithDaznPriority,
} from '../server/routes/sportsHelpers/footballTeamMatcher';
import { getPermanent247SportsMatches } from '../server/routes/sportsHelpers/sportsChannels247';
import { pickBestCleanSatelliteTrackIndex } from '../src/components/player/hlsHealthWatchdog';
import { buildMiniGuideForChannel } from '../src/components/guide/channelGuideUtils';
import { TDT_DAZN_AND_MOVISTAR_SPORTS_CHANNELS } from '../server/data/tdtDaznSportsChannels';
import {
  formatMadridDateLabel,
  formatSpanishMatchdayLabel,
  resolveCalendarScopeMode,
  translateFootballStatusLabel,
} from '../server/routes/sportsHelpers/upcomingCalendarHelper';
import {
  getLeaguePriorityRank,
  isBarcaOrRealMadridMatch,
  matchesFootballSearchFilter,
  resolveActiveCalendarScope,
} from '../src/components/sports/FootballMatchboardHelpers';
import type { SpanishTdtChannel, StreamTrack } from '../src/types';

describe('H.264 frame & green-screen (#005200) validator', () => {
  it('flags fatal FFmpeg H.264 slice/SPS/CABAC errors', () => {
    expect(isFatalH264Stderr('[h264] decode_slice_header error')).toBe(true);
    expect(isFatalH264Stderr('sps_id 31 out of range')).toBe(true);
    expect(isFatalH264Stderr('Missing reference picture, default is 0')).toBe(true);
    expect(isFatalH264Stderr('frame=1 fps=25.0 q=1.0 size=10kB')).toBe(false);
  });

  it('rejects buffers that are too small, flat, or lack MPEG-TS/MP4 sync', () => {
    expect(validateH264StreamBuffer(Buffer.alloc(512))).toEqual({
      valid: false,
      reason: 'buffer_too_small',
    });

    const noSync = Buffer.alloc(6000, 0x12);
    expect(validateH264StreamBuffer(noSync)).toEqual({
      valid: false,
      reason: 'missing_ts_or_mp4_sync',
    });

    const flatTs = Buffer.alloc(6000, 0x47);
    expect(validateH264StreamBuffer(flatTs)).toEqual({
      valid: false,
      reason: 'flat_corrupt_buffer',
    });

    const validTs = Buffer.alloc(6000);
    for (let i = 0; i < validTs.length; i++) {
      validTs[i] = i % 188 === 0 ? 0x47 : ((i * 37) % 256);
    }
    expect(validateH264StreamBuffer(validTs)).toEqual({ valid: true });
  });

  it('rejects decoded #005200 green screens and uniform grey frames even on exit code 0', () => {
    const W = 160;
    const H = 90;
    const greenBuf = Buffer.alloc(W * H * 3);
    for (let i = 0; i < greenBuf.length; i += 3) {
      greenBuf[i] = 0;
      greenBuf[i + 1] = 82; // #005200
      greenBuf[i + 2] = 0;
    }
    expect(analyzeDecodedRgbFrame(greenBuf, '').clean).toBe(false);

    const greyBuf = Buffer.alloc(W * H * 3);
    for (let i = 0; i < greyBuf.length; i += 3) {
      greyBuf[i] = 129;
      greyBuf[i + 1] = 129;
      greyBuf[i + 2] = 129;
    }
    expect(analyzeDecodedRgbFrame(greyBuf, '').clean).toBe(false);

    const variedBuf = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 3;
        variedBuf[idx] = (x * 7 + y * 3) % 256;
        variedBuf[idx + 1] = (x * 5 + y * 11) % 256;
        variedBuf[idx + 2] = (x * 13 + y * 2) % 256;
      }
    }
    expect(analyzeDecodedRgbFrame(variedBuf, '').clean).toBe(true);
    expect(analyzeDecodedRgbFrame(variedBuf, 'decode_slice_header error').clean).toBe(false);
  });
});

describe('DAZN priority over Movistar & football matchboard rules', () => {
  it('places DAZN strictly before Movistar in LaLiga EA Sports, Champions, and Premier League', () => {
    const laLigaChannels = buildFootballMatchChannels({
      matchId: 'm-barca',
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      statusState: 'live',
      league: {
        slug: 'esp.1',
        regionName: 'España',
        leagueName: 'LaLiga EA Sports',
        regionFlagUrl: '',
        priority: 1,
        broadcasterProfile: 'laliga',
      },
      scrapedMatches: [],
    });

    expect(laLigaChannels.length).toBeGreaterThanOrEqual(4);
    expect(laLigaChannels[0].label).toMatch(/DAZN/i);
    expect(laLigaChannels[0].lang).toBe('ES');
    expect(laLigaChannels[0].quality).toBe('1080p');
    const firstDazn = laLigaChannels.findIndex((c) => /dazn/i.test(c.label));
    const firstMovistar = laLigaChannels.findIndex((c) => /movistar|m\+/i.test(c.label));
    expect(firstDazn).toBe(0);
    expect(firstMovistar).toBeGreaterThan(firstDazn);

    const championsChannels = buildFootballMatchChannels({
      matchId: 'm-ucl',
      homeTeam: 'Arsenal',
      awayTeam: 'Bayern Munich',
      statusState: 'upcoming',
      league: {
        slug: 'uefa.champions',
        regionName: 'Europa',
        leagueName: 'UEFA Champions League',
        regionFlagUrl: '',
        priority: 2,
        broadcasterProfile: 'uefa',
      },
      scrapedMatches: [],
    });
    expect(championsChannels[0].label).toMatch(/DAZN/i);

    const premierChannels = buildFootballMatchChannels({
      matchId: 'm-epl',
      homeTeam: 'Liverpool',
      awayTeam: 'Chelsea',
      statusState: 'live',
      league: {
        slug: 'eng.1',
        regionName: 'Inglaterra',
        leagueName: 'Premier League',
        regionFlagUrl: '',
        priority: 3,
        broadcasterProfile: 'europe',
      },
      scrapedMatches: [],
    });
    expect(premierChannels[0].label).toMatch(/DAZN/i);
    expect(resolveMatchSpanishBroadcaster('esp.1')?.brand).toBe('dazn');
  });

  it('orders DAZN first in 24/7 multiplexes and in sortTracksWithDaznPriority', () => {
    const mux = getPermanent247SportsMatches();
    const laLigaMux = mux.find((m) => m.id === 'mux-laliga');
    const uclMux = mux.find((m) => m.id === 'mux-champions');
    expect(laLigaMux?.channels[0].label).toMatch(/DAZN/i);
    expect(uclMux?.channels[0].label).toMatch(/DAZN/i);

    const sorted = sortTracksWithDaznPriority([
      { label: 'Movistar LaLiga TV', lang: 'ES' },
      { label: 'beIN Sports 1', lang: 'AR' },
      { label: 'DAZN LaLiga HD', lang: 'ES' },
    ]);
    expect(sorted[0].label).toBe('DAZN LaLiga HD');
  });

  it('prioritizes FC Barcelona & Real Madrid and resolves quick shortcuts including barça', () => {
    expect(isFeaturedSpanishClubMatch('FC Barcelona', 'Getafe')).toBe(true);
    expect(isBarcaOrRealMadridMatch('Real Madrid', 'Girona')).toBe(true);
    expect(isBarcaOrRealMadridMatch('Getafe', 'Osasuna')).toBe(false);

    const barcaRank = getLeaguePriorityRank('esp.1', 'LaLiga EA Sports', 'FC Barcelona', 'Sevilla');
    const normalLaLigaRank = getLeaguePriorityRank('esp.1', 'LaLiga EA Sports', 'Getafe', 'Osasuna');
    const secondDivRank = getLeaguePriorityRank('esp.2', 'LaLiga Hypermotion', 'Almería', 'Oviedo');
    expect(barcaRank).toBeGreaterThan(normalLaLigaRank);
    expect(normalLaLigaRank).toBeGreaterThan(secondDivRank);

    expect(
      matchesFootballSearchFilter(
        {
          homeTeam: 'FC Barcelona',
          awayTeam: 'Villarreal',
          groupTitle: 'LaLiga EA Sports',
          leagueName: 'LaLiga EA Sports',
          leagueSlug: 'esp.1',
          regionName: 'España',
        },
        'barça'
      )
    ).toBe(true);

    expect(
      matchesFootballSearchFilter(
        {
          homeTeam: 'Real Madrid',
          awayTeam: 'PSV',
          groupTitle: 'Europa: Champions League',
          leagueName: 'Champions League',
          leagueSlug: 'uefa.champions',
          regionName: 'Europa',
        },
        'barca madrid'
      )
    ).toBe(true);
  });

  it('resolves extended multi-week calendar scopes for Champions League, Barça, Real Madrid & Barça+Madrid', () => {
    expect(resolveCalendarScopeMode({ calendar: 'champions' })).toEqual({
      kind: 'league',
      key: 'champions',
      slug: 'uefa.champions',
    });
    expect(resolveCalendarScopeMode({ league: 'Champions League' })).toEqual({
      kind: 'league',
      key: 'champions',
      slug: 'uefa.champions',
    });
    expect(resolveCalendarScopeMode({ team: 'barça' })).toEqual({
      kind: 'team',
      key: 'barcelona',
      teamIds: ['83'],
    });
    expect(resolveCalendarScopeMode({ team: 'Real Madrid' })).toEqual({
      kind: 'team',
      key: 'real_madrid',
      teamIds: ['86'],
    });
    expect(resolveCalendarScopeMode({ calendar: 'barca_madrid' })).toEqual({
      kind: 'team',
      key: 'barca_madrid',
      teamIds: ['83', '86'],
    });

    expect(resolveActiveCalendarScope('champions', '')).toBe('champions');
    expect(resolveActiveCalendarScope('', 'barca madrid')).toBe('barca_madrid');
    expect(resolveActiveCalendarScope('', 'barcelona')).toBe('barcelona');
    expect(resolveActiveCalendarScope('', 'real madrid')).toBe('real_madrid');

    const futureDate = new Date(Date.now() + 9 * 86_400_000);
    const label = formatMadridDateLabel(futureDate, '20261119');
    expect(label.length).toBeGreaterThanOrEqual(5);
    expect(label).not.toBe('Hoy');
  });
});

describe('Android Chrome backup satellite selector & Similar Channels mini-guide', () => {
  it('picks clean 1080p DAZN/satellite backup tracks while skipping failed URLs', () => {
    const tracks: StreamTrack[] = [
      {
        id: 't-0',
        label: 'Broken Primary',
        lang: 'ES',
        quality: '720p',
        sourceUrl: 'https://bad.example.com/1.m3u8',
      },
      {
        id: 't-1',
        label: 'StreamX mirror',
        lang: 'ES',
        quality: '720p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=laliga',
      },
      {
        id: 't-2',
        label: 'DAZN LaLiga Sat 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/538',
      },
    ];

    const bestIdx = pickBestCleanSatelliteTrackIndex(
      tracks,
      0,
      new Set(['https://bad.example.com/1.m3u8'])
    );
    expect(bestIdx).toBe(2);
  });

  it('builds a structured mini programming guide for every channel even without external XMLTV', () => {
    const channel: SpanishTdtChannel = {
      id: 'bein-mena-4',
      name: 'beIN SPORTS 4 (العربية)',
      shortMark: 'beIN 4',
      dial: 304,
      category: 'bein_arabic',
      network: 'beIN MENA',
      description: 'Partidos en directo de fútbol europeo e internacional',
      logoBg: '#4c1d95',
      channels: [
        {
          id: 'sig-1',
          label: 'beIN SPORTS 4 HD',
          lang: 'AR',
          quality: '1080p',
          sourceUrl: 'https://example.com/bein4.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    };

    const mini = buildMiniGuideForChannel(channel, null, Date.UTC(2026, 10, 19, 17, 18, 0));
    expect(mini.nowTitle.length).toBeGreaterThan(5);
    expect(mini.startLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(mini.stopLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(mini.nextStartLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(mini.progressPct).toBeGreaterThan(0);
    expect(mini.isEstimated).toBe(true);
  });

  it('allows benign MPEG-TS buffering SPS notices while keeping all 6 DAZN channels backed up', () => {
    expect(isFatalH264Stderr('[h264 @ 0x1] non-existing SPS 0 referenced in buffering period')).toBe(false);

    const requiredIds = ['dazn-laliga', 'dazn-1', 'dazn-2', 'dazn-3', 'dazn-4', 'dazn-f1'];
    for (const id of requiredIds) {
      const ch = TDT_DAZN_AND_MOVISTAR_SPORTS_CHANNELS.find((c) => c.id === id);
      expect(ch, `missing ${id}`).toBeDefined();
      expect(ch!.channels.length).toBeGreaterThanOrEqual(3);
      expect(ch!.channels.some((s) => s.sourceUrl.includes('/stream/525'))).toBe(false);
    }

    const sortedLaLiga = sortTracksWithDaznPriority(
      [
        { label: 'DAZN 1 HD (Español)', lang: 'ES' },
        { label: 'Movistar LaLiga TV HD', lang: 'ES' },
        { label: 'DAZN LaLiga HD (Español)', lang: 'ES' },
      ],
      'esp.1'
    );
    expect(sortedLaLiga[0].label).toContain('DAZN LaLiga');

    expect(formatSpanishMatchdayLabel(14)).toBe('Jornada 14');
    expect(formatSpanishMatchdayLabel('League Phase')).toBe('Fase de Liga');
    expect(formatSpanishMatchdayLabel('Quarterfinals')).toBe('Cuartos');
    expect(translateFootballStatusLabel('Postponed', 'upcoming')).toBe('Aplazado');
    expect(translateFootballStatusLabel('HT', 'live')).toBe('Descanso');
  });
});
