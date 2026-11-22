import { describe, expect, it } from 'vitest';
import type { SportsMatch } from '../src/types';
import {
  BARCA_MADRID_PRE_KICKOFF_WINDOW_MS,
  getBarcaMadridBannerDisplayMeta,
  getBarcaMadridHomeMatches,
  getPreferredBarcaMadridChannelIndex,
  isBarcaOrMadridHomeReadyMatch,
  isFirstTeamBarcelonaOrRealMadridName,
} from '../src/components/home/barcaMadridHomeHelper';

function makeMatch(overrides: Partial<SportsMatch> & {
  homeTeam?: string;
  awayTeam?: string;
  statusState?: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  kickoffMs?: number;
  kickoffTime?: string;
  leagueSlug?: string;
  leagueName?: string;
}): SportsMatch {
  const homeTeam = overrides.homeTeam ?? 'Real Madrid';
  const awayTeam = overrides.awayTeam ?? 'Celta Vigo';
  return {
    id: overrides.id ?? 'fb-test-1',
    title: `${homeTeam} vs ${awayTeam}`,
    competition: overrides.competition ?? 'España: LaLiga EA Sports',
    sport: overrides.sport ?? 'soccer',
    time: overrides.time ?? (overrides.kickoffTime || '21:00'),
    isLive: overrides.isLive ?? overrides.statusState === 'live',
    is247Channel: overrides.is247Channel ?? false,
    channels: overrides.channels ?? [
      {
        id: 'ch-en',
        label: 'Sky Sports UK (EN)',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://example.com/en.m3u8',
        resolverType: 'sports_channel',
      },
      {
        id: 'ch-es',
        label: 'DAZN LaLiga HD (Oficial · Guía TV)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://example.com/es.m3u8',
        resolverType: 'sports_channel',
      },
    ],
    matchMeta: {
      eventId: '100',
      leagueSlug: overrides.leagueSlug ?? 'esp.1',
      leagueName: overrides.leagueName ?? 'LaLiga EA Sports',
      homeTeam,
      awayTeam,
      homeShort: homeTeam.slice(0, 3).toUpperCase(),
      awayShort: awayTeam.slice(0, 3).toUpperCase(),
      homeScore: overrides.matchMeta?.homeScore ?? '-',
      awayScore: overrides.matchMeta?.awayScore ?? '-',
      statusState: overrides.statusState ?? 'upcoming',
      statusLabel: overrides.statusLabel ?? 'Por empezar',
      kickoffMs: overrides.kickoffMs,
      kickoffTime: overrides.kickoffTime ?? '21:00',
    },
  };
}

