/**
 * @module server/routes/sports
 * @description Live sports agenda feeds (24/7 multiplexes, StreamXHD, RojaDirecta), ESPN + FotMob scoreboards, football matchboard, and live match telemetry.
 */
import type { Express } from 'express';
import {
  getRegionLabelFromCcode as getFotmobRegionLabel,
  doFootballTeamNamesMatch,
  fetchFotmobDayIndex,
  fetchRealFootballMatchDetails,
} from '../services/footballLiveService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import {
  getPermanent247SportsMatches,
  SOCCER_BOARD_LEAGUES,
  type SoccerLeagueFeedDef,
} from './sportsHelpers/sportsChannels247.ts';
import { fetchLiveSportsAgendaFeeds } from './sportsHelpers/sportsAgendaScraper.ts';
import {
  normalizeTeamToken,
  resolveTeamBadgeUrl,
  doesScrapedEventMatchFixture,
  buildFootballMatchChannels,
  resolveMatchSpanishBroadcaster,
  isFeaturedSpanishClubMatch,
  sortTracksWithDaznPriority,
  sanitizeScrapedChannelLabel,
} from './sportsHelpers/footballTeamMatcher.ts';
import {
  fetchExtendedFootballCalendar,
  formatMadridDateLabel,
  formatSpanishMatchdayLabel,
  resolveCalendarScopeMode,
  translateFootballStatusLabel,
} from './sportsHelpers/upcomingCalendarHelper.ts';

let cachedSportsSchedule: { matches: any[]; ts: number } | null = null;
let liveScoresCache: { matches: any[]; ts: number } | null = null;
let cachedFootballBoard: { dateKey: string; matches: any[]; ts: number } | null = null;

export { getPermanent247SportsMatches, fetchLiveSportsAgendaFeeds };

export function getCachedSportsMatches(): any[] {
  return cachedSportsSchedule?.matches || [];
}

export async function getLiveVoiceMatches() {
  if (cachedSportsSchedule && cachedSportsSchedule.matches.length > 0) {
    return cachedSportsSchedule.matches;
  }
  const permanent = getPermanent247SportsMatches();
  try {
    const { rojaMatches } = await fetchLiveSportsAgendaFeeds();
    return [...permanent, ...rojaMatches];
  } catch {
    return permanent;
  }
}

