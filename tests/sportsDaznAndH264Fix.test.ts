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
  resolvePreferredSportsTrackLang,
  resolveVerifiedSpanishBroadcasterBadge,
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
  isSpainNationalTeamMatch,
  matchesFootballSearchFilter,
  pickPreferredChannelIndex,
  resolveActiveCalendarScope,
  resolveRecommendedSportsLang,
} from '../src/components/sports/FootballMatchboardHelpers';
import { computeDayOffsetFromIsoDate } from '../src/components/sports/FootballMatchboardParts';
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

describe('Verified TV schedule per match & DAZN priority rules', () => {
  const emptyVerifiedSchedule = {
    checked: true,
    esBroadcasterNames: [],
    enBroadcasterNames: [],
    zhBroadcasterNames: [],
    epgMatches: [],
  };

  it('never invents fake channels when TV programming has not been announced yet', () => {
    const unconfirmed = buildFootballMatchChannels({
      matchId: 'm-future-tba',
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      statusState: 'upcoming',
      kickoffMs: Date.UTC(2026, 11, 20, 20, 0, 0),
      league: {
        slug: 'esp.1',
        regionName: 'España',
        leagueName: 'LaLiga EA Sports',
        regionFlagUrl: '',
        priority: 1,
        broadcasterProfile: 'laliga',
      },
      scrapedMatches: [],
      verifiedSchedule: emptyVerifiedSchedule,
    });

    expect(unconfirmed).toEqual([]);
    expect(resolveMatchSpanishBroadcaster('esp.1', 'LaLiga EA Sports', emptyVerifiedSchedule)).toBeNull();
  });

  it('assigns ONLY M+ LaLiga / Movistar Plus+ when TV guide confirms Movistar exclusively (no fake DAZN)', () => {
    const schedule = {
      checked: true,
      esBroadcasterNames: ['M+ LALIGA', 'Movistar Plus+'],
      enBroadcasterNames: ['Disney+ (UK)'],
      zhBroadcasterNames: [],
      epgMatches: [],
    };
    const madridChannels = buildFootballMatchChannels({
      matchId: 'm-madrid-celta',
      homeTeam: 'Real Madrid',
      awayTeam: 'Celta Vigo',
      statusState: 'upcoming',
      league: {
        slug: 'esp.1',
        regionName: 'España',
        leagueName: 'LaLiga EA Sports',
        regionFlagUrl: '',
        priority: 1,
        broadcasterProfile: 'laliga',
      },
      scrapedMatches: [],
      verifiedSchedule: schedule,
    });

    expect(madridChannels.length).toBeGreaterThanOrEqual(2);
    expect(madridChannels.some((c) => /M\+ LaLiga/i.test(c.label))).toBe(true);
    expect(madridChannels.some((c) => /Movistar Plus\+/i.test(c.label))).toBe(true);
    expect(madridChannels.some((c) => /DAZN/i.test(c.label))).toBe(false);
    expect(madridChannels.some((c) => c.lang === 'ZH')).toBe(false);
    expect(madridChannels.some((c) => c.lang === 'EN')).toBe(false);

    const badge = resolveVerifiedSpanishBroadcasterBadge(schedule);
    expect(badge?.brand).toBe('movistar');
    expect(badge?.name).toMatch(/M\+ LaLiga/);
  });

  it('assigns ONLY DAZN LaLiga when TV guide confirms DAZN exclusively (no fake Movistar)', () => {
    const schedule = {
      checked: true,
      esBroadcasterNames: ['DAZN', 'DAZN LaLiga'],
      enBroadcasterNames: [],
      zhBroadcasterNames: [],
      epgMatches: [],
    };
    const barcaChannels = buildFootballMatchChannels({
      matchId: 'm-barca-villarreal',
      homeTeam: 'Barcelona',
      awayTeam: 'Villarreal',
      statusState: 'upcoming',
      league: {
        slug: 'esp.1',
        regionName: 'España',
        leagueName: 'LaLiga EA Sports',
        regionFlagUrl: '',
        priority: 1,
        broadcasterProfile: 'laliga',
      },
      scrapedMatches: [],
      verifiedSchedule: schedule,
    });

    expect(barcaChannels.length).toBeGreaterThanOrEqual(1);
    expect(barcaChannels[0].label).toMatch(/DAZN LaLiga/i);
    expect(barcaChannels.some((c) => /M\+ LaLiga|Movistar/i.test(c.label))).toBe(false);

    const badge = resolveVerifiedSpanishBroadcasterBadge(schedule);
    expect(badge?.brand).toBe('dazn');
    expect(badge?.name).toBe('DAZN LaLiga');
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

describe('Language-based channel recommendations, Selección Española priority & full-season calendar', () => {
  it('maps es/ca/rif to ES channels, en to EN channels, and zh to ZH channels', () => {
    expect(resolveRecommendedSportsLang('es')).toBe('ES');
    expect(resolveRecommendedSportsLang('ca')).toBe('ES');
    expect(resolveRecommendedSportsLang('rif')).toBe('ES');
    expect(resolveRecommendedSportsLang('en')).toBe('EN');
    expect(resolveRecommendedSportsLang('zh')).toBe('ZH');

    expect(resolvePreferredSportsTrackLang('es')).toBe('ES');
    expect(resolvePreferredSportsTrackLang('ca')).toBe('ES');
    expect(resolvePreferredSportsTrackLang('rif')).toBe('ES');
    expect(resolvePreferredSportsTrackLang('en')).toBe('EN');
    expect(resolvePreferredSportsTrackLang('zh')).toBe('ZH');
  });

  it('selects confirmed ES/EN/ZH channels by app language only when each language broadcast is verified in TV schedules', () => {
    const tomorrowMs = Date.now() + 26 * 60 * 60 * 1000;
    const multiLangVerifiedSchedule = {
      checked: true,
      esBroadcasterNames: ['DAZN 1', 'M+ Liga de Campeones'],
      enBroadcasterNames: ['Sky Sports Premier League', 'Sky Sports Main Event'],
      zhBroadcasterNames: ['CCTV-5'],
      epgMatches: [],
    };
    const verifiedMultiLang = buildFootballMatchChannels({
      matchId: 'm-liverpool-utd',
      homeTeam: 'Liverpool',
      awayTeam: 'Manchester United',
      statusState: 'upcoming',
      kickoffMs: tomorrowMs,
      league: {
        slug: 'eng.1',
        regionName: 'Inglaterra',
        leagueName: 'Premier League',
        regionFlagUrl: '',
        priority: 2,
        broadcasterProfile: 'europe',
      },
      scrapedMatches: [],
      verifiedSchedule: multiLangVerifiedSchedule,
    });

    const esIdx = pickPreferredChannelIndex(verifiedMultiLang, 'es');
    const caIdx = pickPreferredChannelIndex(verifiedMultiLang, 'ca');
    const rifIdx = pickPreferredChannelIndex(verifiedMultiLang, 'rif');
    const enIdx = pickPreferredChannelIndex(verifiedMultiLang, 'en');
    const zhIdx = pickPreferredChannelIndex(verifiedMultiLang, 'zh');

    expect(verifiedMultiLang[esIdx].lang).toBe('ES');
    expect(verifiedMultiLang[esIdx].label).toMatch(/DAZN 1/i);
    expect(verifiedMultiLang[caIdx].lang).toBe('ES');
    expect(verifiedMultiLang[rifIdx].lang).toBe('ES');
    expect(verifiedMultiLang[enIdx].lang).toBe('EN');
    expect(verifiedMultiLang[enIdx].label).toMatch(/Sky Sports Premier League/i);
    expect(verifiedMultiLang[zhIdx].lang).toBe('ZH');
    expect(verifiedMultiLang[zhIdx].label).toMatch(/CCTV-5/i);

    const enSorted = sortTracksWithDaznPriority(verifiedMultiLang, 'eng.1', 'EN');
    expect(enSorted[0].lang).toBe('EN');

    const zhSorted = sortTracksWithDaznPriority(verifiedMultiLang, 'eng.1', 'ZH');
    expect(zhSorted[0].lang).toBe('ZH');
  });

  it('prioritizes Selección Española alongside Barça & Real Madrid without false-matching Espanyol', () => {
    expect(isSpainNationalTeamMatch('España', 'Francia')).toBe(true);
    expect(isSpainNationalTeamMatch('Spain', 'Germany')).toBe(true);
    expect(isSpainNationalTeamMatch('RCD Espanyol', 'Valencia')).toBe(false);

    expect(isFeaturedSpanishClubMatch('España', 'Portugal')).toBe(true);
    expect(isFeaturedSpanishClubMatch('RCD Espanyol', 'Getafe')).toBe(false);

    const spainRank = getLeaguePriorityRank('uefa.nations', 'Europa: Liga de Naciones UEFA', 'España', 'Croacia');
    const premierRank = getLeaguePriorityRank('eng.1', 'Inglaterra: Premier League', 'Everton', 'Wolves');
    expect(spainRank).toBeGreaterThan(premierRank);

    expect(resolveCalendarScopeMode({ calendar: 'espana' })).toEqual({
      kind: 'team',
      key: 'espana',
      teamIds: ['164'],
    });
    expect(resolveActiveCalendarScope('espana', '')).toBe('espana');
    expect(resolveActiveCalendarScope('barca_madrid', '')).toBe('barca_madrid');
    expect(resolveActiveCalendarScope('', 'RCD Espanyol')).not.toBe('espana');

    expect(computeDayOffsetFromIsoDate('2099-01-01')).toBeGreaterThan(365);
  });
});