describe('Barcelona / Real Madrid Home 30-minute direct playback window', () => {
  const baseNow = 1_800_000_000_000;

  it('matches only first-team FC Barcelona and Real Madrid clubs', () => {
    expect(isFirstTeamBarcelonaOrRealMadridName('Barcelona')).toBe(true);
    expect(isFirstTeamBarcelonaOrRealMadridName('FC Barcelona')).toBe(true);
    expect(isFirstTeamBarcelonaOrRealMadridName('Barça')).toBe(true);
    expect(isFirstTeamBarcelonaOrRealMadridName('Real Madrid')).toBe(true);
    expect(isFirstTeamBarcelonaOrRealMadridName('Real Madrid CF')).toBe(true);

    expect(isFirstTeamBarcelonaOrRealMadridName('Real Madrid C')).toBe(false);
    expect(isFirstTeamBarcelonaOrRealMadridName('Real Madrid Castilla')).toBe(false);
    expect(isFirstTeamBarcelonaOrRealMadridName('Barcelona SC')).toBe(false);
    expect(isFirstTeamBarcelonaOrRealMadridName('Barcelona Atlètic')).toBe(false);
    expect(isFirstTeamBarcelonaOrRealMadridName('FC Barcelona Femení')).toBe(false);
    expect(isFirstTeamBarcelonaOrRealMadridName('Atlético Madrid')).toBe(false);
  });

  it('hides match at 30m01s before kickoff and shows it at exact 30m00s before kickoff', () => {
    expect(BARCA_MADRID_PRE_KICKOFF_WINDOW_MS).toBe(30 * 60 * 1000);
    const tooEarly = makeMatch({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Sevilla',
      statusState: 'upcoming',
      kickoffMs: baseNow + BARCA_MADRID_PRE_KICKOFF_WINDOW_MS + 1000,
    });
    const exact30Min = makeMatch({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Sevilla',
      statusState: 'upcoming',
      kickoffMs: baseNow + BARCA_MADRID_PRE_KICKOFF_WINDOW_MS,
    });
    const fifteenMinLeft = makeMatch({
      homeTeam: 'Real Madrid',
      awayTeam: 'Celta Vigo',
      statusState: 'upcoming',
      kickoffMs: baseNow + 15 * 60 * 1000,
    });

    expect(isBarcaOrMadridHomeReadyMatch(tooEarly, baseNow)).toBe(false);
    expect(isBarcaOrMadridHomeReadyMatch(exact30Min, baseNow)).toBe(true);
    expect(isBarcaOrMadridHomeReadyMatch(fifteenMinLeft, baseNow)).toBe(true);
  });

  it('shows live match with score and removes finished, other-club, or channelless matches', () => {
    const liveMatch = makeMatch({
      id: 'live-barca',
      homeTeam: 'Barcelona',
      awayTeam: 'Atlético Madrid',
      statusState: 'live',
      statusLabel: "67'",
      isLive: true,
      kickoffMs: baseNow - 70 * 60 * 1000,
    });
    liveMatch.matchMeta!.homeScore = '2';
    liveMatch.matchMeta!.awayScore = '1';

    const finishedMadrid = makeMatch({
      id: 'fin-madrid',
      homeTeam: 'Real Madrid',
      awayTeam: 'Valencia',
      statusState: 'finished',
      statusLabel: 'Final',
      isLive: false,
      kickoffMs: baseNow - 130 * 60 * 1000,
    });

    const finishedPenalties = makeMatch({
      id: 'fin-pen',
      homeTeam: 'Real Madrid',
      awayTeam: 'Getafe',
      statusState: 'upcoming',
      statusLabel: 'FT-PEN',
      isLive: false,
      kickoffMs: baseNow - 125 * 60 * 1000,
    });

    const otherClubLive = makeMatch({
      id: 'other-club',
      homeTeam: 'Betis',
      awayTeam: 'Sevilla',
      statusState: 'live',
      isLive: true,
      kickoffMs: baseNow - 30 * 60 * 1000,
    });

    const reserveMadridC = makeMatch({
      id: 'rm-c',
      homeTeam: 'Real Madrid C',
      awayTeam: 'Numancia',
      statusState: 'live',
      isLive: true,
      kickoffMs: baseNow - 40 * 60 * 1000,
    });

    const noChannelsBarca = makeMatch({
      id: 'no-ch',
      homeTeam: 'Barcelona',
      awayTeam: 'Betis',
      statusState: 'live',
      isLive: true,
      kickoffMs: baseNow - 20 * 60 * 1000,
      channels: [],
    });

    const womenMatch = makeMatch({
      id: 'fem',
      homeTeam: 'FC Barcelona',
      awayTeam: 'Chelsea',
      leagueSlug: 'uefa.wchampions',
      leagueName: 'UEFA Women Champions League',
      statusState: 'live',
      isLive: true,
      kickoffMs: baseNow - 20 * 60 * 1000,
    });

    const basketMatch = makeMatch({
      id: 'basket',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      leagueSlug: 'esp.acb',
      leagueName: 'Liga Endesa Baloncesto',
      statusState: 'live',
      isLive: true,
      kickoffMs: baseNow - 20 * 60 * 1000,
    });

    const visible = getBarcaMadridHomeMatches(
      [
        finishedMadrid,
        finishedPenalties,
        otherClubLive,
        reserveMadridC,
        noChannelsBarca,
        womenMatch,
        basketMatch,
        liveMatch,
      ],
      baseNow
    );

    expect(visible.map((m) => m.id)).toEqual(['live-barca']);

    const meta = getBarcaMadridBannerDisplayMeta(liveMatch, baseNow, 'es');
    expect(meta.isLiveNow).toBe(true);
    expect(meta.hasScore).toBe(true);
    expect(meta.statusHeadline).toContain('EN DIRECTO');
    expect(meta.statusHeadline).toContain("67'");
  });

  it('picks preferred language channel index automatically', () => {
    const match = makeMatch({
      statusState: 'upcoming',
      kickoffMs: baseNow + 3 * 60 * 1000,
    });
    expect(getPreferredBarcaMadridChannelIndex(match, 'es')).toBe(1);
    expect(getPreferredBarcaMadridChannelIndex(match, 'en')).toBe(0);
  });
});
