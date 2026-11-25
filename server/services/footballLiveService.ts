import type {
  FootballMatchDetails,
  FootballMatchShotItem,
  FootballMomentumPoint,
} from '../../src/types.ts';
import {
  FOTMOB_HEADERS,
  findMatchingFotmobFixture,
} from './footballHelpers/teamMatchingAndFotmobDay.ts';
import { parseEspnSummaryFallback } from './footballHelpers/espnSummaryFallback.ts';
import {
  fetchFotmobLiveCommentary,
  parseFotmobEvents,
  parseFotmobLineupTeam,
  parseFotmobPeriodStats,
} from './footballHelpers/fotmobDetailsParsers.ts';
import { fetchLeagueStandings } from './footballHelpers/standingsParser.ts';

export * from './footballHelpers/teamMatchingAndFotmobDay.ts';

const fotmobDetailsCache = new Map<string, { details: FootballMatchDetails; ts: number }>();

export async function fetchRealFootballMatchDetails(params: {
  eventId?: string;
  fotmobMatchId?: string;
  leagueSlug?: string;
  homeTeam?: string;
  awayTeam?: string;
  dateKey?: string;
}): Promise<FootballMatchDetails> {
  const cleanEventId = String(params.eventId || '').trim();
  const cleanLeagueSlug = String(params.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
  const requestedFotmobId = String(params.fotmobMatchId || '').replace(/\D/g, '');
  const numericEspnId = /^\d+$/.test(cleanEventId) ? cleanEventId : '';

  let fotmobId = requestedFotmobId;
  if (!fotmobId && params.homeTeam && params.awayTeam) {
    const matched = await findMatchingFotmobFixture({
      homeTeam: params.homeTeam,
      awayTeam: params.awayTeam,
      dateKey: params.dateKey,
      leagueSlug: cleanLeagueSlug,
    });
    if (matched) fotmobId = matched.fotmobId;
  }

  const cacheKey = `${fotmobId || cleanEventId || `${params.homeTeam}-${params.awayTeam}`}:${cleanLeagueSlug}`;
  const cached = fotmobDetailsCache.get(cacheKey);
  if (cached) {
    const ttl = cached.details.statusState === 'live' ? 15 * 1000 : 3 * 60 * 1000;
    if (Date.now() - cached.ts < ttl) {
      return cached.details;
    }
  }

  const [fotmobRaw, fotmobCommentary, espnRaw] = await Promise.all([
    fotmobId
      ? fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${fotmobId}`, {
          headers: FOTMOB_HEADERS,
          signal: AbortSignal.timeout(6000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
    fotmobId ? fetchFotmobLiveCommentary(fotmobId) : Promise.resolve([]),
    numericEspnId && !cleanLeagueSlug.startsWith('live.') && !cleanLeagueSlug.startsWith('fotmob.')
      ? fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${cleanLeagueSlug}/summary?event=${numericEspnId}&lang=es&region=es`,
          { signal: AbortSignal.timeout(4500) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const espnParsed = espnRaw ? parseEspnSummaryFallback(espnRaw, numericEspnId) : null;

  if (fotmobRaw && (fotmobRaw.content || fotmobRaw.header)) {
    const header = fotmobRaw.header || {};
    const general = fotmobRaw.general || {};
    const content = fotmobRaw.content || {};
    const st = header.status || {};
    const teams: any[] = Array.isArray(header.teams) ? header.teams : [];
    const homeTeamObj = teams[0] || {};
    const awayTeamObj = teams[1] || {};
    const homeTeamId = Number(homeTeamObj.id || 0);
    const awayTeamId = Number(awayTeamObj.id || 0);
    const homeName = String(homeTeamObj.name || params.homeTeam || 'Local').trim();
    const awayName = String(awayTeamObj.name || params.awayTeam || 'Visitante').trim();

    const started = Boolean(st.started);
    const finished = Boolean(st.finished);
    const cancelled = Boolean(st.cancelled);
    const statusState: 'live' | 'upcoming' | 'finished' =
      finished || cancelled ? 'finished' : started ? 'live' : 'upcoming';

    let statusLabel = '';
    if (statusState === 'live') {
      const raw = String(st?.liveTime?.long || st?.liveTime?.short || st?.reason?.short || 'EN VIVO').trim();
      statusLabel = /^(ht|half-time|half time|half_time|descanso)$/i.test(raw) ? 'Descanso' : raw;
    } else if (statusState === 'finished') {
      const raw = String(st?.reason?.short || 'FT').trim();
      statusLabel = /^(ft|full-time|full time|finished)$/i.test(raw) ? 'Final' : raw;
    } else {
      statusLabel = 'Por empezar';
    }

    const homeLineup = parseFotmobLineupTeam(
      content?.lineup?.homeTeam,
      espnParsed?.espnHeightsByName
    );
    const awayLineup = parseFotmobLineupTeam(
      content?.lineup?.awayTeam,
      espnParsed?.espnHeightsByName
    );

    const periods = content?.stats?.Periods || {};
    const allStats = parseFotmobPeriodStats(
      periods.All,
      homeLineup?.avgRating,
      awayLineup?.avgRating
    );
    const firstHalfStats = parseFotmobPeriodStats(periods.FirstHalf);
    const secondHalfStats = parseFotmobPeriodStats(periods.SecondHalf);

    const rawShots: any[] = Array.isArray(content?.shotmap?.shots)
      ? content.shotmap.shots
      : [];
    const shotsMap: FootballMatchShotItem[] = rawShots.map((sh, idx) => {
      const isHomeShot = homeTeamId ? Number(sh?.teamId) === homeTeamId : true;
      const rawX = Number(sh?.x || 50);
      const rawY = Number(sh?.y || 34);
      const normX = Math.max(2, Math.min(98, (rawX / 105) * 100));
      const normY = Math.max(4, Math.min(96, (rawY / 68) * 100));
      const x = isHomeShot ? normX : 100 - normX;
      const y = isHomeShot ? normY : 100 - normY;

      const onGoalRaw = sh?.onGoalShot;
      const onGoalShot =
        onGoalRaw &&
        typeof onGoalRaw.x === 'number' &&
        typeof onGoalRaw.y === 'number'
          ? { x: onGoalRaw.x, y: onGoalRaw.y }
          : null;

      return {
        id: String(sh?.id || `shot-${idx}`),
        x,
        y,
        onTarget: Boolean(sh?.isOnTarget),
        isGoal: String(sh?.eventType || '').toLowerCase() === 'goal',
        isBlocked: Boolean(sh?.isBlocked),
        home: isHomeShot,
        minute: `${sh?.min ?? 0}${sh?.minAdded ? `+${sh.minAdded}` : ''}'`,
        player: String(sh?.playerName || 'Jugador').trim(),
        xG: typeof sh?.expectedGoals === 'number' ? +sh.expectedGoals.toFixed(2) : undefined,
        shotType: sh?.shotType ? String(sh.shotType) : undefined,
        situation: sh?.situation ? String(sh.situation) : undefined,
        period: sh?.period ? String(sh.period) : undefined,
        onGoalShot,
      };
    });

    const events = parseFotmobEvents(
      content?.matchFacts?.events?.events || [],
      homeName,
      awayName
    );
    const infoBox = content?.matchFacts?.infoBox || {};
    const venue = String(
      infoBox?.Stadium?.name || espnParsed?.venue || ''
    ).trim() || undefined;
    const referee = String(infoBox?.Referee?.text || '').trim() || undefined;
    const attendance = infoBox?.Attendance ? String(infoBox.Attendance) : undefined;

    const rawMomentum: any[] = Array.isArray(content?.momentum?.main?.data)
      ? content.momentum.main.data
      : [];
    const momentum: FootballMomentumPoint[] = rawMomentum
      .filter((m) => typeof m?.minute === 'number' && typeof m?.value === 'number')
      .map((m) => ({ minute: m.minute, value: m.value }));

    const commentary =
      fotmobCommentary.length > 0
        ? fotmobCommentary
        : espnParsed?.commentary || [];

    const resolvedStats = allStats.length > 0 ? allStats : espnParsed?.stats || [];
    const resolvedHomeLineup =
      homeLineup && homeLineup.starters.length > 0 ? homeLineup : espnParsed?.homeLineup;
    const resolvedAwayLineup =
      awayLineup && awayLineup.starters.length > 0 ? awayLineup : espnParsed?.awayLineup;

    const fotmobTableLeagueId = String(
      content?.table?.leagueId || general?.leagueId || ''
    ).replace(/\D/g, '');
    const fotmobParentLeagueId = String(
      content?.table?.parentLeagueId || general?.parentLeagueId || ''
    ).replace(/\D/g, '');
    const computedHomeScore = statusState === 'upcoming' ? '-' : String(homeTeamObj?.score ?? '0');
    const computedAwayScore = statusState === 'upcoming' ? '-' : String(awayTeamObj?.score ?? '0');

    const standings = await fetchLeagueStandings({
      leagueId: fotmobTableLeagueId || undefined,
      parentLeagueId: fotmobParentLeagueId || undefined,
      leagueSlug: cleanLeagueSlug,
      homeTeamId,
      awayTeamId,
      homeTeam: homeName,
      awayTeam: awayName,
      statusState,
      homeScore: computedHomeScore,
      awayScore: computedAwayScore,
      tournamentName: general?.leagueName ? String(general.leagueName) : undefined,
    });

    const details: FootballMatchDetails = {
      eventId: cleanEventId || fotmobId,
      fotmobMatchId: fotmobId,
      source: 'fotmob',
      venue,
      referee,
      attendance,
      tournamentName: general?.leagueName ? String(general.leagueName) : undefined,
      roundName: general?.leagueRoundName ? `Jornada ${general.leagueRoundName}` : undefined,
      statusState,
      statusLabel,
      homeTeam: homeName,
      awayTeam: awayName,
      homeShort: homeName.slice(0, 3).toUpperCase(),
      awayShort: awayName.slice(0, 3).toUpperCase(),
      homeLogo: homeTeamId
        ? `https://images.fotmob.com/image_resources/logo/teamlogo/${homeTeamId}_small.png`
        : undefined,
      awayLogo: awayTeamId
        ? `https://images.fotmob.com/image_resources/logo/teamlogo/${awayTeamId}_small.png`
        : undefined,
      homeScore: computedHomeScore,
      awayScore: computedAwayScore,
      homeColor: general?.teamColors?.darkMode?.home || '#22C55E',
      awayColor: general?.teamColors?.darkMode?.away || '#60A5FA',
      lineupsConfirmed: Boolean(
        resolvedHomeLineup && resolvedHomeLineup.starters.length >= 11
      ),
      stats: resolvedStats,
      statsByPeriod: {
        all: resolvedStats,
        firstHalf: firstHalfStats,
        secondHalf: secondHalfStats,
      },
      events: events.length > 0 ? events : espnParsed?.events || [],
      homeLineup: resolvedHomeLineup,
      awayLineup: resolvedAwayLineup,
      commentary,
      shotsMap,
      momentum: momentum.length > 0 ? momentum : undefined,
      standings,
      updatedAt: Date.now(),
    };

    fotmobDetailsCache.set(cacheKey, { details, ts: Date.now() });
    return details;
  }

  const fallbackStandings = await fetchLeagueStandings({
    leagueSlug: cleanLeagueSlug,
    homeTeam: espnParsed?.homeTeam || params.homeTeam,
    awayTeam: espnParsed?.awayTeam || params.awayTeam,
    statusState: espnParsed?.statusState,
    homeScore: espnParsed?.homeScore,
    awayScore: espnParsed?.awayScore,
  });

  const fallbackDetails: FootballMatchDetails = {
    eventId: cleanEventId,
    fotmobMatchId: fotmobId || undefined,
    source: espnParsed ? 'espn' : 'none',
    venue: espnParsed?.venue,
    statusState: espnParsed?.statusState,
    statusLabel: espnParsed?.statusLabel,
    homeTeam: espnParsed?.homeTeam || params.homeTeam,
    awayTeam: espnParsed?.awayTeam || params.awayTeam,
    homeScore: espnParsed?.homeScore,
    awayScore: espnParsed?.awayScore,
    lineupsConfirmed: Boolean(
      espnParsed?.homeLineup && espnParsed.homeLineup.starters.length >= 11
    ),
    stats: espnParsed?.stats || [],
    statsByPeriod: {
      all: espnParsed?.stats || [],
      firstHalf: [],
      secondHalf: [],
    },
    events: espnParsed?.events || [],
    homeLineup: espnParsed?.homeLineup,
    awayLineup: espnParsed?.awayLineup,
    commentary: espnParsed?.commentary || [],
    shotsMap: [],
    standings: fallbackStandings,
    updatedAt: Date.now(),
  };

  fotmobDetailsCache.set(cacheKey, { details: fallbackDetails, ts: Date.now() });
  return fallbackDetails;
}