export function registerSportsRoutes(app: Express): void {
  app.get('/api/catalog/sports', async (_req, res) => {
    if (cachedSportsSchedule && Date.now() - cachedSportsSchedule.ts < 90 * 1000) {
      return res.json({
        success: true,
        events: channelHealthMonitor.prioritizeChannels(cachedSportsSchedule.matches),
      });
    }

    const permanentChannels = getPermanent247SportsMatches();
    const { rojaMatches } = await fetchLiveSportsAgendaFeeds();
    const combined = [...permanentChannels, ...rojaMatches.slice(0, 40)];
    cachedSportsSchedule = { matches: combined, ts: Date.now() };

    res.json({
      success: true,
      events: channelHealthMonitor.prioritizeChannels(combined),
    });
  });

  app.get('/api/sports/scores', async (_req, res) => {
    if (liveScoresCache && Date.now() - liveScoresCache.ts < 45 * 1000) {
      return res.json({ success: true, scores: liveScoresCache.matches });
    }

    const feeds: { url: string; league: string; sport: 'soccer' | 'basketball' }[] = [
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard', league: 'LaLiga', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard', league: 'Champions', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard', league: 'Premier', sport: 'soccer' },
      { url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', league: 'NBA', sport: 'basketball' },
    ];

    try {
      const responses = await Promise.all(
        feeds.map((f) =>
          fetch(f.url, { signal: AbortSignal.timeout(4000) })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => ({ feed: f, json }))
            .catch(() => ({ feed: f, json: null }))
        )
      );

      const parsed: any[] = [];
      for (const { feed, json } of responses) {
        const events: any[] = Array.isArray(json?.events) ? json.events : [];
        for (const ev of events.slice(0, 6)) {
          const comp = ev?.competitions?.[0];
          const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          if (!home || !away) continue;

          const stateStr = String(ev?.status?.type?.state || '');
          const isLive = stateStr === 'in';
          const shortDetail =
            ev?.status?.type?.shortDetail || ev?.status?.displayClock || (isLive ? 'EN JUEGO' : '');

          parsed.push({
            id: `${feed.league}-${ev.id}`,
            league: feed.league,
            sport: feed.sport,
            homeTeam: home.team?.shortDisplayName || home.team?.displayName || 'Local',
            awayTeam: away.team?.shortDisplayName || away.team?.displayName || 'Visitante',
            homeScore: stateStr === 'pre' ? '-' : String(home.score ?? '0'),
            awayScore: stateStr === 'pre' ? '-' : String(away.score ?? '0'),
            homeLogo: home.team?.logo || undefined,
            awayLogo: away.team?.logo || undefined,
            statusText: shortDetail,
            isLive,
          });
        }
      }

      parsed.sort((a, b) => Number(b.isLive) - Number(a.isLive));
      liveScoresCache = { matches: parsed.slice(0, 18), ts: Date.now() };
      res.json({ success: true, scores: liveScoresCache.matches });
    } catch {
      res.json({ success: true, scores: [] });
    }
  });

  app.get('/api/sports/football-board', async (req, res) => {
    const orderBoardChannels = (channels: any[], leagueSlug?: string) => {
      const healthChecked = channelHealthMonitor.prioritizeTracks(channels || []);
      const alive = healthChecked.filter((c: any) => c.health?.status !== 'down');
      const down = healthChecked.filter((c: any) => c.health?.status === 'down');
      return [...sortTracksWithDaznPriority(alive, leagueSlug), ...down];
    };

    const requestedDate = String(req.query.date || '').replace(/\D/g, '').slice(0, 8);
    const madridToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
      .format(new Date())
      .replace(/-/g, '');
    const dateKey = requestedDate.length === 8 ? requestedDate : madridToday;
    const isToday = dateKey === madridToday;
    const cacheTtlMs = isToday ? 18 * 1000 : 2 * 60 * 1000;

    const calendarScope = resolveCalendarScopeMode({
      calendar: typeof req.query.calendar === 'string' ? req.query.calendar : '',
      league: typeof req.query.league === 'string' ? req.query.league : '',
      team: typeof req.query.team === 'string' ? req.query.team : '',
    });

    if (calendarScope) {
      try {
        const liveFeeds = await fetchLiveSportsAgendaFeeds().catch(() => ({
          rojaMatches: [],
          streamXhdFootball: [],
        }));
        const calendarItems = await fetchExtendedFootballCalendar(
          calendarScope,
          liveFeeds.rojaMatches
        );
        const prioritized = calendarItems.map((m) => ({
          ...m,
          channels: orderBoardChannels(m.channels || [], m.leagueSlug),
        }));
        return res.json({
          success: true,
          dateKey,
          calendarScope: calendarScope.key,
          matches: prioritized,
        });
      } catch (err) {
        console.warn('Extended football calendar error:', err);
      }
    }

    if (
      cachedFootballBoard &&
      cachedFootballBoard.dateKey === dateKey &&
      Date.now() - cachedFootballBoard.ts < cacheTtlMs
    ) {
      return res.json({ success: true, dateKey, matches: cachedFootballBoard.matches });
    }

    try {
      const madridTimeFmt = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const [liveFeeds, fotmobMatches, ...responses] = await Promise.all([
        isToday
          ? fetchLiveSportsAgendaFeeds()
          : Promise.resolve({ rojaMatches: [], streamXhdFootball: [] }),
        fetchFotmobDayIndex(dateKey).catch(() => []),
        ...SOCCER_BOARD_LEAGUES.map((league) =>
          fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${dateKey}&lang=es&region=es`,
            { signal: AbortSignal.timeout(4500) }
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => ({ league, json }))
            .catch(() => ({ league, json: null }))
        ),
      ]);

      const scrapedMatches = liveFeeds.rojaMatches;
      const items: any[] = [];
      const seenEventIds = new Set<string>();
      const matchedFotmobIds = new Set<string>();

      const findFotmobMatch = (homeName: string, awayName: string) =>
        fotmobMatches.find(
          (fm) =>
            (doFootballTeamNamesMatch(homeName, fm.homeName) &&
              doFootballTeamNamesMatch(awayName, fm.awayName)) ||
            (doFootballTeamNamesMatch(homeName, fm.awayName) &&
              doFootballTeamNamesMatch(awayName, fm.homeName))
        );

      for (const { league, json } of responses) {
        const events: any[] = Array.isArray(json?.events) ? json.events : [];
        const espnLeagueLogo = String(json?.leagues?.[0]?.logos?.[0]?.href || '').trim() || undefined;
        const isInternational =
          league.slug.startsWith('uefa.nations') || league.slug.startsWith('fifa.');

        for (const ev of events) {
          const eventId = String(ev?.id || '').trim();
          if (!eventId || seenEventIds.has(eventId)) continue;
          seenEventIds.add(eventId);

          const comp = ev?.competitions?.[0];
          const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
          const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
          const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
          if (!home || !away) continue;

          const kickoffDate = ev?.date ? new Date(ev.date) : new Date();
          const kickoffTime = Number.isNaN(kickoffDate.getTime())
            ? '20:45'
            : madridTimeFmt.format(kickoffDate);

          const rawState = String(ev?.status?.type?.state || '').toLowerCase();
          const statusName = String(ev?.status?.type?.name || '');
          let statusState: 'live' | 'upcoming' | 'finished' =
            rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';

          let statusLabel = translateFootballStatusLabel(
            statusState === 'live'
              ? statusName.includes('HALFTIME')
                ? 'HT'
                : String(ev?.status?.displayClock || ev?.status?.type?.shortDetail || '').trim()
              : statusName || String(ev?.status?.type?.shortDetail || ''),
            statusState
          );

          const homeTeam = String(
            home.team?.shortDisplayName || home.team?.displayName || 'Local'
          ).trim();
          const awayTeam = String(
            away.team?.shortDisplayName || away.team?.displayName || 'Visitante'
          ).trim();

          const fm = findFotmobMatch(homeTeam, awayTeam);
          if (fm) {
            matchedFotmobIds.add(fm.fotmobId);
            if (fm.statusState === 'live') {
              statusState = 'live';
              if (fm.statusLabel) {
                statusLabel = /^(ht|half-time|half time)$/i.test(fm.statusLabel)
                  ? 'Descanso'
                  : fm.statusLabel;
              }
            } else if (fm.statusState === 'finished' && statusState !== 'finished') {
              statusState = 'finished';
              statusLabel = fm.statusLabel && !/^(ft|full-time)$/i.test(fm.statusLabel) ? fm.statusLabel : 'Final';
            }
          }

          const resolvedHomeScore =
            fm && fm.statusState !== 'upcoming'
              ? fm.homeScore
              : statusState === 'upcoming'
              ? '-'
              : String(home.score ?? '0');
          const resolvedAwayScore =
            fm && fm.statusState !== 'upcoming'
              ? fm.awayScore
              : statusState === 'upcoming'
              ? '-'
              : String(away.score ?? '0');

          const kickoffMs = fm?.kickoffMs || kickoffDate.getTime() || 0;
          const channels = buildFootballMatchChannels({
            matchId: `fb-${eventId}`,
            homeTeam,
            awayTeam,
            statusState,
            league,
            scrapedMatches,
            kickoffMs,
          });

          const matchdayLabel = formatSpanishMatchdayLabel(
            comp?.round?.number ?? comp?.notes?.[0]?.text,
            league.slug
          );

          items.push({
            id: `fb-${eventId}`,
            eventId,
            fotmobMatchId: fm?.fotmobId,
            leagueSlug: league.slug,
            regionName: league.regionName,
            leagueName: league.leagueName,
            groupTitle: `${league.regionName}: ${league.leagueName}`,
            regionFlagUrl: league.regionFlagUrl,
            leagueLogoUrl: espnLeagueLogo,
            priority: league.priority,
            kickoffIso: kickoffDate.toISOString(),
            kickoffTime: fm?.kickoffTime || kickoffTime,
            kickoffMs,
            kickoffDateLabel: formatMadridDateLabel(kickoffDate, madridToday),
            statusState,
            statusLabel,
            matchdayLabel,
            spanishBroadcaster: resolveMatchSpanishBroadcaster(league.slug, league.leagueName),
            homeTeam,
            awayTeam,
            homeShort: String(home.team?.abbreviation || homeTeam.slice(0, 3)).toUpperCase(),
            awayShort: String(away.team?.abbreviation || awayTeam.slice(0, 3)).toUpperCase(),
            homeLogo: resolveTeamBadgeUrl(home.team, isInternational) || fm?.homeLogo,
            awayLogo: resolveTeamBadgeUrl(away.team, isInternational) || fm?.awayLogo,
            homeScore: resolvedHomeScore,
            awayScore: resolvedAwayScore,
            homeRedCards: fm?.homeRedCards || 0,
            awayRedCards: fm?.awayRedCards || 0,
            channels,
          });
        }
      }

      if (isToday && liveFeeds.streamXhdFootball.length > 0) {
        for (let idx = 0; idx < liveFeeds.streamXhdFootball.length; idx++) {
          const sx = liveFeeds.streamXhdFootball[idx];
          const existingItem = items.find((it) =>
            doesScrapedEventMatchFixture(it.homeTeam, it.awayTeam, sx) ||
            (doFootballTeamNamesMatch(it.homeTeam, sx.homeTeam) && doFootballTeamNamesMatch(it.awayTeam, sx.awayTeam)) ||
            (doFootballTeamNamesMatch(it.homeTeam, sx.awayTeam) && doFootballTeamNamesMatch(it.awayTeam, sx.homeTeam))
          );
          if (existingItem) {
            // Merge direct streams into existing item avoiding duplicate URLs
            if (Array.isArray(sx.channels)) {
              let fIdx = existingItem.channels.length + 1;
              for (const ch of sx.channels) {
                if (!existingItem.channels.some((c: any) => c.sourceUrl === ch.sourceUrl)) {
                  existingItem.channels.push({
                    ...ch,
                    label: sanitizeScrapedChannelLabel(ch.label, fIdx++),
                  });
                }
              }
            }
            continue;
          }

          const fm = findFotmobMatch(sx.homeTeam, sx.awayTeam);
          if (fm) matchedFotmobIds.add(fm.fotmobId);

          const sxId = `sxhd-${idx + 1}-${normalizeTeamToken(sx.homeTeam).slice(0, 8)}`;
          const codeUpper = String(sx.code || '').toUpperCase();
          const flagIso =
            codeUpper === 'COL' ? 'co' : codeUpper === 'ARG' ? 'ar' : codeUpper === 'MEX' ? 'mx'
            : codeUpper === 'CHL' || codeUpper === 'CHI' ? 'cl' : codeUpper === 'PER' ? 'pe'
            : codeUpper === 'BRA' ? 'br' : codeUpper === 'URU' ? 'uy' : codeUpper === 'ECU' ? 'ec' : 'un';

          const sanitizedSxChannels = (sx.channels || []).map((ch: any, cIdx: number) => ({
            ...ch,
            label: sanitizeScrapedChannelLabel(ch.label, cIdx + 1),
          }));

          items.push({
            id: `fb-${sxId}`,
            eventId: fm?.fotmobId || sxId,
            fotmobMatchId: fm?.fotmobId,
            leagueSlug: fm ? `fotmob.${fm.leagueId}` : `live.${normalizeTeamToken(sx.leagueName || 'directo')}`,
            regionName: fm ? getFotmobRegionLabel(fm.ccode) : codeUpper || 'Internacional',
            leagueName: fm?.leagueName || sx.leagueName || 'Fútbol en Vivo',
            groupTitle: `${codeUpper || 'En Vivo'}: ${fm?.leagueName || sx.leagueName || 'Fútbol en Directo'}`,
            regionFlagUrl: fm?.regionFlagUrl || `https://flagcdn.com/w40/${flagIso}.png`,
            priority: 12,
            kickoffIso: fm?.utcTime || new Date().toISOString(),
            kickoffTime: fm?.kickoffTime || sx.timeStr || 'EN VIVO',
            kickoffMs: fm?.kickoffMs || Date.now(),
            statusState: fm?.statusState || 'live',
            statusLabel: fm?.statusLabel || 'EN VIVO',
            homeTeam: fm?.homeName || sx.homeTeam,
            awayTeam: fm?.awayName || sx.awayTeam,
            homeShort: (fm?.homeName || sx.homeTeam).slice(0, 3).toUpperCase(),
            awayShort: (fm?.awayName || sx.awayTeam).slice(0, 3).toUpperCase(),
            homeLogo: fm?.homeLogo || sx.homeLogo,
            awayLogo: fm?.awayLogo || sx.awayLogo,
            homeScore: fm ? fm.homeScore : '•',
            awayScore: fm ? fm.awayScore : '•',
            homeRedCards: fm?.homeRedCards || 0,
            awayRedCards: fm?.awayRedCards || 0,
            channels: sanitizedSxChannels,
          });
        }
      }

      for (const fm of fotmobMatches) {
        if (matchedFotmobIds.has(fm.fotmobId)) continue;
        const alreadyInBoard = items.find((it) =>
          (doFootballTeamNamesMatch(it.homeTeam, fm.homeName) && doFootballTeamNamesMatch(it.awayTeam, fm.awayName)) ||
          (doFootballTeamNamesMatch(it.homeTeam, fm.awayName) && doFootballTeamNamesMatch(it.awayTeam, fm.homeName))
        );
        if (alreadyInBoard) {
          matchedFotmobIds.add(fm.fotmobId);
          if (!alreadyInBoard.fotmobMatchId) alreadyInBoard.fotmobMatchId = fm.fotmobId;
          if (fm.statusState === 'live') {
            alreadyInBoard.statusState = 'live';
            if (fm.statusLabel) alreadyInBoard.statusLabel = fm.statusLabel;
            alreadyInBoard.homeScore = fm.homeScore;
            alreadyInBoard.awayScore = fm.awayScore;
          }
          continue;
        }

        if (fm.statusState !== 'live' && fm.ccode !== 'INT' && fm.ccode !== 'ESP' && fm.ccode !== 'EUR') {
          continue;
        }
        const pseudoLeague: SoccerLeagueFeedDef = {
          slug: `fotmob.${fm.leagueId}`,
          regionName: getFotmobRegionLabel(fm.ccode),
          leagueName: fm.leagueName,
          regionFlagUrl: fm.regionFlagUrl,
          priority: fm.statusState === 'live' ? 11 : 28,
          broadcasterProfile: fm.ccode === 'ESP' ? 'laliga' : fm.ccode === 'INT' ? 'spain_nt' : 'europe',
        };
        const channels = buildFootballMatchChannels({
          matchId: `fb-fm-${fm.fotmobId}`,
          homeTeam: fm.homeName,
          awayTeam: fm.awayName,
          statusState: fm.statusState,
          league: pseudoLeague,
          scrapedMatches,
          kickoffMs: fm.kickoffMs,
        });

        items.push({
          id: `fb-fm-${fm.fotmobId}`,
          eventId: fm.fotmobId,
          fotmobMatchId: fm.fotmobId,
          leagueSlug: pseudoLeague.slug,
          regionName: pseudoLeague.regionName,
          leagueName: fm.leagueName,
          groupTitle: `${pseudoLeague.regionName}: ${fm.leagueName}`,
          regionFlagUrl: fm.regionFlagUrl,
          priority: pseudoLeague.priority,
          kickoffIso: fm.utcTime || new Date().toISOString(),
          kickoffTime: fm.kickoffTime,
          kickoffMs: fm.kickoffMs,
          statusState: fm.statusState,
          statusLabel: fm.statusLabel,
          matchdayLabel: fm.leagueName || 'Fútbol en Directo',
          spanishBroadcaster: resolveMatchSpanishBroadcaster(pseudoLeague.slug, pseudoLeague.leagueName),
          homeTeam: fm.homeName,
          awayTeam: fm.awayName,
          homeShort: fm.homeName.slice(0, 3).toUpperCase(),
          awayShort: fm.awayName.slice(0, 3).toUpperCase(),
          homeLogo: fm.homeLogo,
          awayLogo: fm.awayLogo,
          homeScore: fm.homeScore,
          awayScore: fm.awayScore,
          homeRedCards: fm.homeRedCards,
          awayRedCards: fm.awayRedCards,
          channels,
        });
      }

      items.sort((a, b) => {
        const rank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
        if (rank(a.statusState) !== rank(b.statusState)) {
          return rank(a.statusState) - rank(b.statusState);
        }
        const aFeat = isFeaturedSpanishClubMatch(a.homeTeam, a.awayTeam) ? 0 : 1;
        const bFeat = isFeaturedSpanishClubMatch(b.homeTeam, b.awayTeam) ? 0 : 1;
        if (aFeat !== bFeat) return aFeat - bFeat;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.kickoffMs - b.kickoffMs;
      });

      cachedFootballBoard = { dateKey, matches: items, ts: Date.now() };
      const prioritizedItems = items.map((m) => ({
        ...m,
        channels: orderBoardChannels(m.channels || [], m.leagueSlug),
      }));
      res.json({ success: true, dateKey, matches: prioritizedItems });
    } catch (err) {
      console.warn('Football matchboard fetch error:', err);
      const fallbackItems = (cachedFootballBoard?.matches || []).map((m: any) => ({
        ...m,
        channels: orderBoardChannels(m.channels || [], m.leagueSlug),
      }));
      res.json({ success: true, dateKey, matches: fallbackItems });
    }
  });

  app.get('/api/sports/match-details', async (req, res) => {
    const eventId = String(req.query.eventId || '').trim();
    const fotmobMatchId = String(req.query.fotmobMatchId || '').trim();
    const leagueSlug = String(req.query.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
    const homeTeam = String(req.query.homeTeam || '').trim();
    const awayTeam = String(req.query.awayTeam || '').trim();
    const dateKey = String(req.query.date || '').replace(/\D/g, '').slice(0, 8);

    if (!eventId && !fotmobMatchId && !(homeTeam && awayTeam)) {
      return res.status(400).json({ success: false, error: 'Missing eventId or team info' });
    }

    try {
      const details = await fetchRealFootballMatchDetails({
        eventId,
        fotmobMatchId,
        leagueSlug,
        homeTeam,
        awayTeam,
        dateKey: dateKey || undefined,
      });
      res.json({ success: true, details });
    } catch (err) {
      console.warn('Match details error:', err);
      res.json({
        success: true,
        details: { eventId: eventId || fotmobMatchId, stats: [], events: [], commentary: [], shotsMap: [] },
      });
    }
  });
}
