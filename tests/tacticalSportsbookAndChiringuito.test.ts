import { describe, expect, it } from 'vitest';
import {
  computeMatchTiltPct,
  deriveDangerZone,
  derivePhaseFromPitch,
  projectLiveLineupsToPitch,
} from '../src/components/player/tacticalPitchEngine';
import {
  isBarcaOrMadridMatch,
  isHalftimeStatus,
  isSecondHalfResumedStatus,
} from '../src/hooks/useHalftimeChiringuitoBreak';
import { CHIRINGUITO_CHANNELS } from '../server/data/chiringuitoChannels';
import {
  isRelevantChiringuitoCandidate,
  scoreChiringuitoCandidate,
} from '../server/services/chiringuitoLiveService';
import { shouldRenderBottomControlStrip } from '../src/components/player/buildCinemaPlayerProps';
import {
  computeHotspotSalience,
  detectHotspotCarrierTeam,
  formatSecondsAsClock,
  isSecondHalfPeriod,
  mapTvXToPitchX,
  parseClockToSeconds,
} from '../src/components/player/opticalKitAndMotion';
import { deriveAppControllerLayoutFlags } from '../src/hooks/appControllerHelpers';
import {
  parseEspnStandingsFallback,
  parseFotmobTltableStandings,
} from '../server/services/footballHelpers/standingsParser';
import { LiveMatchCenter } from '../src/components/LiveMatchCenter';
import { StandingsTab } from '../src/components/liveMatch/StandingsTab';

describe('Sportsbook Live Pitch Engine (11v11 always-on & directional flow)', () => {
  it('always projects all 22 players (11 home + 11 away) even without lineups', () => {
    const dots = projectLiveLineupsToPitch({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      ballX: 760,
      ballY: 420,
      possessionTeam: 'home',
      attackDirection: 'home',
      attackIntensity: 74,
    });

    const homeDots = dots.filter((d) => d.team === 'home');
    const awayDots = dots.filter((d) => d.team === 'away');
    expect(homeDots).toHaveLength(11);
    expect(awayDots).toHaveLength(11);

    const homeGk = homeDots.find((d) => d.isGk);
    const awayGk = awayDots.find((d) => d.isGk);
    expect(homeGk?.x).toBeLessThan(120);
    expect(awayGk?.x).toBeGreaterThan(880);
    expect(dots.filter((d) => d.hasBall)).toHaveLength(1);
  });

  it('pushes attacking team line forward and marks high danger zone near opponent box', () => {
    const homeAttackDots = projectLiveLineupsToPitch({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      ballX: 860,
      ballY: 500,
      possessionTeam: 'home',
      attackDirection: 'home',
      attackIntensity: 80,
    });
    const neutralDots = projectLiveLineupsToPitch({
      homeTeam: 'FC Barcelona',
      awayTeam: 'Real Madrid',
      ballX: 500,
      ballY: 500,
      possessionTeam: 'contested',
      attackDirection: 'neutral',
      attackIntensity: 35,
    });

    const avgHomeAtkX =
      homeAttackDots.filter((d) => d.team === 'home' && !d.isGk).reduce((s, d) => s + d.x, 0) / 10;
    const avgHomeNeuX =
      neutralDots.filter((d) => d.team === 'home' && !d.isGk).reduce((s, d) => s + d.x, 0) / 10;
    expect(avgHomeAtkX).toBeGreaterThan(avgHomeNeuX);

    expect(deriveDangerZone(860)).toBe('away_box');
    expect(deriveDangerZone(140)).toBe('home_box');
    expect(derivePhaseFromPitch(860, 'home', 80, 500)).toBe('shot_threat');
    expect(derivePhaseFromPitch(90, 'home', 35, 500)).toBe('goal_kick');
    expect(derivePhaseFromPitch(960, 'home', 40, 80)).toBe('corner');

    expect(
      shouldRenderBottomControlStrip({
        isTvMode: false,
        isMinimized: false,
        isCompressed: false,
        compactVideoForMobileKeyboard: false,
        tacticalVisionEnabled: true,
        videoMode: 'hls',
      })
    ).toBe(false);
    expect(
      shouldRenderBottomControlStrip({
        isTvMode: false,
        isMinimized: false,
        isCompressed: false,
        compactVideoForMobileKeyboard: false,
        tacticalVisionEnabled: false,
        videoMode: 'hls',
      })
    ).toBe(true);
  });

  it('computes match tilt percentage leaning cleanly toward attacking team', () => {
    const homeTilt = computeMatchTiltPct({
      homePossessionPct: 64,
      attackDirection: 'home',
      attackIntensity: 85,
    });
    expect(homeTilt.homeTiltPct).toBeGreaterThan(60);
    expect(homeTilt.homeTiltPct + homeTilt.awayTiltPct).toBe(100);

    const awayTilt = computeMatchTiltPct({
      homePossessionPct: 38,
      attackDirection: 'away',
      attackIntensity: 80,
    });
    expect(awayTilt.homeTiltPct).toBeLessThan(40);
    expect(awayTilt.awayTiltPct).toBeGreaterThan(60);
  });
});

