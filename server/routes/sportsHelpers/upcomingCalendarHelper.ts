import { LruTtlCache } from '../../utils/lruCache.ts';
import { SOCCER_BOARD_LEAGUES, type SoccerLeagueFeedDef } from './sportsChannels247.ts';
import {
  buildFootballMatchChannels,
  buildVerifiedTvGuideSummary,
  resolveVerifiedSpanishBroadcasterBadge,
  resolveTeamBadgeUrl,
} from './footballTeamMatcher.ts';
import {
  areFixturesCompatibleForMerge,
  fetchFotmobDayIndex,
} from '../../services/footballLiveService.ts';
import {
  ensureEpgScheduleReady,
  extractEspnCompBroadcastNames,
  runWithConcurrency,
  verifySingleFixtureTvSchedule,
} from '../../services/tvScheduleVerifier.ts';

export type CalendarScopeMode =
  | { kind: 'league'; key: string; slug: string }
  | { kind: 'team'; key: string; teamIds: string[] };

const extendedCalendarCache = new LruTtlCache<string, any[]>(40, 5 * 60 * 1000);

const MADRID_TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const MADRID_DATE_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
});

const MADRID_SHORT_DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

export function getMadridDateKey(d: Date = new Date()): string {
  return MADRID_DATE_KEY_FMT.format(d).replace(/-/g, '');
}

export function formatMadridDateLabel(kickoffDate: Date, todayKey = getMadridDateKey()): string {
  if (Number.isNaN(kickoffDate.getTime())) return '';
  const matchKey = getMadridDateKey(kickoffDate);
  if (matchKey === todayKey) return 'Hoy';
  const todayNoonUtc = Date.parse(`${todayKey.slice(0, 4)}-${todayKey.slice(4, 6)}-${todayKey.slice(6, 8)}T12:00:00Z`);
  const tomorrowKey = Number.isNaN(todayNoonUtc)
    ? getMadridDateKey(new Date(Date.now() + 86_400_000))
    : getMadridDateKey(new Date(todayNoonUtc + 86_400_000));
  if (matchKey === tomorrowKey) return 'Mañana';
  const raw = MADRID_SHORT_DATE_FMT.format(kickoffDate).replace(/\./g, '');
  return raw.replace(/\s+/g, ' ').trim();
}