describe('El Chiringuito de Jugones & Barça/Madrid Halftime Auto-Switch', () => {
  it('detects FC Barcelona and Real Madrid football fixtures while ignoring basketball/women/youth sides', () => {
    expect(isBarcaOrMadridMatch('FC Barcelona', 'Atlético Madrid', undefined, 'LaLiga EA Sports')).toBe(true);
    expect(isBarcaOrMadridMatch('Getafe', 'Real Madrid', undefined, 'España: LaLiga EA Sports')).toBe(true);
    expect(isBarcaOrMadridMatch('Sevilla', 'Betis', 'Barça vs Sevilla · Directo', 'LaLiga')).toBe(true);
    expect(isBarcaOrMadridMatch('Real Madrid', 'Barça', undefined, 'Euroliga Baloncesto ACB')).toBe(false);
    expect(isBarcaOrMadridMatch('Real Madrid Castilla', 'Murcia', undefined, 'Primera RFEF')).toBe(false);
    expect(isBarcaOrMadridMatch('Real Madrid Femenino', 'Barcelona Femení', undefined, 'Liga F')).toBe(false);
  });

  it('identifies halftime and exact second-half kickoff resumption without false-triggering on 45+ stoppage', () => {
    expect(isHalftimeStatus('live', 'Descanso')).toBe(true);
    expect(isHalftimeStatus('live', 'HT')).toBe(true);
    expect(isHalftimeStatus('live', 'Half-Time')).toBe(true);
    expect(isHalftimeStatus('finished', 'HT')).toBe(false);
    expect(isHalftimeStatus('live', "45+2'")).toBe(false);

    // Must not trigger return before halftime was actually observed or on 45+ stoppage
    expect(isSecondHalfResumedStatus('live', "46'", false)).toBe(false);
    expect(isSecondHalfResumedStatus('live', "45+3'", true)).toBe(false);
    expect(isSecondHalfResumedStatus('live', 'Descanso', true)).toBe(false);

    // Must trigger clean return once 2nd half starts
    expect(isSecondHalfResumedStatus('live', "46'", true)).toBe(true);
    expect(isSecondHalfResumedStatus('live', '2ª parte', true)).toBe(true);
    expect(isSecondHalfResumedStatus('live', "68'", true)).toBe(true);
  });

  it('exposes Chiringuito Inside and El Chiringuito TV channels with YouTube + Mega TDT signals', () => {
    const inside = CHIRINGUITO_CHANNELS.find((c) => c.id === 'chiringuito-inside-live');
    const tv = CHIRINGUITO_CHANNELS.find((c) => c.id === 'chiringuito-jugones-tv');
    expect(inside).toBeDefined();
    expect(tv).toBeDefined();
    expect(inside?.channels.some((s) => s.sourceUrl === 'chiringuito://inside')).toBe(true);
    expect(inside?.channels.some((s) => s.resolverType === 'tdt_hls')).toBe(true);
    expect(tv?.channels.some((s) => s.sourceUrl === 'chiringuito://live')).toBe(true);
  });

  it('scores alternate/random YouTube Live Chiringuito Inside streams above fake simulations and webcams', () => {
    const realInsideLive = {
      videoId: 'p0QyF_CvGcU',
      title: '⚽️ REAL MADRID VS RC CELTA | CHIRINGUITO LIVE',
      url: 'https://www.youtube.com/watch?v=p0QyF_CvGcU',
      thumbnail: 'https://i.ytimg.com/vi/p0QyF_CvGcU/hqdefault.jpg',
      isLive: true,
      isInside: true,
      isUpcoming: false,
      channelName: 'Chiringuito Inside',
      channelHandle: '/@ChiringuitoTvInside',
      viewerText: '15.325 usuarios',
      viewerCount: 15325,
    };
    const randomCommunityStream = {
      videoId: 'abc123def45',
      title: 'REACCION CHIRINGUITO INSIDE BARCA MADRID EN DIRECTO',
      url: 'https://www.youtube.com/watch?v=abc123def45',
      thumbnail: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
      isLive: true,
      isInside: true,
      isUpcoming: false,
      channelName: 'Directos Futbol Random',
      viewerText: '420 usuarios',
      viewerCount: 420,
    };
    const trafficWebcam = {
      videoId: 'XGzncIaJJ44',
      title: 'Avenida de Madrid',
      url: 'https://www.youtube.com/watch?v=XGzncIaJJ44',
      thumbnail: 'https://i.ytimg.com/vi/XGzncIaJJ44/hqdefault.jpg',
      isLive: true,
      isInside: false,
      isUpcoming: false,
      channelName: 'Cámaras de tráfico de Vigo',
    };
    const eaFcSim = {
      videoId: 'rnXMdbGuG-c',
      title: 'REAL MADRID VS CELTA SIMULACION EA FC 26 CHIRINGUITO',
      url: 'https://www.youtube.com/watch?v=rnXMdbGuG-c',
      thumbnail: 'https://i.ytimg.com/vi/rnXMdbGuG-c/hqdefault.jpg',
      isLive: true,
      isInside: false,
      isUpcoming: false,
      channelName: 'Simulaciones TV',
    };

    expect(isRelevantChiringuitoCandidate(realInsideLive)).toBe(true);
    expect(isRelevantChiringuitoCandidate(randomCommunityStream)).toBe(true);
    expect(isRelevantChiringuitoCandidate(trafficWebcam)).toBe(false);

    const sReal = scoreChiringuitoCandidate(realInsideLive, { prefer: 'inside', matchHint: 'Real Madrid' });
    const sRand = scoreChiringuitoCandidate(randomCommunityStream, { prefer: 'inside', matchHint: 'Real Madrid' });
    const sCam = scoreChiringuitoCandidate(trafficWebcam, { prefer: 'inside', matchHint: 'Real Madrid' });
    const sSim = scoreChiringuitoCandidate(eaFcSim, { prefer: 'inside', matchHint: 'Real Madrid' });

    expect(sReal).toBeGreaterThan(sRand);
    expect(sRand).toBeGreaterThan(250);
    expect(sCam).toBeLessThan(0);
    expect(sSim).toBeLessThan(sRand);
  });

  it('correctly syncs TV clock, mirrors 2nd-half horizontal sides, and identifies ball-carrier team by kit RGB', () => {
    expect(parseClockToSeconds('59:59')).toBe(3599);
    expect(parseClockToSeconds('61:04')).toBe(3664);
    expect(formatSecondsAsClock(3605)).toBe('60:05');

    // Second-half side swap detection (excludes 1st half & 45+ stoppage)
    expect(isSecondHalfPeriod('59:59')).toBe(true);
    expect(isSecondHalfPeriod('61:04')).toBe(true);
    expect(isSecondHalfPeriod('2ª parte')).toBe(true);
    expect(isSecondHalfPeriod("45+2'")).toBe(false);
    expect(isSecondHalfPeriod('Descanso')).toBe(false);

    // 2nd half TV camera mirror: Home defends Right (tvX=900 -> pitchX=100), Away defends Left (tvX=100 -> pitchX=900)
    expect(mapTvXToPitchX(100, false)).toBe(100);
    expect(mapTvXToPitchX(100, true)).toBe(900);
    expect(mapTvXToPitchX(850, true)).toBe(150);

    // Quadratic motion dominance over stationary background cells
    expect(computeHotspotSalience(18, 0.28)).toBeGreaterThan(computeHotspotSalience(0.5, 0.65) * 40);

    // White Home kit carrier vs Navy/Light-Blue Away kit carrier
    const carrierHome = detectHotspotCarrierTeam(
      [
        { x: 640, y: 680, r: 232, g: 232, b: 234, w: 120, motion: 18 },
        { x: 660, y: 690, r: 226, g: 224, b: 228, w: 98, motion: 15 },
        { x: 300, y: 500, r: 34, g: 64, b: 112, w: 4, motion: 1 },
      ],
      [245, 245, 245],
      [42, 88, 160]
    );
    expect(carrierHome).toBe('home');

    // Live visual tilt must agree with live attacking team even if older API momentum leans away
    const coherent = computeMatchTiltPct({
      homePossessionPct: 48,
      attackDirection: 'home',
      attackIntensity: 68,
      preferLiveVisualTilt: true,
      details: {
        id: 'm1',
        momentum: [
          { minute: 55, value: -75 },
          { minute: 58, value: -60 },
        ],
      } as never,
    });
    expect(coherent.homeTiltPct).toBeGreaterThan(60);
  });

  it('keeps normal document scroll without shrinking or compressing the player stage', () => {
    const flags = deriveAppControllerLayoutFlags({
      activeWorld: 'deportes',
      videoState: {
        mode: 'hls',
        url: 'https://example.com/live.m3u8',
        title: 'Real Madrid vs Celta',
        isPlaying: true,
        isLive: true,
        currentTime: 0,
        tracks: [],
        activeTrackIndex: 0,
        subtitle: '',
      },
      isExtracting: false,
      isPlayerClosedLocally: false,
      isPlayerMinimized: false,
      isAutoMiniByScroll: true,
      pinFullPlayerOnChat: true,
      isCinemaMode: false,
      participants: [],
      isDesktopLayout: true,
      isMobileKeyboardOpen: false,
      isMobileLandscape: false,
      mobileTab: 'home',
      floatingChatOpen: false,
      isFloatingRoomOpen: false,
      activeSportsMatch: null,
      activeMovieContext: null,
      isInActiveGame: false,
    });
    expect(flags.isScrollCompressed).toBe(false);
    expect(flags.isDockedMini).toBe(false);
  });

  it('parses FotMob tltable and ESPN standings with live highlight, groups, and legend zones', () => {
    const parsedFotmob = parseFotmobTltableStandings(
      [
        {
          data: {
            leagueId: 87,
            leagueName: 'LaLiga',
            legend: [
              { title: 'Champions League', color: '#2AD572', indices: [0, 1, 2, 3] },
              { title: 'Relegation', color: '#FF4646', indices: [17, 18, 19] },
            ],
            ongoing: [{ hId: 8633, aId: 9910, hScore: 1, aScore: 1 }],
            table: {
              all: [
                {
                  idx: 1,
                  id: 8634,
                  name: 'Barcelona',
                  shortName: 'Barcelona',
                  played: 12,
                  wins: 11,
                  draws: 0,
                  losses: 1,
                  scoresStr: '48-13',
                  goalConDiff: 35,
                  pts: 33,
                  qualColor: '#2AD572',
                },
                {
                  idx: 2,
                  id: 8633,
                  name: 'Real Madrid',
                  shortName: 'Real Madrid',
                  played: 13,
                  wins: 10,
                  draws: 1,
                  losses: 2,
                  scoresStr: '32-11',
                  goalConDiff: 21,
                  pts: 31,
                  qualColor: '#2AD572',
                  ongoing: { hId: 8633, aId: 9910, hScore: 1, aScore: 1 },
                },
              ],
            },
          },
        },
      ],
      { homeTeam: 'Real Madrid', awayTeam: 'Celta Vigo', statusState: 'live', homeScore: '1', awayScore: '1' }
    );

    expect(parsedFotmob).not.toBeNull();
    expect(parsedFotmob?.leagueName).toBe('LaLiga');
    expect(parsedFotmob?.hasLiveMatches).toBe(true);
    expect(parsedFotmob?.legend?.[1]?.title).toBe('Descenso');
    expect(parsedFotmob?.groups[0].all[0].goalsFor).toBe(48);
    expect(parsedFotmob?.groups[0].all[1].isHomeTeam).toBe(true);
    expect(parsedFotmob?.groups[0].all[1].isPlayingLive).toBe(true);
    expect(parsedFotmob?.groups[0].all[1].liveMatchLabel).toBe('1-1');

    const parsedEspn = parseEspnStandingsFallback(
      {
        name: 'LaLiga EA Sports',
        children: [
          {
            name: 'Clasificación General',
            standings: {
              entries: [
                {
                  team: { id: '86', displayName: 'Real Madrid', shortDisplayName: 'RMA' },
                  note: { color: '#2AD572' },
                  stats: [
                    { name: 'rank', value: 1 },
                    { name: 'gamesPlayed', value: 13 },
                    { name: 'wins', value: 10 },
                    { name: 'ties', value: 1 },
                    { name: 'losses', value: 2 },
                    { name: 'pointsFor', value: 32 },
                    { name: 'pointsAgainst', value: 11 },
                    { name: 'pointDifferential', value: 21 },
                    { name: 'points', value: 31 },
                  ],
                },
              ],
            },
          },
        ],
      },
      { homeTeam: 'Real Madrid', awayTeam: 'Celta Vigo', statusState: 'live', homeScore: '1', awayScore: '1' }
    );

    expect(parsedEspn?.groups[0].all[0].pts).toBe(31);
    expect(parsedEspn?.groups[0].all[0].isHomeTeam).toBe(true);
    expect(typeof LiveMatchCenter).toBe('function');
    expect(typeof StandingsTab).toBe('function');
  });
});