function normQuery(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function resolveCalendarScopeMode(params: {
  calendar?: string;
  league?: string;
  team?: string;
}): CalendarScopeMode | null {
  const cal = normQuery(params.calendar || '');
  const lg = normQuery(params.league || '');
  const tm = normQuery(params.team || '');
  const combined = [cal, lg, tm].filter(Boolean).join(' ');
  if (!combined) return null;

  if (
    combined.includes('barca_madrid') ||
    combined.includes('barca madrid') ||
    combined.includes('clasico') ||
    (combined.includes('barc') && combined.includes('madrid'))
  ) {
    return { kind: 'team', key: 'barca_madrid', teamIds: ['83', '86'] };
  }
  if (
    /\b(espana|spain|seleccion|seleccion espanola|la roja)\b/.test(combined) &&
    !combined.includes('espanyol')
  ) {
    return { kind: 'team', key: 'espana', teamIds: ['164'] };
  }
  if (combined.includes('barcelona') || combined === 'barca') {
    return { kind: 'team', key: 'barcelona', teamIds: ['83'] };
  }
  if (combined.includes('real_madrid') || combined.includes('real madrid')) {
    return { kind: 'team', key: 'real_madrid', teamIds: ['86'] };
  }

  if (combined.includes('champions') || combined === 'uefa.champions') {
    return { kind: 'league', key: 'champions', slug: 'uefa.champions' };
  }
  if (combined.includes('europa') || combined === 'uefa.europa') {
    return { kind: 'league', key: 'europa', slug: 'uefa.europa' };
  }
  if (combined.includes('hypermotion') || combined === 'esp.2') {
    return { kind: 'league', key: 'hypermotion', slug: 'esp.2' };
  }
  if (combined.includes('laliga') || combined === 'esp.1') {
    return { kind: 'league', key: 'laliga', slug: 'esp.1' };
  }
  if (combined.includes('premier') || combined === 'eng.1') {
    return { kind: 'league', key: 'premier', slug: 'eng.1' };
  }
  if (combined.includes('serie a') || combined.includes('seriea') || combined === 'ita.1') {
    return { kind: 'league', key: 'seriea', slug: 'ita.1' };
  }
  if (combined.includes('bundesliga') || combined === 'ger.1') {
    return { kind: 'league', key: 'bundesliga', slug: 'ger.1' };
  }
  if (combined.includes('nations') || combined === 'uefa.nations') {
    return { kind: 'league', key: 'nations', slug: 'uefa.nations' };
  }
  if (combined === 'world' || combined.includes('mundial') || combined === 'fifa.world') {
    return { kind: 'league', key: 'world', slug: 'fifa.world' };
  }

  return null;
}

function findLeagueMeta(slug: string, fallbackName?: string): SoccerLeagueFeedDef {
  const lower = String(slug || '').toLowerCase();
  const known = SOCCER_BOARD_LEAGUES.find((l) => l.slug.toLowerCase() === lower);
  if (known) return known;
  return {
    slug: lower || 'soccer.all',
    regionName: lower.startsWith('esp.')
      ? 'España'
      : lower.startsWith('uefa.')
        ? 'Europa'
        : lower.startsWith('eng.')
          ? 'Inglaterra'
          : lower.startsWith('fifa.')
            ? 'Internacional'
            : 'Fútbol',
    leagueName: fallbackName || 'Competición',
    regionFlagUrl: lower.startsWith('esp.')
      ? 'https://flagcdn.com/w40/es.png'
      : lower.startsWith('eng.')
        ? 'https://flagcdn.com/w40/gb-eng.png'
        : lower.startsWith('fifa.')
          ? 'https://flagcdn.com/w40/un.png'
          : 'https://flagcdn.com/w40/eu.png',
    priority: lower.startsWith('fifa.') || lower.startsWith('uefa.nations') ? 3 : 12,
    broadcasterProfile: lower.startsWith('esp.')
      ? 'laliga'
      : lower.startsWith('fifa.') || lower.startsWith('uefa.nations')
        ? 'spain_nt'
        : 'europe',
  };
}

export function formatSpanishMatchdayLabel(rawRound: unknown, _leagueSlug?: string): string | undefined {
  const txt = String(rawRound ?? '').trim();
  if (!txt) return undefined;
  if (/^\d+$/.test(txt)) return `Jornada ${txt}`;
  if (/league phase|fase de liga/i.test(txt)) return 'Fase de Liga';
  if (/round of 16|octavos/i.test(txt)) return 'Octavos';
  if (/quarterfinal|cuartos/i.test(txt)) return 'Cuartos';
  if (/semifinal|semifinales/i.test(txt)) return 'Semifinales';
  if (/^final$/i.test(txt)) return 'Final';
  if (/knockout.*playoff|playoffs/i.test(txt)) return 'Playoffs';
  if (/group stage|fase de grupos/i.test(txt)) return 'Fase de Grupos';
  return undefined;
}

export function translateFootballStatusLabel(rawStatus: string, state: 'live' | 'upcoming' | 'finished'): string {
  const s = String(rawStatus || '').trim();
  if (state === 'live') {
    if (/^(ht|half-time|half time)$/i.test(s)) return 'Descanso';
    return s || 'EN VIVO';
  }
  if (state === 'finished') {
    if (/pen/i.test(s)) return 'Penaltis';
    if (/aet/i.test(s)) return 'Prórroga';
    return 'Final';
  }
  if (/postponed/i.test(s)) return 'Aplazado';
  if (/cancel/i.test(s)) return 'Cancelado';
  if (/suspend|abandon/i.test(s)) return 'Suspendido';
  if (/tbd/i.test(s)) return 'Por confirmar';
  return 'Por empezar';
}

function mapEspnEventToBoardItem(
  ev: any,
  leagueDef: SoccerLeagueFeedDef,
  scrapedMatches: any[],
  todayKey: string,
  espnLeagueLogo?: string
) {
  const eventId = String(ev?.id || '').trim();
  const comp = ev?.competitions?.[0];
  const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  if (!eventId || !home || !away) return null;

  const kickoffDate = ev?.date ? new Date(ev.date) : new Date();
  const kickoffTime = Number.isNaN(kickoffDate.getTime())
    ? '20:45'
    : MADRID_TIME_FMT.format(kickoffDate);
  const kickoffDateLabel = formatMadridDateLabel(kickoffDate, todayKey);

  const stType = comp?.status?.type || ev?.status?.type || {};
  const rawState = String(stType?.state || '').toLowerCase();
  const statusName = String(stType?.name || '');
  const statusState: 'live' | 'upcoming' | 'finished' =
    rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';

  const rawLiveClock = String(
    comp?.status?.displayClock || ev?.status?.displayClock || stType?.shortDetail || ''
  ).trim();
  const statusLabel =
    statusState === 'live'
      ? translateFootballStatusLabel(statusName.includes('HALFTIME') ? 'HT' : rawLiveClock, 'live')
      : translateFootballStatusLabel(statusName || stType?.shortDetail || '', statusState);

  const homeTeam = String(home.team?.shortDisplayName || home.team?.displayName || 'Local').trim();
  const awayTeam = String(away.team?.shortDisplayName || away.team?.displayName || 'Visitante').trim();
  const isInternational =
    leagueDef.slug.startsWith('uefa.nations') ||
    leagueDef.slug.startsWith('uefa.euro') ||
    leagueDef.slug.startsWith('fifa.');

  const kickoffMs = kickoffDate.getTime() || 0;
  const espnBroadcasts = extractEspnCompBroadcastNames(comp);

  const matchdayLabel = formatSpanishMatchdayLabel(
    comp?.round?.number ?? comp?.notes?.[0]?.text,
    leagueDef.slug
  );

  return {
    id: `fb-${eventId}`,
    eventId,
    leagueSlug: leagueDef.slug,
    regionName: leagueDef.regionName,
    leagueName: leagueDef.leagueName,
    groupTitle: `${leagueDef.regionName}: ${leagueDef.leagueName}`,
    regionFlagUrl: leagueDef.regionFlagUrl,
    leagueLogoUrl: espnLeagueLogo,
    priority: leagueDef.priority,
    kickoffIso: kickoffDate.toISOString(),
    kickoffTime,
    kickoffMs,
    kickoffDateLabel,
    statusState,
    statusLabel,
    matchdayLabel,
    spanishBroadcaster: null as ReturnType<typeof resolveVerifiedSpanishBroadcasterBadge>,
    verifiedTvGuide: { checked: false } as ReturnType<typeof buildVerifiedTvGuideSummary>,
    homeTeam,
    awayTeam,
    homeShort: String(home.team?.abbreviation || homeTeam.slice(0, 3)).toUpperCase(),
    awayShort: String(away.team?.abbreviation || awayTeam.slice(0, 3)).toUpperCase(),
    homeLogo: resolveTeamBadgeUrl(home.team, isInternational),
    awayLogo: resolveTeamBadgeUrl(away.team, isInternational),
    homeScore: statusState === 'upcoming' ? '-' : String(home.score?.displayValue ?? home.score ?? '0'),
    awayScore: statusState === 'upcoming' ? '-' : String(away.score?.displayValue ?? away.score ?? '0'),
    homeRedCards: 0,
    awayRedCards: 0,
    channels: [] as ReturnType<typeof buildFootballMatchChannels>,
    _leagueDef: leagueDef,
    _espnBroadcasts: espnBroadcasts,
  };
}

async function fetchJsonSafe(url: string, timeoutMs = 4500): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchExtendedFootballCalendar(
  scope: CalendarScopeMode,
  scrapedMatches: any[]
): Promise<any[]> {
  const todayKey = getMadridDateKey();
  const cacheKey = `${scope.key}:${todayKey}`;
  const cached = extendedCalendarCache.get(cacheKey);
  if (cached) return cached;

  await ensureEpgScheduleReady(3500);

  const itemsMap = new Map<string, any>();
  const yesterdayKey = getMadridDateKey(new Date(Date.now() - 86_400_000));

  if (scope.kind === 'team') {
    const reqs = scope.teamIds.flatMap((teamId) => {
      const base = [
        fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule?fixture=true&lang=es&region=es`),
        fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${teamId}/schedule?lang=es&region=es`),
      ];
      if (teamId === '164') {
        base.push(
          fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/teams/164/schedule?lang=es&region=es`),
          fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.uefa/teams/164/schedule?lang=es&region=es`),
          fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/164/schedule?lang=es&region=es`),
          fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/teams/164/schedule?lang=es&region=es`)
        );
      }
      return base;
    });
    const results = await Promise.all(reqs);

    for (const json of results) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      for (const ev of events) {
        const eventId = String(ev?.id || '').trim();
        if (!eventId || itemsMap.has(eventId)) continue;

        const defaultSlug = scope.key === 'espana' ? 'uefa.nations' : 'esp.1';
        const leagueSlug = String(ev?.league?.slug || defaultSlug).toLowerCase();
        const leagueMeta = findLeagueMeta(
          leagueSlug,
          ev?.league?.shortName || ev?.league?.name
        );
        const mapped = mapEspnEventToBoardItem(ev, leagueMeta, scrapedMatches, todayKey);
        if (!mapped) continue;

        // Keep live, upcoming, today's finished fixtures, or full-season Spain NT fixtures when between FIFA windows
        const evDateKey = mapped.kickoffMs ? getMadridDateKey(new Date(mapped.kickoffMs)) : todayKey;
        const allowSeasonHistory = scope.key === 'espana' && evDateKey >= '20260101';
        if (mapped.statusState === 'finished' && evDateKey < todayKey && !allowSeasonHistory) {
          continue;
        }
        itemsMap.set(eventId, mapped);
      }
    }
  } else {
    const leagueMeta = findLeagueMeta(scope.slug);
    const nowYear = new Date().getUTCFullYear();
    const [wlCurr, wlNext, defaultBoard] = await Promise.all([
      fetchJsonSafe(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${scope.slug}/calendar/whitelist?dates=${nowYear}`),
      fetchJsonSafe(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${scope.slug}/calendar/whitelist?dates=${nowYear + 1}`),
      fetchJsonSafe(`https://site.api.espn.com/apis/site/v2/sports/soccer/${scope.slug}/scoreboard?lang=es&region=es`),
    ]);

    const dateKeySet = new Set<string>();
    const rawWhitelist: string[] = [
      ...(Array.isArray(wlCurr?.eventDate?.dates) ? wlCurr.eventDate.dates : []),
      ...(Array.isArray(wlNext?.eventDate?.dates) ? wlNext.eventDate.dates : []),
    ];
    for (const iso of rawWhitelist) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) continue;
      const k = getMadridDateKey(d);
      if (k >= yesterdayKey) dateKeySet.add(k);
    }

    const fallbackCal = Array.isArray(defaultBoard?.leagues?.[0]?.calendar)
      ? defaultBoard.leagues[0].calendar
      : [];
    for (const entry of fallbackCal) {
      if (typeof entry === 'string') {
        const d = new Date(entry);
        if (!Number.isNaN(d.getTime())) {
          const k = getMadridDateKey(d);
          if (k >= yesterdayKey) dateKeySet.add(k);
        }
      }
    }

    if (dateKeySet.size === 0) {
      for (let dOffset = 0; dOffset <= 21; dOffset++) {
        dateKeySet.add(getMadridDateKey(new Date(Date.now() + dOffset * 86_400_000)));
      }
    }

    // Fetch up to 45 upcoming/season matchdays in clean batches of 15 for full-season coverage
    const upcomingKeys = Array.from(dateKeySet).sort().slice(0, 45);
    const scoreboards: any[] = [defaultBoard];
    for (let i = 0; i < upcomingKeys.length; i += 15) {
      const chunk = upcomingKeys.slice(i, i + 15);
      const batch = await Promise.all(
        chunk.map((dk) =>
          fetchJsonSafe(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${scope.slug}/scoreboard?dates=${dk}&lang=es&region=es`
          )
        )
      );
      scoreboards.push(...batch);
    }

    for (const board of scoreboards) {
      const espnLeagueLogo = String(board?.leagues?.[0]?.logos?.[0]?.href || '').trim() || undefined;
      const events: any[] = Array.isArray(board?.events) ? board.events : [];
      for (const ev of events) {
        const eventId = String(ev?.id || '').trim();
        if (!eventId || itemsMap.has(eventId)) continue;
        const mapped = mapEspnEventToBoardItem(ev, leagueMeta, scrapedMatches, todayKey, espnLeagueLogo);
        if (!mapped) continue;
        const evDateKey = mapped.kickoffMs ? getMadridDateKey(new Date(mapped.kickoffMs)) : todayKey;
        if (mapped.statusState === 'finished' && evDateKey < todayKey) continue;
        itemsMap.set(eventId, mapped);
      }
    }
  }

  const rawList = Array.from(itemsMap.values()).sort((a, b) => {
    const rank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
    if (rank(a.statusState) !== rank(b.statusState)) {
      return rank(a.statusState) - rank(b.statusState);
    }
    if (a.statusState === 'finished') {
      return (b.kickoffMs || 0) - (a.kickoffMs || 0);
    }
    return (a.kickoffMs || 0) - (b.kickoffMs || 0);
  });

  // Verify real TV programming ONLY for active/near-term fixtures (next 10 days)
  const nearTermItems = rawList.filter((it) => {
    if (it.statusState === 'finished') return false;
    const diffDays = it.kickoffMs ? (it.kickoffMs - Date.now()) / 86_400_000 : 0;
    return diffDays >= -1 && diffDays <= 10;
  });

  if (nearTermItems.length > 0) {
    const nearDates = Array.from(
      new Set(nearTermItems.map((it) => getMadridDateKey(new Date(it.kickoffMs || Date.now()))))
    ).slice(0, 8);
    const fotmobByDate = new Map<string, Awaited<ReturnType<typeof fetchFotmobDayIndex>>>();
    await Promise.all(
      nearDates.map(async (dk) => {
        const list = await fetchFotmobDayIndex(dk).catch(() => []);
        fotmobByDate.set(dk, list);
      })
    );

    await runWithConcurrency(nearTermItems, 8, async (it) => {
      const dk = getMadridDateKey(new Date(it.kickoffMs || Date.now()));
      const dayMatches = fotmobByDate.get(dk) || [];
      const fm = dayMatches.find((m) =>
        areFixturesCompatibleForMerge(
          {
            homeTeam: it.homeTeam,
            awayTeam: it.awayTeam,
            kickoffMs: it.kickoffMs,
            leagueContext: `${it.leagueSlug} ${it.leagueName}`,
          },
          {
            homeTeam: m.homeName,
            awayTeam: m.awayName,
            kickoffMs: m.kickoffMs,
            leagueContext: `${m.leagueId} ${m.leagueName}`,
          }
        )
      );
      if (fm?.fotmobId) {
        it.fotmobMatchId = fm.fotmobId;
        if (!it.homeLogo && fm.homeLogo) it.homeLogo = fm.homeLogo;
        if (!it.awayLogo && fm.awayLogo) it.awayLogo = fm.awayLogo;
      }
      const verifiedSchedule = await verifySingleFixtureTvSchedule({
        homeTeam: it.homeTeam,
        awayTeam: it.awayTeam,
        kickoffMs: it.kickoffMs,
        fotmobMatchId: it.fotmobMatchId,
        espnBroadcasts: it._espnBroadcasts,
        queryExternalListings: true,
      });
      it.spanishBroadcaster = resolveVerifiedSpanishBroadcasterBadge(verifiedSchedule);
      it.verifiedTvGuide = buildVerifiedTvGuideSummary(verifiedSchedule);
      it.channels = buildFootballMatchChannels({
        matchId: it.id,
        homeTeam: it.homeTeam,
        awayTeam: it.awayTeam,
        statusState: it.statusState,
        league: it._leagueDef,
        scrapedMatches,
        kickoffMs: it.kickoffMs,
        verifiedSchedule,
      });
    });
  }

  const list = rawList.map((it) => {
    const clean = { ...it };
    delete clean._leagueDef;
    delete clean._espnBroadcasts;
    return clean;
  });

  if (list.length > 0) {
    extendedCalendarCache.set(cacheKey, list);
  }
  return list;
}
